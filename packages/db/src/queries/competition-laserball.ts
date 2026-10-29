// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Laserball competitions (`competition.game_type = 'lb'`). Teams, rosters, rounds, pools,
 * matches and adjustments are the shared competition tables; what differs is how a match is
 * played. An SM5 match is two `competition_match_game` rows. A Laserball match is one
 * `lb_match` — its halves, already linked with their side assignments — pointed at the slot
 * it fills by `lb_match.competition_match_id`. Side 1 is always the slot's team 1.
 *
 * Scoring lives in lib/lb-match-points.ts. See docs/Competition_Structure.md, "Laserball
 * Competitions".
 */

import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import {
  center,
  competition,
  competitionMatch,
  competitionRound,
  competitionTeam,
  competitionTeamPlayer,
  game,
  lbGameTeam,
  lbMatch,
  lbMatchGame,
  lbScorecard,
  player,
} from "../schema";
import {
  applyLbTeamAdjustments,
  computeLbTeamStats,
  emptyLbTeamStats,
  lbMatchOutcome,
  sortLbStandings,
  type LbMatchOutcome,
  type LbStandingsHalfRow,
  type LbTeamStats,
} from "../lib/lb-match-points";
import { getTeamLogoUrl } from "../lib/team-logos";
import { getCompetitionTeamAdjustments, type CompetitionRoundType } from "./competition-tournament";
import { linkLbMatch } from "./lb-match";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

export type LbCompetitionMutationResult = { ok: true } | { ok: false; error: string };

const side1Team = alias(lbGameTeam, "side1_team");
const side2Team = alias(lbGameTeam, "side2_team");

const gameSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type LbCompetitionStandingsRow = LbTeamStats & {
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamShortName: string | null;
  teamHasLogo: boolean;
  teamLogoVersion: number;
  goalDifference: number;
};

/**
 * Every linked, non-excluded half of every assigned match: the standings' input. Like SM5,
 * finals rounds are left out unless a round is asked for by id.
 */
async function getLbStandingsHalves(
  competitionId: string,
  roundId?: string,
): Promise<LbStandingsHalfRow[]> {
  return db
    .select({
      competitionMatchId: competitionMatch.id,
      roundMultiplier: competitionRound.multiplier,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      half: lbMatchGame.half,
      team1Goals: sql<number>`coalesce(${side1Team.score}, 0)`,
      team2Goals: sql<number>`coalesce(${side2Team.score}, 0)`,
    })
    .from(lbMatchGame)
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, lbMatch.competitionMatchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, lbMatchGame.gameId))
    .innerJoin(side1Team, eq(side1Team.id, lbMatchGame.side1GameTeamId))
    .innerJoin(side2Team, eq(side2Team.id, lbMatchGame.side2GameTeamId))
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        // An excluded half left linked counts as not yet reported.
        eq(game.exclude, false),
        roundId ? eq(competitionMatch.roundId, roundId) : ne(competitionRound.type, "finals"),
      ),
    );
}

export async function getLbCompetitionStandings(
  competitionId: string,
  roundId?: string,
): Promise<LbCompetitionStandingsRow[]> {
  const [halves, teams] = await Promise.all([
    getLbStandingsHalves(competitionId, roundId),
    db
      .select({
        id: competitionTeam.id,
        name: competitionTeam.name,
        slug: competitionTeam.slug,
        shortName: competitionTeam.shortName,
        hasLogo: competitionTeam.hasLogo,
        logoVersion: competitionTeam.logoVersion,
      })
      .from(competitionTeam)
      .where(eq(competitionTeam.competitionId, competitionId)),
  ]);

  const stats = computeLbTeamStats(halves);
  // Adjustments belong to no round, so they count on the whole-competition standings only.
  if (!roundId) {
    applyLbTeamAdjustments(stats, await getCompetitionTeamAdjustments(competitionId));
  }

  const rows = teams.map((t) => {
    const s = stats.get(t.id) ?? emptyLbTeamStats();
    return {
      teamId: t.id,
      teamName: t.name,
      teamSlug: t.slug,
      teamShortName: t.shortName,
      teamHasLogo: t.hasLogo,
      teamLogoVersion: t.logoVersion,
      ...s,
      goalDifference: s.goalsFor - s.goalsAgainst,
    };
  });
  return sortLbStandings(rows, halves);
}

/** The public standings API's rows: the standings with each team's logo as a URL. */
export type LbCompetitionStandingsApiRow = Omit<
  LbCompetitionStandingsRow,
  "teamHasLogo" | "teamLogoVersion"
> & { teamLogoUrl: string | null };

export async function getLbCompetitionStandingsData(
  competitionId: string,
): Promise<LbCompetitionStandingsApiRow[]> {
  const rows = await getLbCompetitionStandings(competitionId);
  return rows.map(({ teamHasLogo, teamLogoVersion, ...row }) => ({
    ...row,
    teamLogoUrl: teamHasLogo ? getTeamLogoUrl(row.teamId, teamLogoVersion) : null,
  }));
}

// ---------------------------------------------------------------------------
// Match results
// ---------------------------------------------------------------------------

export type LbCompetitionMatchTeam = {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
};

export type LbCompetitionMatchHalf = {
  half: number;
  gameId: string;
  gameSlug: string;
  startTime: Date;
  excluded: boolean;
  team1Goals: number;
  team2Goals: number;
  team1ColourEnum: number;
  team2ColourEnum: number;
};

export type LbCompetitionMatchResult = {
  matchId: string;
  roundId: string;
  roundName: string;
  roundNumber: number;
  roundType: CompetitionRoundType;
  roundMultiplier: number;
  matchNumber: number;
  team1: LbCompetitionMatchTeam | null;
  team2: LbCompetitionMatchTeam | null;
  lbMatchId: string | null;
  halves: LbCompetitionMatchHalf[]; // ordered by half
  outcome: LbMatchOutcome;
};

/**
 * Every match in the competition, scheduled or played, with its halves and result — for the
 * standings page's match list, the finals tab and a team's page. Excluded halves are listed but
 * left out of the result, as in the standings.
 */
export async function getLbCompetitionMatchResults(
  competitionId: string,
  options: { roundId?: string; teamId?: string; matchId?: string } = {},
): Promise<LbCompetitionMatchResult[]> {
  const [comp] = await db
    .select({ state: competition.state })
    .from(competition)
    .where(eq(competition.id, competitionId));
  if (!comp) return [];

  const matches = await db
    .select({
      matchId: competitionMatch.id,
      roundId: competitionRound.id,
      roundName: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      roundType: competitionRound.type,
      roundMultiplier: competitionRound.multiplier,
      matchNumber: competitionMatch.matchNumber,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      lbMatchId: lbMatch.id,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .leftJoin(lbMatch, eq(lbMatch.competitionMatchId, competitionMatch.id))
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        options.roundId ? eq(competitionMatch.roundId, options.roundId) : undefined,
        options.matchId ? eq(competitionMatch.id, options.matchId) : undefined,
        options.teamId
          ? sql`${options.teamId}::uuid in (${competitionMatch.team1Id}, ${competitionMatch.team2Id})`
          : undefined,
      ),
    )
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));
  if (matches.length === 0) return [];

  const teamIds = [
    ...new Set(matches.flatMap((m) => [m.team1Id, m.team2Id]).filter((id) => id !== null)),
  ];
  const lbMatchIds = matches.map((m) => m.lbMatchId).filter((id) => id !== null);
  const [teams, halves] = await Promise.all([
    teamIds.length
      ? db
          .select({
            id: competitionTeam.id,
            name: competitionTeam.name,
            slug: competitionTeam.slug,
            shortName: competitionTeam.shortName,
            hasLogo: competitionTeam.hasLogo,
            logoVersion: competitionTeam.logoVersion,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [],
    lbMatchIds.length ? getLbHalves(lbMatchIds) : [],
  ]);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const halvesByMatch = new Map<string, LbCompetitionMatchHalf[]>();
  for (const { lbMatchId, ...h } of halves) {
    halvesByMatch.set(lbMatchId, [...(halvesByMatch.get(lbMatchId) ?? []), h]);
  }

  return matches.map((m) => {
    const matchHalves = m.lbMatchId ? (halvesByMatch.get(m.lbMatchId) ?? []) : [];
    return {
      matchId: m.matchId,
      roundId: m.roundId,
      roundName: m.roundName,
      roundNumber: m.roundNumber,
      roundType: m.roundType,
      roundMultiplier: m.roundMultiplier,
      matchNumber: m.matchNumber,
      team1: m.team1Id ? (teamById.get(m.team1Id) ?? null) : null,
      team2: m.team2Id ? (teamById.get(m.team2Id) ?? null) : null,
      lbMatchId: m.lbMatchId,
      halves: matchHalves,
      outcome: lbMatchOutcome(
        matchHalves.filter((h) => !h.excluded),
        comp.state === "completed",
      ),
    };
  });
}

async function getLbHalves(
  lbMatchIds: string[],
): Promise<(LbCompetitionMatchHalf & { lbMatchId: string })[]> {
  return db
    .select({
      lbMatchId: lbMatchGame.matchId,
      half: lbMatchGame.half,
      gameId: game.id,
      gameSlug: gameSlugSql,
      startTime: game.startTime,
      excluded: game.exclude,
      team1Goals: sql<number>`coalesce(${side1Team.score}, 0)`,
      team2Goals: sql<number>`coalesce(${side2Team.score}, 0)`,
      team1ColourEnum: side1Team.colourEnum,
      team2ColourEnum: side2Team.colourEnum,
    })
    .from(lbMatchGame)
    .innerJoin(game, eq(game.id, lbMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(side1Team, eq(side1Team.id, lbMatchGame.side1GameTeamId))
    .innerJoin(side2Team, eq(side2Team.id, lbMatchGame.side2GameTeamId))
    .where(inArray(lbMatchGame.matchId, lbMatchIds))
    .orderBy(asc(lbMatchGame.half));
}

/** The competition match a Laserball game's lb_match fills, for the game page's label. */
export type LbGameCompetitionMatch = {
  competitionMatchId: string;
  competitionSlug: string;
  competitionName: string;
  roundName: string;
  matchNumber: number;
  half: number;
  team1Name: string | null;
  team2Name: string | null;
};

export async function getLbGameCompetitionMatch(
  gameId: string,
): Promise<LbGameCompetitionMatch | null> {
  const team1 = alias(competitionTeam, "team1");
  const team2 = alias(competitionTeam, "team2");
  const [row] = await db
    .select({
      competitionMatchId: competitionMatch.id,
      competitionSlug: competition.slug,
      competitionName: competition.name,
      roundName: competitionRound.name,
      matchNumber: competitionMatch.matchNumber,
      half: lbMatchGame.half,
      team1Name: team1.name,
      team2Name: team2.name,
    })
    .from(lbMatchGame)
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, lbMatch.competitionMatchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(competition, eq(competition.id, competitionMatch.competitionId))
    .leftJoin(team1, eq(team1.id, competitionMatch.team1Id))
    .leftJoin(team2, eq(team2.id, competitionMatch.team2Id))
    .where(eq(lbMatchGame.gameId, gameId));
  return row ?? null;
}

/** The competition a Laserball game is filed in, for the game page's admin controls. */
export async function getLbGameCompetition(
  gameId: string,
): Promise<{ competitionId: string; competitionName: string } | null> {
  const [row] = await db
    .select({ competitionId: competition.id, competitionName: competition.name })
    .from(game)
    .innerJoin(competition, eq(competition.id, game.competitionId))
    .where(eq(game.id, gameId));
  return row ?? null;
}

export type LbOpenCompetitionMatch = {
  id: string;
  roundName: string;
  matchNumber: number;
  team1Name: string;
  team2Name: string;
};

/** Match slots with both teams set and no halves yet — where a linked lb_match can go. */
export async function getOpenLbCompetitionMatches(
  competitionId: string,
): Promise<LbOpenCompetitionMatch[]> {
  const team1 = alias(competitionTeam, "team1");
  const team2 = alias(competitionTeam, "team2");
  return db
    .select({
      id: competitionMatch.id,
      roundName: competitionRound.name,
      matchNumber: competitionMatch.matchNumber,
      team1Name: team1.name,
      team2Name: team2.name,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(team1, eq(team1.id, competitionMatch.team1Id))
    .innerJoin(team2, eq(team2.id, competitionMatch.team2Id))
    .leftJoin(lbMatch, eq(lbMatch.competitionMatchId, competitionMatch.id))
    .where(and(eq(competitionMatch.competitionId, competitionId), isNull(lbMatch.id)))
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));
}

// ---------------------------------------------------------------------------
// Player stats
// ---------------------------------------------------------------------------

export type LbCompetitionPlayerStat = {
  playerId: string;
  iplId: string;
  callsign: string;
  teamId: string;
  teamName: string;
  teamSlug: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  steals: number;
  blocks: number;
  passes: number;
  clears: number;
  possessionMs: number;
};

/**
 * Per-player totals over the competition's assigned halves, finals included. A player counts
 * for the team they are rostered on; mercenary scorecards are left out, as on SM5 competition
 * pages. Optionally narrowed to one team.
 */
export async function getLbCompetitionPlayerStats(
  competitionId: string,
  teamId?: string,
): Promise<LbCompetitionPlayerStat[]> {
  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      teamId: competitionTeam.id,
      teamName: competitionTeam.name,
      teamSlug: competitionTeam.slug,
      gamesPlayed: sql<number>`count(*)::int`,
      goals: sql<number>`sum(${lbScorecard.goals})::int`,
      assists: sql<number>`sum(${lbScorecard.assists1} + ${lbScorecard.assists2})::int`,
      steals: sql<number>`sum(${lbScorecard.stealsDone})::int`,
      blocks: sql<number>`sum(${lbScorecard.blocksDone})::int`,
      passes: sql<number>`sum(${lbScorecard.passesDone})::int`,
      clears: sql<number>`sum(${lbScorecard.clearsDone})::int`,
      possessionMs: sql<number>`sum(${lbScorecard.possessionTimeMs})::int`,
    })
    .from(lbScorecard)
    .innerJoin(game, eq(game.id, lbScorecard.gameId))
    .innerJoin(lbMatchGame, eq(lbMatchGame.gameId, game.id))
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, lbMatch.competitionMatchId))
    .innerJoin(player, eq(player.id, lbScorecard.playerId))
    // The team the scorecard was on, through the side it played as.
    .innerJoin(
      competitionTeam,
      sql`${competitionTeam.id} = case when ${lbScorecard.teamId} = ${lbMatchGame.side1GameTeamId}
                                       then ${competitionMatch.team1Id}
                                       else ${competitionMatch.team2Id} end`,
    )
    .innerJoin(
      competitionTeamPlayer,
      and(
        eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
        eq(competitionTeamPlayer.playerId, player.id),
      ),
    )
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        eq(game.exclude, false),
        eq(lbScorecard.isMercenary, false),
        teamId ? eq(competitionTeam.id, teamId) : undefined,
      ),
    )
    .groupBy(player.id, competitionTeam.id)
    .orderBy(sql`sum(${lbScorecard.goals}) desc`, asc(player.currentCallsign));
  return rows;
}

// ---------------------------------------------------------------------------
// Admin: assigning lb_matches to competition matches
// ---------------------------------------------------------------------------

export type LbAssignableSide = {
  gameTeamId: string;
  name: string;
  colourEnum: number;
  score: number | null;
  callsigns: string[];
};

export type LbAssignableHalf = {
  half: number;
  gameId: string;
  gameSlug: string;
  startTime: Date;
  side1: LbAssignableSide;
  side2: LbAssignableSide;
};

export type LbAssignableMatch = {
  lbMatchId: string;
  halves: LbAssignableHalf[];
};

/** Laserball game in the competition, with each team's players, for picking halves. */
export type LbCompetitionGame = {
  id: string;
  slug: string;
  startTime: Date;
  outcome: string;
  excluded: boolean;
  teams: {
    gameTeamId: string;
    name: string;
    colourEnum: number;
    score: number | null;
    callsigns: string[];
  }[];
};

async function loadSides(gameTeamIds: string[]) {
  if (gameTeamIds.length === 0) return new Map<string, Omit<LbAssignableSide, "gameTeamId">>();
  const [teams, cards] = await Promise.all([
    db
      .select({
        id: lbGameTeam.id,
        name: lbGameTeam.name,
        colourEnum: lbGameTeam.colourEnum,
        score: lbGameTeam.score,
      })
      .from(lbGameTeam)
      .where(inArray(lbGameTeam.id, gameTeamIds)),
    db
      .select({ teamId: lbScorecard.teamId, callsign: lbScorecard.callsign })
      .from(lbScorecard)
      .where(inArray(lbScorecard.teamId, gameTeamIds))
      .orderBy(asc(lbScorecard.callsign)),
  ]);
  const callsigns = new Map<string, string[]>();
  for (const c of cards) callsigns.set(c.teamId, [...(callsigns.get(c.teamId) ?? []), c.callsign]);
  return new Map(
    teams.map((t) => [
      t.id,
      {
        name: t.name,
        colourEnum: t.colourEnum,
        score: t.score,
        callsigns: callsigns.get(t.id) ?? [],
      },
    ]),
  );
}

/**
 * lb_matches whose every half is a game of this competition and which fill no competition
 * match yet — the candidates for a match slot.
 */
export async function getAssignableLbMatches(competitionId: string): Promise<LbAssignableMatch[]> {
  const outsideCompetition = db
    .select({ matchId: lbMatchGame.matchId })
    .from(lbMatchGame)
    .innerJoin(game, eq(game.id, lbMatchGame.gameId))
    .where(sql`${game.competitionId} is distinct from ${competitionId}::uuid`);

  const rows = await db
    .select({
      lbMatchId: lbMatchGame.matchId,
      half: lbMatchGame.half,
      gameId: game.id,
      gameSlug: gameSlugSql,
      startTime: game.startTime,
      side1GameTeamId: lbMatchGame.side1GameTeamId,
      side2GameTeamId: lbMatchGame.side2GameTeamId,
    })
    .from(lbMatchGame)
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .innerJoin(game, eq(game.id, lbMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        isNull(lbMatch.competitionMatchId),
        notInArray(lbMatchGame.matchId, outsideCompetition),
      ),
    )
    .orderBy(asc(game.startTime));

  const sides = await loadSides(rows.flatMap((r) => [r.side1GameTeamId, r.side2GameTeamId]));
  const side = (id: string): LbAssignableSide => ({
    gameTeamId: id,
    ...(sides.get(id) ?? { name: "", colourEnum: 0, score: null, callsigns: [] }),
  });

  const byMatch = new Map<string, LbAssignableHalf[]>();
  for (const r of rows) {
    byMatch.set(r.lbMatchId, [
      ...(byMatch.get(r.lbMatchId) ?? []),
      {
        half: r.half,
        gameId: r.gameId,
        gameSlug: r.gameSlug,
        startTime: r.startTime,
        side1: side(r.side1GameTeamId),
        side2: side(r.side2GameTeamId),
      },
    ]);
  }
  return [...byMatch].map(([lbMatchId, halves]) => ({
    lbMatchId,
    halves: halves.sort((a, b) => a.half - b.half),
  }));
}

/**
 * The competition's Laserball games, with each team's players. `unlinkedOnly` keeps the games
 * not yet linked into any lb_match — the ones an admin can pair into halves.
 */
export async function getLbCompetitionGames(
  competitionId: string,
  options: { unlinkedOnly?: boolean; unassignedOnly?: boolean } = {},
): Promise<LbCompetitionGame[]> {
  const linked = db.select({ gameId: lbMatchGame.gameId }).from(lbMatchGame);
  const assigned = db
    .select({ gameId: lbMatchGame.gameId })
    .from(lbMatchGame)
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .where(isNotNull(lbMatch.competitionMatchId));

  const games = await db
    .select({
      id: game.id,
      slug: gameSlugSql,
      startTime: game.startTime,
      outcome: game.outcome,
      excluded: game.exclude,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        eq(game.type, "lb"),
        options.unlinkedOnly ? notInArray(game.id, linked) : undefined,
        options.unassignedOnly ? notInArray(game.id, assigned) : undefined,
      ),
    )
    .orderBy(asc(game.startTime));
  if (games.length === 0) return [];

  const gameTeams = await db
    .select({ id: lbGameTeam.id, gameId: lbGameTeam.gameId })
    .from(lbGameTeam)
    .where(
      and(
        inArray(
          lbGameTeam.gameId,
          games.map((g) => g.id),
        ),
        eq(lbGameTeam.isNeutral, false),
      ),
    )
    .orderBy(asc(lbGameTeam.tdfTeamIndex));
  const sides = await loadSides(gameTeams.map((t) => t.id));

  return games.map((g) => ({
    ...g,
    teams: gameTeams
      .filter((t) => t.gameId === g.id)
      .map((t) => ({
        gameTeamId: t.id,
        ...(sides.get(t.id) ?? { name: "", colourEnum: 0, score: null, callsigns: [] }),
      })),
  }));
}

/** The lb_match filling a competition match, if any. */
export async function getLbMatchIdForCompetitionMatch(
  competitionMatchId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: lbMatch.id })
    .from(lbMatch)
    .where(eq(lbMatch.competitionMatchId, competitionMatchId));
  return row?.id ?? null;
}

async function loadAssignTarget(competitionMatchId: string) {
  const [row] = await db
    .select({
      competitionId: competitionMatch.competitionId,
      gameType: competition.gameType,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
    })
    .from(competitionMatch)
    .innerJoin(competition, eq(competition.id, competitionMatch.competitionId))
    .where(eq(competitionMatch.id, competitionMatchId));
  return row ?? null;
}

/**
 * Fills a competition match with an already-linked lb_match. `swapSides` flips every half's
 * side assignment first, for a match linked with the teams the other way round, so that side 1
 * is the slot's team 1. Files the halves into the competition and stamps mercenary flags.
 */
export async function assignLbMatchToCompetitionMatch(
  competitionMatchId: string,
  lbMatchId: string,
  swapSides: boolean,
): Promise<LbCompetitionMutationResult> {
  const target = await loadAssignTarget(competitionMatchId);
  if (!target) return { ok: false, error: "Match not found." };
  if (target.gameType !== "lb") return { ok: false, error: "Not a Laserball competition." };
  if (!target.team1Id || !target.team2Id) {
    return { ok: false, error: "Set both teams on the match first." };
  }
  if (await getLbMatchIdForCompetitionMatch(competitionMatchId)) {
    return { ok: false, error: "This match already has its halves assigned." };
  }
  const [lb] = await db
    .select({ competitionMatchId: lbMatch.competitionMatchId })
    .from(lbMatch)
    .where(eq(lbMatch.id, lbMatchId));
  if (!lb) return { ok: false, error: "Linked halves not found." };
  if (lb.competitionMatchId) {
    return { ok: false, error: "Those halves already fill another match." };
  }

  await db.transaction(async (tx) => {
    if (swapSides) {
      await tx
        .update(lbMatchGame)
        .set({
          side1GameTeamId: sql`${lbMatchGame.side2GameTeamId}`,
          side2GameTeamId: sql`${lbMatchGame.side1GameTeamId}`,
        })
        .where(eq(lbMatchGame.matchId, lbMatchId));
    }
    await tx.update(lbMatch).set({ competitionMatchId }).where(eq(lbMatch.id, lbMatchId));
    await tx
      .update(game)
      .set({ competitionId: target.competitionId })
      .where(
        inArray(
          game.id,
          tx
            .select({ gameId: lbMatchGame.gameId })
            .from(lbMatchGame)
            .where(eq(lbMatchGame.matchId, lbMatchId)),
        ),
      );
    await stampLbMercenaries(tx, lbMatchId);
  });
  return { ok: true };
}

/**
 * Links two of the competition's games as the halves of a new lb_match and fills the
 * competition match with it, in one step. `half1Team1GameTeamId` / `half2Team1GameTeamId` name
 * the game team the slot's team 1 played as in each game; the other non-neutral team is team 2.
 */
export async function linkAndAssignLbHalves(data: {
  competitionMatchId: string;
  half1GameId: string;
  half1Team1GameTeamId: string;
  half2GameId: string;
  half2Team1GameTeamId: string;
  linkedBy?: string;
}): Promise<LbCompetitionMutationResult> {
  const target = await loadAssignTarget(data.competitionMatchId);
  if (!target) return { ok: false, error: "Match not found." };
  if (target.gameType !== "lb") return { ok: false, error: "Not a Laserball competition." };

  const teams = await db
    .select({ id: lbGameTeam.id, gameId: lbGameTeam.gameId })
    .from(lbGameTeam)
    .where(
      and(
        inArray(lbGameTeam.gameId, [data.half1GameId, data.half2GameId]),
        eq(lbGameTeam.isNeutral, false),
      ),
    );
  const opponent = (gameId: string, team1GameTeamId: string) => {
    const own = teams.filter((t) => t.gameId === gameId);
    if (own.length !== 2 || !own.some((t) => t.id === team1GameTeamId)) return null;
    return own.find((t) => t.id !== team1GameTeamId)!.id;
  };
  const half1Team2 = opponent(data.half1GameId, data.half1Team1GameTeamId);
  const half2Team2 = opponent(data.half2GameId, data.half2Team1GameTeamId);
  if (!half1Team2 || !half2Team2) {
    return { ok: false, error: "Each game must have exactly two teams, one of them team 1's." };
  }

  let lbMatchId: string;
  try {
    lbMatchId = await linkLbMatch(
      data.half1GameId,
      data.half2GameId,
      {
        gameSide1TeamId: data.half1Team1GameTeamId,
        gameSide2TeamId: half1Team2,
        otherSide1TeamId: data.half2Team1GameTeamId,
        otherSide2TeamId: half2Team2,
      },
      data.linkedBy,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not link the halves." };
  }
  return assignLbMatchToCompetitionMatch(data.competitionMatchId, lbMatchId, false);
}

/**
 * Empties a competition match. The lb_match stays linked and its games stay in the competition,
 * so it can be assigned again; only the mercenary flags, which mean nothing outside a match, are
 * cleared.
 */
export async function unassignLbMatchFromCompetitionMatch(
  competitionMatchId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [lb] = await tx
      .update(lbMatch)
      .set({ competitionMatchId: null })
      .where(eq(lbMatch.competitionMatchId, competitionMatchId))
      .returning({ id: lbMatch.id });
    if (!lb) return;
    await tx
      .update(lbScorecard)
      .set({ isMercenary: false })
      .where(
        inArray(
          lbScorecard.gameId,
          tx
            .select({ gameId: lbMatchGame.gameId })
            .from(lbMatchGame)
            .where(eq(lbMatchGame.matchId, lb.id)),
        ),
      );
  });
}

/**
 * Recomputes lb_scorecard.is_mercenary for every half of one lb_match from the rosters of the
 * competition match it fills: true for a player rostered as a mercenary on the team their side
 * represents, false for everyone else. Unlike SM5's stamp this sets false as well as true, so a
 * re-stamp after a roster change or a reingest is always exact.
 */
export async function stampLbMercenaries(executor: Executor, lbMatchId: string): Promise<void> {
  await executor.execute(sql`
    UPDATE lb_scorecard sc
    SET is_mercenary = coalesce((
      SELECT ctp.is_mercenary
      FROM lb_match_game lmg
      JOIN lb_match lm ON lm.id = lmg.match_id
      JOIN competition_match cm ON cm.id = lm.competition_match_id
      JOIN competition_team_player ctp
        ON ctp.player_id = sc.player_id
       AND ctp.competition_team_id = CASE WHEN sc.team_id = lmg.side1_game_team_id
                                          THEN cm.team1_id ELSE cm.team2_id END
      WHERE lmg.game_id = sc.game_id
    ), false)
    WHERE sc.game_id IN (SELECT game_id FROM lb_match_game WHERE match_id = ${lbMatchId})`);
}

/**
 * After a half is added to an lb_match (an overtime half, from the game page): if the match
 * fills a competition match, file every half into that competition and re-stamp mercenaries.
 */
export async function syncLbMatchCompetition(lbMatchId: string): Promise<void> {
  const [row] = await db
    .select({ competitionId: competitionMatch.competitionId })
    .from(lbMatch)
    .innerJoin(competitionMatch, eq(competitionMatch.id, lbMatch.competitionMatchId))
    .where(eq(lbMatch.id, lbMatchId));
  if (!row) return;
  await db.transaction(async (tx) => {
    await tx
      .update(game)
      .set({ competitionId: row.competitionId })
      .where(
        inArray(
          game.id,
          tx
            .select({ gameId: lbMatchGame.gameId })
            .from(lbMatchGame)
            .where(eq(lbMatchGame.matchId, lbMatchId)),
        ),
      );
    await stampLbMercenaries(tx, lbMatchId);
  });
}

/** Re-stamps the lb_match a game belongs to, if it fills a competition match (reingest). */
export async function restampLbMercenariesForGame(
  executor: Executor,
  gameId: string,
): Promise<void> {
  const [row] = await executor
    .select({ id: lbMatch.id })
    .from(lbMatchGame)
    .innerJoin(lbMatch, eq(lbMatch.id, lbMatchGame.matchId))
    .where(and(eq(lbMatchGame.gameId, gameId), isNotNull(lbMatch.competitionMatchId)));
  if (row) await stampLbMercenaries(executor, row.id);
}

/** Re-stamps every lb_match a competition team has played, after its roster changes. */
export async function restampLbMercenariesForTeam(competitionTeamId: string): Promise<void> {
  const rows = await db
    .select({ id: lbMatch.id })
    .from(lbMatch)
    .innerJoin(competitionMatch, eq(competitionMatch.id, lbMatch.competitionMatchId))
    .where(
      sql`${competitionTeamId}::uuid in (${competitionMatch.team1Id}, ${competitionMatch.team2Id})`,
    );
  for (const r of rows) await stampLbMercenaries(db, r.id);
}

// ---------------------------------------------------------------------------
// Schedule (public API)
// ---------------------------------------------------------------------------

/** One half of a match, the Laserball counterpart of SM5's CompetitionScheduleEntry. */
export type LbCompetitionScheduleEntry = {
  gameName: string;
  team1Name: string;
  team2Name: string;
  team1LogoUrl: string | null;
  team2LogoUrl: string | null;
  scheduledStartTime: Date | null;
  actualStartTime: Date | null;
  team1Goals: number | null;
  team2Goals: number | null;
  goalDifferential: number | null;
};

/**
 * Every half scheduled or played, one entry each: halves 1 and 2 take the slot's scheduled
 * times, overtime halves have none. Ordered by scheduled time, unscheduled last, like SM5.
 */
export async function getLbCompetitionSchedule(
  competitionId: string,
): Promise<LbCompetitionScheduleEntry[]> {
  const [matches, slots] = await Promise.all([
    getLbCompetitionMatchResults(competitionId),
    db
      .select({
        id: competitionMatch.id,
        game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
        game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
      })
      .from(competitionMatch)
      .where(eq(competitionMatch.competitionId, competitionId)),
  ]);
  const scheduled = new Map(slots.map((s) => [s.id, s]));

  const entries: LbCompetitionScheduleEntry[] = [];
  for (const m of matches) {
    const roundPrefix = m.roundType === "finals" ? "Finals" : `R${m.roundNumber}`;
    const logo = (t: LbCompetitionMatchTeam | null) =>
      t?.hasLogo ? getTeamLogoUrl(t.id, t.logoVersion) : null;
    const slot = scheduled.get(m.matchId);
    const halfNumbers = new Set([1, 2, ...m.halves.map((h) => h.half)]);

    for (const halfNumber of [...halfNumbers].sort((a, b) => a - b)) {
      const half = m.halves.find((h) => h.half === halfNumber);
      const scheduledStart =
        halfNumber === 1
          ? (slot?.game1ScheduledStartTime ?? null)
          : halfNumber === 2
            ? (slot?.game2ScheduledStartTime ?? null)
            : null;
      // Skip halves with no scheduled time and no game, as SM5 skips empty slots.
      if (!scheduledStart && !half) continue;

      const team1Goals = half?.team1Goals ?? null;
      const team2Goals = half?.team2Goals ?? null;
      entries.push({
        gameName: `${roundPrefix} M${m.matchNumber} ${halfNumber > 2 ? `OT${halfNumber - 2}` : `H${halfNumber}`}`,
        team1Name: m.team1?.name ?? "TBD",
        team2Name: m.team2?.name ?? "TBD",
        team1LogoUrl: logo(m.team1),
        team2LogoUrl: logo(m.team2),
        scheduledStartTime: scheduledStart,
        actualStartTime: half?.startTime ?? null,
        team1Goals,
        team2Goals,
        goalDifferential:
          team1Goals !== null && team2Goals !== null ? team1Goals - team2Goals : null,
      });
    }
  }

  entries.sort((a, b) => {
    if (!a.scheduledStartTime && !b.scheduledStartTime) return 0;
    if (!a.scheduledStartTime) return 1;
    if (!b.scheduledStartTime) return -1;
    return a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime();
  });
  return entries;
}
