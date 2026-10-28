// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import { SYNTHETIC_IPL_PREFIX } from "../lib/synthetic-ipl-id";
import {
  competitionTeam,
  competitionTeamPlayer,
  competitionTeamAdjustment,
  competitionPlayer,
  competitionRound,
  competitionPool,
  competitionRoundTeamPool,
  competitionMatch,
  competitionMatchGame,
  competitionGameSide,
  competitionScorecard,
  player,
  playerCallsignHistory,
  game,
  sm5GamePenalty,
  sm5GameTeam,
  sm5Scorecard,
  sm5PdfGameTeam,
  sm5PdfScorecard,
  center,
  competition,
} from "../schema";
import {
  eq,
  and,
  ne,
  asc,
  desc,
  ilike,
  inArray,
  not,
  or,
  sql,
  type Column,
  type SQL,
  notLike,
} from "drizzle-orm";
import type { PlayerMedicHitsItem } from "./players";
import { hasMatchStructure, isPartnerFormat } from "./admin";
import type { CompetitionCategory, CompetitionFormat, CompetitionState } from "./admin";
import type { GameScopeFilter } from "./scope";
import { slugify, resolveUniqueSlug } from "../lib/slug";
import { getTeamLogoUrl } from "../lib/team-logos";
import { getPlayerPictureUrl } from "../lib/player-pictures";
import {
  compareStandings,
  computeTeamStats,
  emptyTeamStats,
  applyTeamAdjustments,
  sideTeamIds,
  type StandingsGameRow,
} from "../lib/match-points";

// ---------------------------------------------------------------------------
// Competition lookup
// ---------------------------------------------------------------------------

export async function getCompetitionHostCenterId(competitionId: string): Promise<string | null> {
  const [row] = await db
    .select({ hostCenterId: competition.hostCenterId })
    .from(competition)
    .where(eq(competition.id, competitionId));
  return row?.hostCenterId ?? null;
}

// ---------------------------------------------------------------------------
// Match sides
// ---------------------------------------------------------------------------

// A trios match puts two competition teams (trios) on each side of one sm5_game_team, and a
// duos match three (duos); the partner columns are null in every other format, and partner2
// is null outside duos. Everything a side earns is shared by every team on it, so most queries
// only need to widen "team1_id" to "team1_id or one of its partners".
type MatchSideIds = {
  team1Id: string | null;
  team1PartnerId: string | null;
  team1Partner2Id: string | null;
  team2Id: string | null;
  team2PartnerId: string | null;
  team2Partner2Id: string | null;
};

// Every slot of each side, for `IN (...)` against a `competition_match cm` row.
const CM_SIDE1 = sql.raw("cm.team1_id, cm.team1_partner_id, cm.team1_partner2_id");
const CM_SIDE2 = sql.raw("cm.team2_id, cm.team2_partner_id, cm.team2_partner2_id");

function matchSideTeamIds(rows: MatchSideIds[]): string[] {
  return [
    ...new Set(
      rows.flatMap((r) =>
        sideTeamIds(
          r.team1Id,
          r.team1PartnerId,
          r.team1Partner2Id,
          r.team2Id,
          r.team2PartnerId,
          r.team2Partner2Id,
        ),
      ),
    ),
  ];
}

async function loadTeamNames(rows: MatchSideIds[]): Promise<Map<string, string>> {
  const ids = matchSideTeamIds(rows);
  if (ids.length === 0) return new Map();
  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, ids));
  return new Map(teams.map((t) => [t.id, t.name]));
}

// Display name for one side: "TBD" before it is scheduled, else the team — joined with its
// partners as "A & B" in a trios match, "A & B & C" in a duos match.
function matchSideName(
  names: Map<string, string>,
  teamId: string | null,
  ...partnerIds: (string | null)[]
): string {
  if (!teamId) return "TBD";
  return sideTeamIds(teamId, ...partnerIds)
    .map((id) => names.get(id) ?? "Unknown")
    .join(" & ");
}

// The sm5_game_team ids a competition team played as, across every match it is on. A trio or
// duo resolves to the side it shares with its partners.
function teamGameTeamIdsSql(teamId: string | Column): SQL {
  return sql`SELECT CASE WHEN ${teamId}::uuid IN (${CM_SIDE1})
                         THEN cmg.team1_game_team_id ELSE cmg.team2_game_team_id END
             FROM competition_match cm
             JOIN competition_match_game cmg ON cmg.match_id = cm.id
             WHERE ${teamId}::uuid IN (${CM_SIDE1}, ${CM_SIDE2})`;
}

// True when a scorecard counts for a competition team: it is on the team's side, and — for a
// trio or duo — the player is not rostered on one of that match's partner teams instead. For
// an ordinary team the partners are null, so this reduces to "on the team's side".
export function teamScorecardSql(
  teamId: string | Column,
  scTeamId: SQL | Column,
  scPlayerId: SQL | Column,
): SQL {
  return sql`EXISTS (
    SELECT 1 FROM competition_match cm
    JOIN competition_match_game cmg ON cmg.match_id = cm.id
    WHERE ${teamId}::uuid IN (${CM_SIDE1}, ${CM_SIDE2})
      AND ${scTeamId} = CASE WHEN ${teamId}::uuid IN (${CM_SIDE1})
                             THEN cmg.team1_game_team_id ELSE cmg.team2_game_team_id END
      AND NOT EXISTS (
        SELECT 1 FROM competition_team_player partner_ctp
        WHERE partner_ctp.player_id = ${scPlayerId}
          AND partner_ctp.competition_team_id <> ${teamId}::uuid
          AND CASE WHEN ${teamId}::uuid IN (${CM_SIDE1})
                   THEN partner_ctp.competition_team_id IN (${CM_SIDE1})
                   ELSE partner_ctp.competition_team_id IN (${CM_SIDE2}) END
          AND NOT EXISTS (
            SELECT 1 FROM competition_team_player own_ctp
            WHERE own_ctp.player_id = ${scPlayerId}
              AND own_ctp.competition_team_id = ${teamId}::uuid
          )
      )
  )`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompetitionTeamListItem = {
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
  playerCount: number;
  mercCount: number;
  unassignedCount: number;
};

export type CompetitionTeamRosterEntry = {
  id: string; // competitionTeamPlayer.id — used for removal
  playerId: string;
  iplId: string | null;
  currentCallsign: string;
  isMercenary: boolean;
  hasProfilePicture: boolean;
  pictureVersion: number;
  gamesPlayed: number;
};

export type CompetitionRoundType = "pool" | "finals" | "split-pool" | "wildcard";

export type CompetitionRoundListItem = {
  id: string;
  competitionId: string;
  name: string;
  roundNumber: number;
  type: CompetitionRoundType;
  multiplier: number;
  matchCount: number;
};

export type CompetitionMatchListItem = {
  id: string;
  roundId: string;
  matchNumber: number;
  poolId: string | null;
  poolName: string | null;
  team1Id: string | null;
  team1PartnerId: string | null;
  team1Partner2Id: string | null;
  // Side display name: every team on it joined ("A & B", "A & B & C") in trios and duos.
  team1Name: string;
  team2Id: string | null;
  team2PartnerId: string | null;
  team2Partner2Id: string | null;
  team2Name: string;
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
  game1StartTime: Date | null;
  game2StartTime: Date | null;
  game1Assigned: boolean;
  game2Assigned: boolean;
};

export type CompetitionMatchDetail = {
  id: string;
  competitionId: string;
  roundId: string;
  team1Id: string | null;
  team1PartnerId: string | null;
  team1Partner2Id: string | null;
  // Side display name: every team on it joined ("A & B", "A & B & C") in trios and duos.
  team1Name: string;
  team2Id: string | null;
  team2PartnerId: string | null;
  team2Partner2Id: string | null;
  team2Name: string;
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
};

export type MatchGameAssignment = {
  id: string; // competitionMatchGame.id
  gameId: string;
  gameNumber: number;
  gameStartTime: Date;
  gameDescription: string | null;
  team1GameTeamId: string;
  team1ColourEnum: number;
  team2GameTeamId: string;
  team2ColourEnum: number;
};

export type UnassignedCompetitionGame = {
  id: string;
  startTime: Date;
  description: string | null;
  centerName: string;
  teams: {
    id: string; // sm5_game_team.id
    name: string;
    colourEnum: number;
  }[];
};

export type PlayerSearchResult = {
  id: string;
  iplId: string;
  currentCallsign: string;
  /** Up to 5 earlier callsigns, most recently used first; excludes the current one. */
  recentCallsigns: string[];
};

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function getCompetitionTeams(
  competitionId: string,
): Promise<CompetitionTeamListItem[]> {
  const rows = await db
    .select({
      id: competitionTeam.id,
      competitionId: competitionTeam.competitionId,
      name: competitionTeam.name,
      slug: competitionTeam.slug,
      shortName: competitionTeam.shortName,
      hasLogo: competitionTeam.hasLogo,
      logoVersion: competitionTeam.logoVersion,
      playerCount: sql<number>`count(${competitionTeamPlayer.id}) filter (where ${competitionTeamPlayer.isMercenary} = false)::int`,
      mercCount: sql<number>`count(${competitionTeamPlayer.id}) filter (where ${competitionTeamPlayer.isMercenary} = true)::int`,
      unassignedCount: sql<number>`(
        SELECT count(DISTINCT sc.player_id)::int FROM competition_scorecard sc
        WHERE ${teamScorecardSql(competitionTeam.id, sql`sc.team_id`, sql`sc.player_id`)}
        AND sc.player_id NOT IN (
          SELECT player_id FROM competition_team_player
          WHERE competition_team_id = ${competitionTeam.id}
        )
      )`,
    })
    .from(competitionTeam)
    .leftJoin(
      competitionTeamPlayer,
      eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
    )
    .where(eq(competitionTeam.competitionId, competitionId))
    .groupBy(competitionTeam.id)
    .orderBy(asc(competitionTeam.name));

  return rows;
}

export async function getCompetitionTeamById(id: string): Promise<{
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
} | null> {
  const [row] = await db.select().from(competitionTeam).where(eq(competitionTeam.id, id));
  return row ?? null;
}

export async function getCompetitionTeamBySlug(
  competitionId: string,
  slug: string,
): Promise<{
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
} | null> {
  const [row] = await db
    .select()
    .from(competitionTeam)
    .where(and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.slug, slug)));
  return row ?? null;
}

async function resolveCompetitionTeamSlug(
  competitionId: string,
  baseName: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(baseName, "team");
  return resolveUniqueSlug(base, async (candidate) => {
    const conditions = excludeId
      ? and(
          eq(competitionTeam.competitionId, competitionId),
          eq(competitionTeam.slug, candidate),
          ne(competitionTeam.id, excludeId),
        )
      : and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.slug, candidate));
    const [existing] = await db
      .select({ id: competitionTeam.id })
      .from(competitionTeam)
      .where(conditions);
    return !!existing;
  });
}

export async function updateCompetitionTeam(
  id: string,
  data: { competitionId: string; name: string; shortName: string | null },
): Promise<void> {
  const slug = await resolveCompetitionTeamSlug(
    data.competitionId,
    data.shortName ?? data.name,
    id,
  );
  await db
    .update(competitionTeam)
    .set({ name: data.name, shortName: data.shortName, slug })
    .where(eq(competitionTeam.id, id));
}

export async function setCompetitionTeamLogo(id: string, hasLogo: boolean): Promise<void> {
  await db
    .update(competitionTeam)
    .set({ hasLogo, logoVersion: sql`${competitionTeam.logoVersion} + 1` })
    .where(eq(competitionTeam.id, id));
}

export async function setCompetitionTeamPlayerPicture(
  entryId: string,
  hasProfilePicture: boolean,
): Promise<void> {
  await db
    .update(competitionTeamPlayer)
    .set({ hasProfilePicture, pictureVersion: sql`${competitionTeamPlayer.pictureVersion} + 1` })
    .where(eq(competitionTeamPlayer.id, entryId));
}

export async function getCompetitionTeamRoster(
  teamId: string,
): Promise<CompetitionTeamRosterEntry[]> {
  const rows = await db
    .select({
      id: competitionTeamPlayer.id,
      playerId: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      isMercenary: competitionTeamPlayer.isMercenary,
      hasProfilePicture: competitionTeamPlayer.hasProfilePicture,
      pictureVersion: competitionTeamPlayer.pictureVersion,
      gamesPlayed: sql<number>`(
        SELECT count(*)::int FROM competition_scorecard sc
        WHERE sc.player_id = ${player.id}
          AND ${teamScorecardSql(teamId, sql`sc.team_id`, sql`sc.player_id`)}
      )`,
    })
    .from(competitionTeamPlayer)
    .innerJoin(player, eq(player.id, competitionTeamPlayer.playerId))
    .where(eq(competitionTeamPlayer.competitionTeamId, teamId))
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export type TeamGameParticipant = {
  playerId: string;
  iplId: string | null;
  currentCallsign: string;
  isMercenary: boolean;
  gamesPlayed: number;
};

export async function getTeamGameParticipants(
  competitionTeamId: string,
): Promise<TeamGameParticipant[]> {
  // Find all players who have a scorecard on this competition team's game-team rows,
  // excluding those already on the official roster.
  // The join path: competition_team -> competition_match (either side, or a partner slot)
  //   -> competition_match_game -> game team (the right side) -> scorecard -> player, over
  //   TDF and PDF-era scorecards alike
  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      isMercenary: sql<boolean>`bool_or(${competitionScorecard.isMercenary})`,
      gamesPlayed: sql<number>`count(*)::int`,
    })
    .from(competitionScorecard)
    .innerJoin(player, eq(player.id, competitionScorecard.playerId))
    .where(
      and(
        // scorecard must count for this team (its side, minus its partners' players)
        teamScorecardSql(
          competitionTeamId,
          competitionScorecard.teamId,
          competitionScorecard.playerId,
        ),
        // exclude players already on the official roster
        sql`${competitionScorecard.playerId} NOT IN (
          SELECT player_id FROM competition_team_player
          WHERE competition_team_id = ${competitionTeamId}
        )`,
      ),
    )
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export type CompetitionTeamPlayerStat = {
  playerId: string;
  /** The position these stats cover, or null for the player's games across all positions. */
  position: number | null;
  gamesPlayed: number;
  /**
   * Modern MVP. Event-derived stats like this one are null when every game is PDF-era, and in
   * a competition mixing the two they average over the TDF games only.
   */
  avgMvp: number | null;
  /** The legacy site's MVP, over PDF-era games only; null when there are none. */
  avgLegacyMvp: number | null;
  avgScore: number;
  avgHitDiff: number;
  avgMedicHits: number;
  avgAccuracy: number;
  avgDeactivations: number | null;
  avgAssists: number | null;
  avgTimesHit: number;
  avgResets: number | null;
  avgEliminations: number | null;
  winRate: number;
  survivalRate: number;
  avgUptimePct: number | null;
  avgPenalties: number;
};

/**
 * Per-player stats for one competition team, at two grouping levels: one row per
 * (player, position) plus a `position: null` rollup row per player.
 *
 * The rollup comes from GROUPING SETS rather than being re-weighted on the client so that
 * every aggregate — including the ratio stats with a `nullif` denominator — is exact at both
 * levels. `position` is NOT NULL in the data, so a null here unambiguously means "all
 * positions". Only columns stored for every position are aggregated; see the Position-Specific
 * Null Summary in docs/Scorecard_Table_Spec.md.
 */
export async function getCompetitionTeamPlayerStats(
  teamId: string,
): Promise<CompetitionTeamPlayerStat[]> {
  const rows = await db
    .select({
      playerId: sm5Scorecard.playerId,
      position: sm5Scorecard.position,
      gamesPlayed: sql<number>`count(*)::int`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})::float`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})::float`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})::float`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})::float`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})::float`,
      avgDeactivations: sql<number>`avg(${sm5Scorecard.deactivatedOpponent})::float`,
      avgAssists: sql<number>`avg(${sm5Scorecard.assists})::float`,
      avgTimesHit: sql<number>`avg(${sm5Scorecard.timesHit})::float`,
      avgResets: sql<number>`avg(${sm5Scorecard.resetOpponent})::float`,
      avgEliminations: sql<number>`avg(${sm5Scorecard.eliminatedOpponent})::float`,
      winRate: sql<number>`(count(*) filter (where ${sm5GameTeam.result} = 'win'))::float / count(*)`,
      survivalRate: sql<number>`avg(case when ${sm5Scorecard.eliminated} then 0 else 1 end)::float`,
      avgUptimePct: sql<
        number | null
      >`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgPenalties: sql<number>`avg(${sm5Scorecard.penalties})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
    .where(
      and(
        sql`${sm5Scorecard.playerId} IS NOT NULL`,
        eq(game.exclude, false),
        teamScorecardSql(teamId, sm5Scorecard.teamId, sm5Scorecard.playerId),
      ),
    )
    .groupBy(
      sql`GROUPING SETS (
        (${sm5Scorecard.playerId}, ${sm5Scorecard.position}),
        (${sm5Scorecard.playerId})
      )`,
    )
    .orderBy(asc(sm5Scorecard.playerId), asc(sm5Scorecard.position));

  return rows.map((r) => ({
    ...r,
    playerId: r.playerId!,
    avgLegacyMvp: null,
    avgUptimePct: r.avgUptimePct === null ? null : Number(r.avgUptimePct),
  }));
}

export type CompetitionTeamResultItem = {
  colourEnum: number;
  result: "win" | "loss";
  outcome: "score" | "elimination";
  count: number;
};

export async function getCompetitionTeamResultsByColor(
  teamId: string,
): Promise<CompetitionTeamResultItem[]> {
  const rows = await db
    .select({
      colourEnum: competitionGameSide.colourEnum,
      result: competitionGameSide.result,
      outcome: game.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(competitionGameSide)
    .innerJoin(game, eq(game.id, competitionGameSide.gameId))
    .where(
      and(
        eq(game.exclude, false),
        sql`${competitionGameSide.id} IN (${teamGameTeamIdsSql(teamId)})`,
      ),
    )
    .groupBy(competitionGameSide.colourEnum, competitionGameSide.result, game.outcome)
    .orderBy(
      desc(competitionGameSide.result),
      asc(competitionGameSide.colourEnum),
      desc(game.outcome),
    );

  return rows
    .filter(
      (r) =>
        (r.result === "win" || r.result === "loss") &&
        (r.outcome === "score" || r.outcome === "elimination"),
    )
    .map((r) => ({
      colourEnum: r.colourEnum,
      result: r.result as "win" | "loss",
      outcome: r.outcome as "score" | "elimination",
      count: r.count,
    }));
}

/**
 * Thrown Server Action errors are redacted to a bare digest in production
 * builds (Next.js strips the message), so roster-conflict validation must be
 * reported as a return value the caller can display, not a throw.
 */
export type RosterMutationResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Standings adjustments
// ---------------------------------------------------------------------------

export type CompetitionTeamAdjustment = {
  id: string;
  teamId: string;
  teamName: string;
  points: number;
  reason: string;
  createdAt: Date;
};

export async function getCompetitionTeamAdjustments(
  competitionId: string,
): Promise<CompetitionTeamAdjustment[]> {
  return db
    .select({
      id: competitionTeamAdjustment.id,
      teamId: competitionTeamAdjustment.teamId,
      teamName: competitionTeam.name,
      points: competitionTeamAdjustment.points,
      reason: competitionTeamAdjustment.reason,
      createdAt: competitionTeamAdjustment.createdAt,
    })
    .from(competitionTeamAdjustment)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionTeamAdjustment.teamId))
    .where(eq(competitionTeamAdjustment.competitionId, competitionId))
    .orderBy(asc(competitionTeam.name), asc(competitionTeamAdjustment.createdAt));
}

export async function addCompetitionTeamAdjustment(data: {
  competitionId: string;
  teamId: string;
  points: number;
  reason: string;
}): Promise<RosterMutationResult> {
  const reason = data.reason.trim();
  if (!Number.isInteger(data.points) || data.points === 0) {
    return { ok: false, error: "Points must be a whole number other than 0." };
  }
  if (!reason) return { ok: false, error: "Give a reason for the adjustment." };
  const [team] = await db
    .select({ id: competitionTeam.id })
    .from(competitionTeam)
    .where(
      and(
        eq(competitionTeam.id, data.teamId),
        eq(competitionTeam.competitionId, data.competitionId),
      ),
    );
  if (!team) return { ok: false, error: "That team is not in this competition." };
  await db.insert(competitionTeamAdjustment).values({
    competitionId: data.competitionId,
    teamId: data.teamId,
    points: data.points,
    reason,
  });
  return { ok: true };
}

export async function deleteCompetitionTeamAdjustment(
  competitionId: string,
  id: string,
): Promise<void> {
  await db
    .delete(competitionTeamAdjustment)
    .where(
      and(
        eq(competitionTeamAdjustment.id, id),
        eq(competitionTeamAdjustment.competitionId, competitionId),
      ),
    );
}

// A player may only be a non-mercenary roster member of one team per
// competition (mercenary appearances on other teams are unrestricted).
async function findConflictingRosterTeam(
  competitionTeamId: string,
  playerId: string,
): Promise<{ id: string; name: string } | null> {
  const [team] = await db
    .select({ competitionId: competitionTeam.competitionId })
    .from(competitionTeam)
    .where(eq(competitionTeam.id, competitionTeamId));
  if (!team) return null;

  const [conflict] = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeamPlayer)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionTeamPlayer.competitionTeamId))
    .where(
      and(
        eq(competitionTeam.competitionId, team.competitionId),
        eq(competitionTeamPlayer.playerId, playerId),
        eq(competitionTeamPlayer.isMercenary, false),
        ne(competitionTeamPlayer.competitionTeamId, competitionTeamId),
      ),
    );
  return conflict ?? null;
}

export async function setPlayerMercenary(
  competitionTeamId: string,
  playerId: string,
  isMercenary: boolean,
): Promise<RosterMutationResult> {
  if (!isMercenary) {
    const conflict = await findConflictingRosterTeam(competitionTeamId, playerId);
    if (conflict) {
      return {
        ok: false,
        error: `Player is already on the roster of "${conflict.name}" for this competition`,
      };
    }
  }
  await db
    .insert(competitionTeamPlayer)
    .values({ competitionTeamId, playerId, isMercenary })
    .onConflictDoUpdate({
      target: [competitionTeamPlayer.competitionTeamId, competitionTeamPlayer.playerId],
      set: { isMercenary },
    });
  // Update all existing scorecards for this player on game-teams belonging to this competition team
  await db
    .update(sm5Scorecard)
    .set({ isMercenary })
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        sql`${sm5Scorecard.teamId} IN (${teamGameTeamIdsSql(competitionTeamId)})`,
      ),
    );
  return { ok: true };
}

export async function createCompetitionTeam(data: {
  competitionId: string;
  name: string;
  shortName?: string | null;
}): Promise<string> {
  const slug = await resolveCompetitionTeamSlug(data.competitionId, data.shortName ?? data.name);
  const [row] = await db
    .insert(competitionTeam)
    .values({ ...data, slug })
    .returning({ id: competitionTeam.id });
  return row.id;
}

export async function deleteCompetitionTeam(id: string): Promise<void> {
  await db.delete(competitionTeam).where(eq(competitionTeam.id, id));
}

export async function addPlayerToCompetitionTeam(
  competitionTeamId: string,
  playerId: string,
): Promise<RosterMutationResult> {
  const conflict = await findConflictingRosterTeam(competitionTeamId, playerId);
  if (conflict) {
    return {
      ok: false,
      error: `Player is already on the roster of "${conflict.name}" for this competition`,
    };
  }
  await db
    .insert(competitionTeamPlayer)
    .values({ competitionTeamId, playerId })
    .onConflictDoNothing();
  return { ok: true };
}

export async function removePlayerFromCompetitionTeam(
  entryId: string,
): Promise<RosterMutationResult> {
  const [entry] = await db
    .select({
      competitionTeamId: competitionTeamPlayer.competitionTeamId,
      playerId: competitionTeamPlayer.playerId,
      isMercenary: competitionTeamPlayer.isMercenary,
    })
    .from(competitionTeamPlayer)
    .where(eq(competitionTeamPlayer.id, entryId));
  if (!entry) return { ok: true };

  // A mercenary entry is the only valid state for a player who is genuinely
  // rostered on another team in the same competition: removing it would drop
  // them into "unassigned," where they can neither be promoted to this team's
  // roster nor meaningfully un-attached, since they already have games played
  // here. They can only be removed from this team once no longer rostered
  // elsewhere in the competition.
  if (entry.isMercenary) {
    const conflict = await findConflictingRosterTeam(entry.competitionTeamId, entry.playerId);
    if (conflict) {
      return {
        ok: false,
        error: `Cannot remove: this player is on the roster of "${conflict.name}" for this competition and must remain a mercenary here.`,
      };
    }
  }

  await db.delete(competitionTeamPlayer).where(eq(competitionTeamPlayer.id, entryId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Player search
// ---------------------------------------------------------------------------

export async function searchPlayersForRoster(
  query: string,
  limit = 10,
): Promise<PlayerSearchResult[]> {
  return db
    .selectDistinct({
      id: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      // Earlier names help tell apart players who switch callsigns often.
      // Case-only variants ("MrMischief" / "mrmischief") count once, as their latest spelling.
      recentCallsigns: sql<string[]>`coalesce((
        select array_agg(recent.callsign order by recent.last_seen_at desc)
        from (
          select * from (
            select distinct on (lower(h.callsign)) h.callsign, h.last_seen_at
            from player_callsign_history h
            where h.player_id = ${player.id}
              and lower(h.callsign) <> lower(${player.currentCallsign})
            order by lower(h.callsign), h.last_seen_at desc
          ) latest
          order by latest.last_seen_at desc
          limit 5
        ) recent
      ), '{}')`,
    })
    .from(player)
    .leftJoin(playerCallsignHistory, eq(playerCallsignHistory.playerId, player.id))
    .where(
      and(
        or(
          ilike(player.currentCallsign, `%${query}%`),
          ilike(playerCallsignHistory.callsign, `%${query}%`),
        ),
        // Synthetic legacy PDF-era players (no IPL id) never join modern rosters.
        notLike(player.iplId, `${SYNTHETIC_IPL_PREFIX}%`),
      ),
    )
    .orderBy(asc(player.currentCallsign))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export async function getCompetitionRounds(
  competitionId: string,
): Promise<CompetitionRoundListItem[]> {
  const rows = await db
    .select({
      id: competitionRound.id,
      competitionId: competitionRound.competitionId,
      name: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      type: competitionRound.type,
      multiplier: competitionRound.multiplier,
      matchCount: sql<number>`count(${competitionMatch.id})::int`,
    })
    .from(competitionRound)
    .leftJoin(competitionMatch, eq(competitionMatch.roundId, competitionRound.id))
    .where(eq(competitionRound.competitionId, competitionId))
    .groupBy(competitionRound.id)
    .orderBy(asc(competitionRound.roundNumber));

  return rows;
}

export async function getCompetitionRoundById(
  id: string,
): Promise<CompetitionRoundListItem | null> {
  const [row] = await db
    .select({
      id: competitionRound.id,
      competitionId: competitionRound.competitionId,
      name: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      type: competitionRound.type,
      multiplier: competitionRound.multiplier,
      matchCount: sql<number>`count(${competitionMatch.id})::int`,
    })
    .from(competitionRound)
    .leftJoin(competitionMatch, eq(competitionMatch.roundId, competitionRound.id))
    .where(eq(competitionRound.id, id))
    .groupBy(competitionRound.id);

  return row ?? null;
}

// A wildcard round plays its matches within a single auto-created "Wildcard"
// pool, reusing the split-pool team-assignment and standings machinery.
async function ensureWildcardPool(roundId: string): Promise<void> {
  const existing = await db
    .select({ id: competitionPool.id })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, roundId))
    .limit(1);
  if (existing.length === 0) {
    await createCompetitionPool({ roundId, name: "Wildcard" });
  }
}

export async function createCompetitionRound(data: {
  competitionId: string;
  name: string;
  roundNumber: number;
  type: CompetitionRoundType;
  multiplier?: number;
}): Promise<string> {
  const [row] = await db
    .insert(competitionRound)
    .values(data)
    .returning({ id: competitionRound.id });
  if (data.type === "wildcard") await ensureWildcardPool(row.id);
  return row.id;
}

export async function updateCompetitionRound(
  id: string,
  data: { name: string; roundNumber: number; type: CompetitionRoundType; multiplier?: number },
): Promise<void> {
  await db.update(competitionRound).set(data).where(eq(competitionRound.id, id));
  if (data.type === "wildcard") await ensureWildcardPool(id);
}

export async function deleteCompetitionRound(id: string): Promise<void> {
  await db.delete(competitionRound).where(eq(competitionRound.id, id));
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export async function getCompetitionMatchesByRound(
  roundId: string,
): Promise<CompetitionMatchListItem[]> {
  const matchRows = await db
    .select({
      id: competitionMatch.id,
      roundId: competitionMatch.roundId,
      matchNumber: competitionMatch.matchNumber,
      poolId: competitionMatch.poolId,
      poolName: competitionPool.name,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
    })
    .from(competitionMatch)
    .leftJoin(competitionPool, eq(competitionPool.id, competitionMatch.poolId))
    .where(eq(competitionMatch.roundId, roundId))
    .orderBy(asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  const teamMap = await loadTeamNames(matchRows);

  const matchIds = matchRows.map((m) => m.id);
  const gameAssignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
      startTime: game.startTime,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .where(inArray(competitionMatchGame.matchId, matchIds));

  const assignedMap = new Map<string, { numbers: Set<number>; startTimes: Map<number, Date> }>();
  for (const a of gameAssignments) {
    if (!assignedMap.has(a.matchId)) {
      assignedMap.set(a.matchId, { numbers: new Set(), startTimes: new Map() });
    }
    const entry = assignedMap.get(a.matchId)!;
    entry.numbers.add(a.gameNumber);
    entry.startTimes.set(a.gameNumber, a.startTime);
  }

  return matchRows.map((m) => {
    const entry = assignedMap.get(m.id);
    return {
      id: m.id,
      roundId: m.roundId,
      matchNumber: m.matchNumber,
      poolId: m.poolId,
      poolName: m.poolName,
      team1Id: m.team1Id,
      team1PartnerId: m.team1PartnerId,
      team1Partner2Id: m.team1Partner2Id,
      team1Name: matchSideName(teamMap, m.team1Id, m.team1PartnerId, m.team1Partner2Id),
      team2Id: m.team2Id,
      team2PartnerId: m.team2PartnerId,
      team2Partner2Id: m.team2Partner2Id,
      team2Name: matchSideName(teamMap, m.team2Id, m.team2PartnerId, m.team2Partner2Id),
      game1ScheduledStartTime: m.game1ScheduledStartTime,
      game2ScheduledStartTime: m.game2ScheduledStartTime,
      game1StartTime: entry?.startTimes.get(1) ?? null,
      game2StartTime: entry?.startTimes.get(2) ?? null,
      game1Assigned: entry?.numbers.has(1) ?? false,
      game2Assigned: entry?.numbers.has(2) ?? false,
    };
  });
}

export async function getCompetitionMatchById(id: string): Promise<CompetitionMatchDetail | null> {
  const [match] = await db.select().from(competitionMatch).where(eq(competitionMatch.id, id));

  if (!match) return null;

  const teamMap = await loadTeamNames([match]);

  return {
    id: match.id,
    competitionId: match.competitionId,
    roundId: match.roundId,
    team1Id: match.team1Id,
    team1PartnerId: match.team1PartnerId,
    team1Partner2Id: match.team1Partner2Id,
    team1Name: matchSideName(teamMap, match.team1Id, match.team1PartnerId, match.team1Partner2Id),
    team2Id: match.team2Id,
    team2PartnerId: match.team2PartnerId,
    team2Partner2Id: match.team2Partner2Id,
    team2Name: matchSideName(teamMap, match.team2Id, match.team2PartnerId, match.team2Partner2Id),
    game1ScheduledStartTime: match.game1ScheduledStartTime,
    game2ScheduledStartTime: match.game2ScheduledStartTime,
  };
}

export async function reorderCompetitionMatches(
  reorders: { id: string; matchNumber: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // First pass: set temporary negative values to sidestep the unique constraint
    for (const { id, matchNumber } of reorders) {
      await tx
        .update(competitionMatch)
        .set({ matchNumber: -matchNumber })
        .where(eq(competitionMatch.id, id));
    }
    // Second pass: set the final values
    for (const { id, matchNumber } of reorders) {
      await tx.update(competitionMatch).set({ matchNumber }).where(eq(competitionMatch.id, id));
    }
  });
}

export async function createCompetitionMatch(data: {
  competitionId: string;
  roundId: string;
  poolId?: string | null;
  matchNumber: number;
  team1Id: string | null;
  team2Id: string | null;
  // Trios and duos only (partner2: duos only).
  team1PartnerId?: string | null;
  team1Partner2Id?: string | null;
  team2PartnerId?: string | null;
  team2Partner2Id?: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(competitionMatch)
    .values(data)
    .returning({ id: competitionMatch.id });
  return row.id;
}

export async function deleteCompetitionMatch(id: string): Promise<void> {
  await db.delete(competitionMatch).where(eq(competitionMatch.id, id));
}

export async function updateCompetitionMatchTeams(
  id: string,
  data: {
    team1Id: string | null;
    team2Id: string | null;
    // Trios and duos only (partner2: duos only).
    team1PartnerId?: string | null;
    team1Partner2Id?: string | null;
    team2PartnerId?: string | null;
    team2Partner2Id?: string | null;
    poolId?: string | null;
  },
): Promise<void> {
  await db.update(competitionMatch).set(data).where(eq(competitionMatch.id, id));
}

export async function updateCompetitionMatchSchedule(
  id: string,
  data: { game1ScheduledStartTime: Date | null; game2ScheduledStartTime: Date | null },
): Promise<void> {
  await db.update(competitionMatch).set(data).where(eq(competitionMatch.id, id));
}

// ---------------------------------------------------------------------------
// Pools (split-pool rounds)
// ---------------------------------------------------------------------------

export type CompetitionPoolListItem = {
  id: string;
  roundId: string;
  name: string;
  sortOrder: number;
  teamCount: number;
};

export async function getCompetitionPoolsByRound(
  roundId: string,
): Promise<CompetitionPoolListItem[]> {
  return db
    .select({
      id: competitionPool.id,
      roundId: competitionPool.roundId,
      name: competitionPool.name,
      sortOrder: competitionPool.sortOrder,
      teamCount: sql<number>`count(${competitionRoundTeamPool.id})::int`,
    })
    .from(competitionPool)
    .leftJoin(competitionRoundTeamPool, eq(competitionRoundTeamPool.poolId, competitionPool.id))
    .where(eq(competitionPool.roundId, roundId))
    .groupBy(competitionPool.id)
    .orderBy(asc(competitionPool.sortOrder));
}

export type CompetitionPoolOption = { id: string; name: string };

export async function getCompetitionPoolsForStandings(
  roundId: string,
): Promise<CompetitionPoolOption[]> {
  return db
    .select({ id: competitionPool.id, name: competitionPool.name })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, roundId))
    .orderBy(asc(competitionPool.sortOrder));
}

export async function createCompetitionPool(data: {
  roundId: string;
  name: string;
}): Promise<string> {
  const [{ maxSort }] = await db
    .select({ maxSort: sql<number>`coalesce(max(${competitionPool.sortOrder}), -1)::int` })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, data.roundId));

  const [row] = await db
    .insert(competitionPool)
    .values({ roundId: data.roundId, name: data.name, sortOrder: maxSort + 1 })
    .returning({ id: competitionPool.id });
  return row.id;
}

export async function renameCompetitionPool(id: string, name: string): Promise<void> {
  await db.update(competitionPool).set({ name }).where(eq(competitionPool.id, id));
}

export async function deleteCompetitionPool(id: string): Promise<void> {
  await db.delete(competitionPool).where(eq(competitionPool.id, id));
}

export async function reorderCompetitionPools(
  reorders: { id: string; sortOrder: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of reorders) {
      await tx.update(competitionPool).set({ sortOrder }).where(eq(competitionPool.id, id));
    }
  });
}

// ---------------------------------------------------------------------------
// Team <-> pool assignment (split-pool rounds)
// ---------------------------------------------------------------------------

export type CompetitionPoolTeamAssignment = {
  teamId: string;
  teamName: string;
  poolId: string | null;
};

export async function getCompetitionRoundTeamPoolAssignments(
  competitionId: string,
  roundId: string,
): Promise<CompetitionPoolTeamAssignment[]> {
  return db
    .select({
      teamId: competitionTeam.id,
      teamName: competitionTeam.name,
      poolId: competitionRoundTeamPool.poolId,
    })
    .from(competitionTeam)
    .leftJoin(
      competitionRoundTeamPool,
      and(
        eq(competitionRoundTeamPool.teamId, competitionTeam.id),
        eq(competitionRoundTeamPool.roundId, roundId),
      ),
    )
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.name));
}

export async function assignTeamToPool(
  roundId: string,
  teamId: string,
  poolId: string,
): Promise<void> {
  await db
    .insert(competitionRoundTeamPool)
    .values({ roundId, teamId, poolId })
    .onConflictDoUpdate({
      target: [competitionRoundTeamPool.roundId, competitionRoundTeamPool.teamId],
      set: { poolId },
    });
}

export async function unassignTeamFromPool(roundId: string, teamId: string): Promise<void> {
  await db
    .delete(competitionRoundTeamPool)
    .where(
      and(
        eq(competitionRoundTeamPool.roundId, roundId),
        eq(competitionRoundTeamPool.teamId, teamId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Pool-scoped match generation (split-pool rounds)
// ---------------------------------------------------------------------------

export type PoolTeamItem = { id: string; name: string };

export async function getTeamsGroupedByPool(
  roundId: string,
): Promise<Map<string, { poolName: string; teams: PoolTeamItem[] }>> {
  const rows = await db
    .select({
      poolId: competitionPool.id,
      poolName: competitionPool.name,
      poolSortOrder: competitionPool.sortOrder,
      teamId: competitionTeam.id,
      teamName: competitionTeam.name,
    })
    .from(competitionRoundTeamPool)
    .innerJoin(competitionPool, eq(competitionPool.id, competitionRoundTeamPool.poolId))
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionRoundTeamPool.teamId))
    .where(eq(competitionRoundTeamPool.roundId, roundId))
    .orderBy(asc(competitionPool.sortOrder), asc(competitionTeam.name));

  const result = new Map<string, { poolName: string; teams: PoolTeamItem[] }>();
  for (const row of rows) {
    if (!result.has(row.poolId)) {
      result.set(row.poolId, { poolName: row.poolName, teams: [] });
    }
    result.get(row.poolId)!.teams.push({ id: row.teamId, name: row.teamName });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Match game assignments
// ---------------------------------------------------------------------------

export async function getMatchGameAssignments(matchId: string): Promise<MatchGameAssignment[]> {
  const rows = await db
    .select({
      id: competitionMatchGame.id,
      gameId: competitionMatchGame.gameId,
      gameNumber: competitionMatchGame.gameNumber,
      gameStartTime: game.startTime,
      gameDescription: game.description,
      team1GameTeamId: competitionMatchGame.team1GameTeamId,
      team2GameTeamId: competitionMatchGame.team2GameTeamId,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .where(eq(competitionMatchGame.matchId, matchId))
    .orderBy(asc(competitionMatchGame.gameNumber));

  if (rows.length === 0) return [];

  const teamIds = [
    ...new Set([...rows.map((r) => r.team1GameTeamId), ...rows.map((r) => r.team2GameTeamId)]),
  ];

  const gameTeams = await db
    .select({ id: competitionGameSide.id, colourEnum: competitionGameSide.colourEnum })
    .from(competitionGameSide)
    .where(inArray(competitionGameSide.id, teamIds));

  const colorMap = new Map(gameTeams.map((t) => [t.id, t.colourEnum]));

  return rows.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    gameNumber: r.gameNumber,
    gameStartTime: r.gameStartTime,
    gameDescription: r.gameDescription,
    team1GameTeamId: r.team1GameTeamId,
    team1ColourEnum: colorMap.get(r.team1GameTeamId) ?? 0,
    team2GameTeamId: r.team2GameTeamId,
    team2ColourEnum: colorMap.get(r.team2GameTeamId) ?? 0,
  }));
}

// The match-game columns for two game teams of either kind: a PDF-era legacy game's teams
// are sm5_pdf_game_team rows, everything else sm5_game_team.
async function matchGameSideColumns(
  team1GameTeamId: string,
  team2GameTeamId: string,
): Promise<
  | { team1Sm5GameTeamId: string; team2Sm5GameTeamId: string }
  | { team1PdfGameTeamId: string; team2PdfGameTeamId: string }
> {
  const pdfTeams = await db
    .select({ id: sm5PdfGameTeam.id })
    .from(sm5PdfGameTeam)
    .where(inArray(sm5PdfGameTeam.id, [team1GameTeamId, team2GameTeamId]));
  return pdfTeams.length > 0
    ? { team1PdfGameTeamId: team1GameTeamId, team2PdfGameTeamId: team2GameTeamId }
    : { team1Sm5GameTeamId: team1GameTeamId, team2Sm5GameTeamId: team2GameTeamId };
}

// Players rostered as mercenaries on any team of a match side — both trios or all three duos
// in those formats.
function sideMercenaryPlayerIdsSql(matchId: string, side: SQL): SQL {
  return sql`SELECT ctp.player_id
             FROM competition_team_player ctp
             JOIN competition_match cm
               ON ctp.competition_team_id IN (${side})
             WHERE cm.id = ${matchId}
               AND ctp.is_mercenary = true`;
}

export async function assignGameToMatch(
  matchId: string,
  gameId: string,
  gameNumber: number,
  team1GameTeamId: string,
  team2GameTeamId: string,
): Promise<void> {
  const sides = await matchGameSideColumns(team1GameTeamId, team2GameTeamId);
  await db.insert(competitionMatchGame).values({ matchId, gameId, gameNumber, ...sides });

  // Apply mercenary flags from competition_team_player to the newly assigned game's scorecards.
  // Only one of the two updates can match, since a game team is TDF or PDF-era, never both.
  for (const [gameTeamId, side] of [
    [team1GameTeamId, CM_SIDE1],
    [team2GameTeamId, CM_SIDE2],
  ] as const) {
    const mercenaries = sideMercenaryPlayerIdsSql(matchId, side);
    await db
      .update(sm5Scorecard)
      .set({ isMercenary: true })
      .where(
        and(eq(sm5Scorecard.teamId, gameTeamId), sql`${sm5Scorecard.playerId} IN (${mercenaries})`),
      );
    await db
      .update(sm5PdfScorecard)
      .set({ isMercenary: true })
      .where(
        and(
          eq(sm5PdfScorecard.teamId, gameTeamId),
          sql`${sm5PdfScorecard.playerId} IN (${mercenaries})`,
        ),
      );
  }
}

export async function removeGameFromMatch(matchGameId: string): Promise<void> {
  await db.delete(competitionMatchGame).where(eq(competitionMatchGame.id, matchGameId));
}

export async function getUnassignedCompetitionGames(
  competitionId: string,
): Promise<UnassignedCompetitionGame[]> {
  const assignedGameIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .where(eq(competitionMatch.competitionId, competitionId));

  const gameRows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      description: game.description,
      centerName: center.name,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(and(eq(game.competitionId, competitionId), not(inArray(game.id, assignedGameIds))))
    .orderBy(asc(game.startTime));

  if (gameRows.length === 0) return [];

  const gameIds = gameRows.map((g) => g.id);
  const teamRows = [
    ...(await db
      .select({
        gameId: sm5GameTeam.gameId,
        id: sm5GameTeam.id,
        name: sm5GameTeam.name,
        colourEnum: sm5GameTeam.colourEnum,
      })
      .from(sm5GameTeam)
      .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))),
    // PDF-era legacy games have no neutral team.
    ...(await db
      .select({
        gameId: sm5PdfGameTeam.gameId,
        id: sm5PdfGameTeam.id,
        name: sm5PdfGameTeam.name,
        colourEnum: sm5PdfGameTeam.colourEnum,
      })
      .from(sm5PdfGameTeam)
      .where(inArray(sm5PdfGameTeam.gameId, gameIds))),
  ];

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    if (!teamsByGame.has(t.gameId)) teamsByGame.set(t.gameId, []);
    teamsByGame.get(t.gameId)!.push(t);
  }

  return gameRows.map((g) => ({
    id: g.id,
    startTime: g.startTime,
    description: g.description,
    centerName: g.centerName,
    teams: (teamsByGame.get(g.id) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      colourEnum: t.colourEnum,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Game-page competition management
// ---------------------------------------------------------------------------

export type AvailableMatch = {
  id: string;
  matchNumber: number;
  roundName: string;
  team1Name: string;
  team2Name: string;
  availableGameNumbers: number[];
};

export type GameMatchAssignment = {
  matchGameId: string;
  matchId: string;
  matchNumber: number;
  gameNumber: number;
  roundName: string;
  team1GameTeamId: string;
  // Side display name: every team on it joined ("A & B", "A & B & C") in trios and duos.
  team1Name: string;
  team2GameTeamId: string;
  team2Name: string;
};

export async function getAvailableMatchesForGame(competitionId: string): Promise<AvailableMatch[]> {
  const matchRows = await db
    .select({
      id: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundName: competitionRound.name,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  const teamMap = await loadTeamNames(matchRows);

  const matchIds = matchRows.map((m) => m.id);
  const assignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
    })
    .from(competitionMatchGame)
    .where(inArray(competitionMatchGame.matchId, matchIds));

  const takenMap = new Map<string, Set<number>>();
  for (const a of assignments) {
    if (!takenMap.has(a.matchId)) takenMap.set(a.matchId, new Set());
    takenMap.get(a.matchId)!.add(a.gameNumber);
  }

  return matchRows
    .map((m) => {
      const taken = takenMap.get(m.id) ?? new Set();
      const availableGameNumbers = [1, 2].filter((n) => !taken.has(n));
      return {
        id: m.id,
        matchNumber: m.matchNumber,
        roundName: m.roundName,
        team1Name: matchSideName(teamMap, m.team1Id, m.team1PartnerId, m.team1Partner2Id),
        team2Name: matchSideName(teamMap, m.team2Id, m.team2PartnerId, m.team2Partner2Id),
        availableGameNumbers,
      };
    })
    .filter((m) => m.availableGameNumbers.length > 0);
}

// ---------------------------------------------------------------------------
// Competition admin game tables
// ---------------------------------------------------------------------------

export type CompetitionUnassignedGame = {
  id: string;
  slug: string;
  startTime: Date;
  description: string | null;
  centerName: string;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
};

export type CompetitionAssignedGame = {
  id: string;
  slug: string;
  matchGameId: string;
  roundName: string;
  matchNumber: number;
  gameNumber: number;
  team1Name: string;
  team1ColourEnum: number;
  team2Name: string;
  team2ColourEnum: number;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
};

export async function getCompetitionUnassignedGamesForAdmin(
  competitionId: string,
): Promise<CompetitionUnassignedGame[]> {
  const assignedIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .where(eq(competitionMatch.competitionId, competitionId));

  return db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      startTime: game.startTime,
      description: game.description,
      centerName: center.name,
      outcome: game.outcome,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        not(inArray(game.id, assignedIds)),
        eq(game.exclude, false),
      ),
    )
    .orderBy(asc(game.startTime));
}

export async function getCompetitionAssignedGamesForAdmin(
  competitionId: string,
): Promise<CompetitionAssignedGame[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      matchGameId: competitionMatchGame.id,
      roundName: competitionRound.name,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      team1ColourEnum: sql<number>`t1.colour_enum`,
      team2ColourEnum: sql<number>`t2.colour_enum`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(sql`competition_game_side t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`competition_game_side t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (rows.length === 0) return [];

  const teamMap = await loadTeamNames(rows);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    matchGameId: r.matchGameId,
    roundName: r.roundName,
    matchNumber: r.matchNumber,
    gameNumber: r.gameNumber,
    team1Name: matchSideName(teamMap, r.team1Id, r.team1PartnerId, r.team1Partner2Id),
    team1ColourEnum: r.team1ColourEnum,
    team2Name: matchSideName(teamMap, r.team2Id, r.team2PartnerId, r.team2Partner2Id),
    team2ColourEnum: r.team2ColourEnum,
    startTime: r.startTime,
    outcome: r.outcome,
    centerName: r.centerName,
  }));
}

export type CompetitionGameNav = {
  prevSlug: string | null;
  nextSlug: string | null;
  position: number;
  total: number;
};

export async function getCompetitionGameNavigation(
  competitionId: string,
  currentGameId: string,
): Promise<CompetitionGameNav | null> {
  const rows = await db
    .select({
      gameId: competitionMatchGame.gameId,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  const idx = rows.findIndex((r) => r.gameId === currentGameId);
  if (idx === -1) return null;

  return {
    prevSlug: idx > 0 ? rows[idx - 1].slug : null,
    nextSlug: idx < rows.length - 1 ? rows[idx + 1].slug : null,
    position: idx + 1,
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Competitive competition list (public-facing pages)
// ---------------------------------------------------------------------------

export type CompetitiveCompetitionSummary = {
  id: string;
  name: string;
  slug: string;
  format: CompetitionFormat;
  state: "preshow" | "upcoming" | "active" | "completed";
  startDate: string;
  endDate: string | null;
  challongeLink: string | null;
  challongeBracketHeight: number | null;
};

export async function getCompetitiveCompetitions(): Promise<CompetitiveCompetitionSummary[]> {
  return db
    .select({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      format: competition.format,
      state: competition.state,
      startDate: competition.startDate,
      endDate: competition.endDate,
      challongeLink: competition.challongeLink,
      challongeBracketHeight: competition.challongeBracketHeight,
    })
    .from(competition)
    .where(and(eq(competition.type, "competitive"), ne(competition.state, "preshow")))
    .orderBy(desc(competition.startDate));
}

export type BrowsableCompetition = {
  id: string;
  name: string;
  slug: string;
  category: CompetitionCategory;
  format: CompetitionFormat;
  state: CompetitionState;
  startDate: string;
  endDate: string | null;
  description: string | null;
  hostCenterName: string | null;
  gameCount: number;
  /**
   * Teams for a team competition, enrolled players for a solo one — the two are never
   * both populated, since a competition uses one roster model or the other.
   */
  participantCount: number;
};

/**
 * Every competition the public browse page (`/competitions`) lists, newest first.
 *
 * Scoped the same way as `getCompetitiveCompetitions()` — competitive only, and no
 * preshow events, which are not public yet. Callers group the result by `category`.
 */
export async function getBrowsableCompetitions(): Promise<BrowsableCompetition[]> {
  const rows = await db
    .select({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      category: competition.category,
      format: competition.format,
      state: competition.state,
      startDate: competition.startDate,
      endDate: competition.endDate,
      description: competition.description,
      hostCenterName: center.name,
      gameCount: sql<number>`count(distinct ${game.id})::int`,
      teamCount: sql<number>`count(distinct ${competitionTeam.id})::int`,
      playerCount: sql<number>`count(distinct ${competitionPlayer.id})::int`,
    })
    .from(competition)
    .leftJoin(center, eq(competition.hostCenterId, center.id))
    .leftJoin(game, and(eq(game.competitionId, competition.id), eq(game.exclude, false)))
    .leftJoin(competitionTeam, eq(competitionTeam.competitionId, competition.id))
    .leftJoin(competitionPlayer, eq(competitionPlayer.competitionId, competition.id))
    .where(and(eq(competition.type, "competitive"), ne(competition.state, "preshow")))
    .groupBy(competition.id, center.name)
    .orderBy(desc(competition.startDate));

  return rows.map(({ teamCount, playerCount, ...r }) => ({
    ...r,
    participantCount: r.format === "solo" ? playerCount : teamCount,
  }));
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type CompetitionStandingsRow = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamShortName: string | null;
  teamHasLogo: boolean;
  teamLogoVersion: number;
  teamLogoUrl: string | null;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  teamEliminations: number; // # of games where the opposing team was fully eliminated
  // Trios and duos: the team's own players' net score, and the net score of every opponent
  // they faced (see getPartnerScoreTotals). Otherwise the side's team score for and against.
  scoreFor: number;
  scoreAgainst: number;
  // Net competition_team_adjustment points, already included in matchPoints. Always 0 on a
  // single round's or pool's standings, which adjustments don't apply to.
  adjustmentPoints: number;
};

// Trios/duos tiebreak totals, keyed by competition team id. A trio's (or duo's) score is the sum
// of its rostered players' (mercs included) scorecard score net of their own non-rescinded
// penalties; "against" is the same sum over every scorecard on the opposing side. Team-level
// penalties and elimination bonuses can't be attributed to one team on a shared side, so they
// are left out of both — they still count towards game results and the match bonus.
async function getPartnerScoreTotals(
  conditions: SQL | undefined,
): Promise<Map<string, { scoreFor: number; scoreAgainst: number }>> {
  const rows = await db.execute<{ team_id: string; score_for: number; score_against: number }>(sql`
    WITH mg AS (
      SELECT competition_match_game.team1_game_team_id AS gt1,
             competition_match_game.team2_game_team_id AS gt2,
             competition_match.team1_id, competition_match.team1_partner_id,
             competition_match.team1_partner2_id,
             competition_match.team2_id, competition_match.team2_partner_id,
             competition_match.team2_partner2_id
      FROM competition_match_game
      JOIN competition_match ON competition_match.id = competition_match_game.match_id
      JOIN competition_round ON competition_round.id = competition_match.round_id
      JOIN game ON game.id = competition_match_game.game_id
      WHERE ${conditions}
    ),
    slot AS (
      SELECT team1_id AS team_id, gt1 AS own_gt, gt2 AS opp_gt FROM mg
      UNION ALL SELECT team1_partner_id, gt1, gt2 FROM mg
      UNION ALL SELECT team1_partner2_id, gt1, gt2 FROM mg
      UNION ALL SELECT team2_id, gt2, gt1 FROM mg
      UNION ALL SELECT team2_partner_id, gt2, gt1 FROM mg
      UNION ALL SELECT team2_partner2_id, gt2, gt1 FROM mg
    ),
    net AS (
      SELECT sc.team_id, sc.player_id,
             sc.score + coalesce((SELECT sum(p.score_value) FROM sm5_game_penalty p
                                  WHERE p.scorecard_id = sc.id AND NOT p.rescinded), 0) AS net_score
      FROM sm5_scorecard sc
      WHERE sc.team_id IN (SELECT gt1 FROM mg UNION SELECT gt2 FROM mg)
    )
    SELECT slot.team_id,
           coalesce(sum((SELECT sum(n.net_score) FROM net n
                         JOIN competition_team_player ctp
                           ON ctp.player_id = n.player_id AND ctp.competition_team_id = slot.team_id
                         WHERE n.team_id = slot.own_gt)), 0)::int AS score_for,
           coalesce(sum((SELECT sum(n.net_score) FROM net n WHERE n.team_id = slot.opp_gt)), 0)::int
             AS score_against
    FROM slot
    WHERE slot.team_id IS NOT NULL
    GROUP BY slot.team_id`);
  return new Map(
    [...rows].map((r) => [
      r.team_id,
      { scoreFor: Number(r.score_for), scoreAgainst: Number(r.score_against) },
    ]),
  );
}

export async function getCompetitionStandings(
  competitionId: string,
  roundId?: string,
  poolId?: string,
): Promise<CompetitionStandingsRow[]> {
  // Pull every assigned match-game with both teams' scores and results.
  // We need:
  //   - match-level W/L/D (compare combined score+elim_bonus across both games)
  //   - game-level W/L/D (sm5_game_team.result per game)
  //   - full-team eliminations (opposing sm5_game_team.eliminated = true)
  //   - score totals for ratio
  //
  // Standings are computed from 'pool' and 'split-pool' rounds; optionally narrowed to a
  // single round and/or a single pool (for split-pool rounds).
  //
  // In a trios or duos competition each side is two trios or three duos: every one is credited
  // with the side's points, and the score ratio is replaced by each team's own player score
  // (getPartnerScoreTotals).

  const conditions = and(
    eq(competitionMatch.competitionId, competitionId),
    // An excluded game left in a match slot counts as not yet reported.
    eq(game.exclude, false),
    roundId ? eq(competitionMatch.roundId, roundId) : ne(competitionRound.type, "finals"),
    poolId ? eq(competitionMatch.poolId, poolId) : undefined,
  );

  const [comp] = await db
    .select({ format: competition.format })
    .from(competition)
    .where(eq(competition.id, competitionId));
  const partnered = comp ? isPartnerFormat(comp.format) : false;

  const gameRows: StandingsGameRow[] = await db
    .select({
      matchId: competitionMatch.id,
      gameNumber: competitionMatchGame.gameNumber,
      roundMultiplier: competitionRound.multiplier,
      // team1 perspective
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team1Score: sql<number>`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team1Result: sql<string>`t1.result`,
      team1EliminatedOpponent: sql<boolean>`t2.eliminated`,
      // team2 perspective
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      team2Score: sql<number>`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
      team2Result: sql<string>`t2.result`,
      team2EliminatedOpponent: sql<boolean>`t1.eliminated`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(sql`competition_game_side t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`competition_game_side t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(conditions);

  const stats = computeTeamStats(gameRows);
  if (partnered) {
    const ownScores = await getPartnerScoreTotals(conditions);
    for (const [teamId, s] of stats) {
      const own = ownScores.get(teamId) ?? { scoreFor: 0, scoreAgainst: 0 };
      s.scoreFor = own.scoreFor;
      s.scoreAgainst = own.scoreAgainst;
    }
  }
  // Adjustments belong to no round, so they count on the whole-competition standings only.
  if (!roundId && !poolId) {
    applyTeamAdjustments(stats, await getCompetitionTeamAdjustments(competitionId));
  }

  // Fetch team names (including 0-game teams). For a specific pool, only include teams
  // assigned to that pool; otherwise all teams in the competition.
  const allTeams = poolId
    ? await db
        .select({
          id: competitionTeam.id,
          name: competitionTeam.name,
          slug: competitionTeam.slug,
          shortName: competitionTeam.shortName,
          hasLogo: competitionTeam.hasLogo,
          logoVersion: competitionTeam.logoVersion,
        })
        .from(competitionTeam)
        .innerJoin(
          competitionRoundTeamPool,
          eq(competitionRoundTeamPool.teamId, competitionTeam.id),
        )
        .where(
          and(
            eq(competitionTeam.competitionId, competitionId),
            eq(competitionRoundTeamPool.poolId, poolId),
          ),
        )
        .orderBy(asc(competitionTeam.name))
    : await db
        .select({
          id: competitionTeam.id,
          name: competitionTeam.name,
          slug: competitionTeam.slug,
          shortName: competitionTeam.shortName,
          hasLogo: competitionTeam.hasLogo,
          logoVersion: competitionTeam.logoVersion,
        })
        .from(competitionTeam)
        .where(eq(competitionTeam.competitionId, competitionId))
        .orderBy(asc(competitionTeam.name));

  return allTeams
    .map((team) => {
      const s = stats.get(team.id) ?? emptyTeamStats();
      return {
        teamId: team.id,
        teamName: team.name,
        teamSlug: team.slug,
        teamShortName: team.shortName,
        teamHasLogo: team.hasLogo,
        teamLogoVersion: team.logoVersion,
        teamLogoUrl: team.hasLogo ? getTeamLogoUrl(team.id, team.logoVersion) : null,
        ...s,
      };
    })
    .sort(compareStandings);
}

// ---------------------------------------------------------------------------
// Match results (standings page)
// ---------------------------------------------------------------------------

export type MatchResultPartner = {
  id: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
};

export type CompetitionMatchResult = {
  matchId: string;
  matchNumber: number;
  roundId: string;
  roundName: string;
  roundNumber: number;
  roundMultiplier: number;
  team1Id: string | null;
  team1Name: string;
  team1Slug: string | null;
  team1ShortName: string | null;
  team1HasLogo: boolean;
  team1LogoVersion: number;
  team2Id: string | null;
  team2Name: string;
  team2Slug: string | null;
  team2ShortName: string | null;
  team2HasLogo: boolean;
  team2LogoVersion: number;
  // Trios and duos: the other teams on each side (one trio, or two duos), credited with
  // everything their side earns. Empty in every other format.
  team1Partners: MatchResultPartner[];
  team2Partners: MatchResultPartner[];
  games: {
    gameNumber: number;
    gameId: string;
    gameSlug: string;
    startTime: Date;
    team1Score: number | null;
    team2Score: number | null;
    team1Result: string | null;
    team2Result: string | null;
    team1ColourEnum: number;
    team2ColourEnum: number;
  }[];
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
  // match-level outcome (compare combined scores across both games). A match left with a
  // single game once the competition is completed takes that game's result instead.
  matchWinner: "team1" | "team2" | "draw" | "incomplete";
  team1MatchPoints: number; // match bonus only (2/1/0, scaled by roundMultiplier)
  team2MatchPoints: number;
  team1TotalPoints: number; // game points + match bonus
  team2TotalPoints: number;
};

export async function getCompetitionMatchResults(
  competitionId: string,
  roundId?: string,
  // Defaults to every non-finals round type (finals are shown separately via FinalsContent).
  // Pass "all" for round play and finals together, as the team detail page does.
  roundTypes?: CompetitionRoundType | CompetitionRoundType[] | "all",
  poolId?: string,
): Promise<CompetitionMatchResult[]> {
  const roundTypeCondition =
    roundTypes === undefined
      ? ne(competitionRound.type, "finals")
      : roundTypes === "all"
        ? undefined
        : inArray(competitionRound.type, Array.isArray(roundTypes) ? roundTypes : [roundTypes]);
  const gameRows = await db
    .select({
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundId: competitionRound.id,
      roundName: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      roundMultiplier: competitionRound.multiplier,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
      gameNumber: competitionMatchGame.gameNumber,
      gameId: game.id,
      gameStartTime: game.startTime,
      gameSlug: sql<
        string | null
      >`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      team1Score: sql<
        number | null
      >`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team2Score: sql<
        number | null
      >`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
      team1Result: sql<string | null>`t1.result`,
      team2Result: sql<string | null>`t2.result`,
      team1ColourEnum: sql<number | null>`t1.colour_enum`,
      team2ColourEnum: sql<number | null>`t2.colour_enum`,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.matchId, competitionMatch.id))
    // Excluded games join as null, so their slot reads as unreported (skipped below) and
    // match points agree with getCompetitionStandings().
    .leftJoin(game, and(eq(game.id, competitionMatchGame.gameId), eq(game.exclude, false)))
    .leftJoin(center, eq(center.id, game.centerId))
    .leftJoin(sql`competition_game_side t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .leftJoin(sql`competition_game_side t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        roundTypeCondition,
        roundId ? eq(competitionMatch.roundId, roundId) : undefined,
        poolId ? eq(competitionMatch.poolId, poolId) : undefined,
      ),
    )
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (gameRows.length === 0) return [];

  // Once a competition is completed no more games are coming, so a match left with a single
  // game (a one-game round, or an unplayed second game) is final rather than in progress.
  const [comp] = await db
    .select({ state: competition.state })
    .from(competition)
    .where(eq(competition.id, competitionId));
  const completed = comp?.state === "completed";

  // Fetch team names and short names
  const teamIds = matchSideTeamIds(gameRows);
  const teams =
    teamIds.length > 0
      ? await db
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
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Group into matches
  const matchOrder: string[] = [];
  const matchMap = new Map<
    string,
    Omit<
      CompetitionMatchResult,
      | "matchWinner"
      | "team1MatchPoints"
      | "team2MatchPoints"
      | "team1TotalPoints"
      | "team2TotalPoints"
    > & { games: CompetitionMatchResult["games"] }
  >();

  for (const row of gameRows) {
    if (!matchMap.has(row.matchId)) {
      matchOrder.push(row.matchId);
      const t1 = row.team1Id ? teamMap.get(row.team1Id) : undefined;
      const t2 = row.team2Id ? teamMap.get(row.team2Id) : undefined;
      const partners = (...ids: (string | null)[]) =>
        sideTeamIds(...ids).flatMap((id) => teamMap.get(id) ?? []);
      matchMap.set(row.matchId, {
        matchId: row.matchId,
        matchNumber: row.matchNumber,
        roundId: row.roundId,
        roundName: row.roundName,
        roundNumber: row.roundNumber,
        roundMultiplier: row.roundMultiplier,
        team1Id: row.team1Id,
        team1Name: row.team1Id ? (t1?.name ?? "Unknown") : "TBD",
        team1Slug: t1?.slug ?? null,
        team1ShortName: t1?.shortName ?? null,
        team1HasLogo: t1?.hasLogo ?? false,
        team1LogoVersion: t1?.logoVersion ?? 0,
        team2Id: row.team2Id,
        team2Name: row.team2Id ? (t2?.name ?? "Unknown") : "TBD",
        team2Slug: t2?.slug ?? null,
        team2ShortName: t2?.shortName ?? null,
        team2HasLogo: t2?.hasLogo ?? false,
        team2LogoVersion: t2?.logoVersion ?? 0,
        team1Partners: partners(row.team1PartnerId, row.team1Partner2Id),
        team2Partners: partners(row.team2PartnerId, row.team2Partner2Id),
        games: [],
        game1ScheduledStartTime: row.game1ScheduledStartTime,
        game2ScheduledStartTime: row.game2ScheduledStartTime,
      });
    }
    if (row.gameId === null || row.gameNumber === null) continue;
    matchMap.get(row.matchId)!.games.push({
      gameNumber: row.gameNumber,
      gameId: row.gameId,
      gameSlug: row.gameSlug!,
      startTime: row.gameStartTime!,
      team1Score: row.team1Score,
      team2Score: row.team2Score,
      team1Result: row.team1Result,
      team2Result: row.team2Result,
      team1ColourEnum: row.team1ColourEnum!,
      team2ColourEnum: row.team2ColourEnum!,
    });
  }

  return matchOrder.map((id) => {
    const m = matchMap.get(id)!;

    // Game points: 2 per win, 1 per draw — always reflect what's been reported so far.
    // Everything the match is worth is scaled by the round multiplier.
    const mult = m.roundMultiplier;
    let t1GamePoints = 0;
    let t2GamePoints = 0;
    for (const g of m.games) {
      if (g.team1Result === "win") {
        t1GamePoints += 2 * mult;
      } else if (g.team2Result === "win") {
        t2GamePoints += 2 * mult;
      } else {
        t1GamePoints += mult;
        t2GamePoints += mult;
      }
    }

    if (m.games.length < 2) {
      // No match bonus without both games, matching getCompetitionStandings(); a finished
      // single-game match is still decided by its game's result (which respects eliminations).
      const [only] = m.games;
      const matchWinner: CompetitionMatchResult["matchWinner"] =
        !completed || !only
          ? "incomplete"
          : only.team1Result === "win"
            ? "team1"
            : only.team2Result === "win"
              ? "team2"
              : "draw";
      return {
        ...m,
        matchWinner,
        team1MatchPoints: 0,
        team2MatchPoints: 0,
        team1TotalPoints: t1GamePoints,
        team2TotalPoints: t2GamePoints,
      };
    }

    const t1Total = m.games.reduce((s, g) => s + (g.team1Score ?? 0), 0);
    const t2Total = m.games.reduce((s, g) => s + (g.team2Score ?? 0), 0);
    let matchWinner: CompetitionMatchResult["matchWinner"];
    let team1MatchPoints: number;
    let team2MatchPoints: number;
    if (t1Total > t2Total) {
      matchWinner = "team1";
      team1MatchPoints = 2 * mult;
      team2MatchPoints = 0;
    } else if (t2Total > t1Total) {
      matchWinner = "team2";
      team1MatchPoints = 0;
      team2MatchPoints = 2 * mult;
    } else {
      matchWinner = "draw";
      team1MatchPoints = mult;
      team2MatchPoints = mult;
    }

    return {
      ...m,
      matchWinner,
      team1MatchPoints,
      team2MatchPoints,
      team1TotalPoints: t1GamePoints + team1MatchPoints,
      team2TotalPoints: t2GamePoints + team2MatchPoints,
    };
  });
}

export async function getGameMatchAssignment(gameId: string): Promise<GameMatchAssignment | null> {
  const [row] = await db
    .select({
      matchGameId: competitionMatchGame.id,
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      roundName: competitionRound.name,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      team1GameTeamId: competitionMatchGame.team1GameTeamId,
      team2GameTeamId: competitionMatchGame.team2GameTeamId,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatchGame.gameId, gameId));

  if (!row) return null;

  const teamMap = await loadTeamNames([row]);

  return {
    matchGameId: row.matchGameId,
    matchId: row.matchId,
    matchNumber: row.matchNumber,
    gameNumber: row.gameNumber,
    roundName: row.roundName,
    team1GameTeamId: row.team1GameTeamId,
    team1Name: matchSideName(teamMap, row.team1Id, row.team1PartnerId, row.team1Partner2Id),
    team2GameTeamId: row.team2GameTeamId,
    team2Name: matchSideName(teamMap, row.team2Id, row.team2PartnerId, row.team2Partner2Id),
  };
}

// ---------------------------------------------------------------------------
// Forfeit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Top Players
// ---------------------------------------------------------------------------

export type PositionStats = {
  avgMvp: number | null;
  avgAccuracy: number | null;
  wins: number;
  totalGames: number;
};

export type CompetitionTopPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  avgMvp: number;
  mvpPerMinute: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  wins: number;
  totalGames: number;
  byPosition: Partial<Record<number, PositionStats>>;
};

export type CompetitionTopPlayersOptions = {
  showPool?: boolean;
  showFinals?: boolean;
  showMercs?: boolean;
};

// "Rounds" (showPool) means every non-finals round type, whatever those turn out to be —
// this must stay a "not finals" check rather than an enumerated list so newly added
// round types (beyond pool/split-pool/wildcard) are included automatically.
function roundTypeSqlCondition(showPool: boolean, showFinals: boolean): SQL | null {
  if (showPool && showFinals) return sql`true`;
  if (showPool) return sql`cr.type <> 'finals'`;
  if (showFinals) return sql`cr.type = 'finals'`;
  return null;
}

export async function getCompetitionTopPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTopPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      totalTimeInGameSec: sql<number>`sum(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}) / 1000.0`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      // Per-position stats (positions 1–5)
      p1AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
      p1Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1 and ${sm5GameTeam.result} = 'win')::int`,
      p1Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1)::int`,
      p2AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
      p2Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2 and ${sm5GameTeam.result} = 'win')::int`,
      p2Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2)::int`,
      p3AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
      p3Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3 and ${sm5GameTeam.result} = 'win')::int`,
      p3Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3)::int`,
      p4AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
      p4Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4 and ${sm5GameTeam.result} = 'win')::int`,
      p4Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4)::int`,
      p5AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
      p5Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5 and ${sm5GameTeam.result} = 'win')::int`,
      p5Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  function posStats(
    avgMvp: number | null,
    avgAccuracy: number | null,
    wins: number,
    games: number,
  ): PositionStats | undefined {
    if (Number(games) === 0) return undefined;
    return {
      avgMvp: avgMvp !== null ? Number(avgMvp) : null,
      avgAccuracy: avgAccuracy !== null ? Number(avgAccuracy) : null,
      wins: Number(wins),
      totalGames: Number(games),
    };
  }

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    mvpPerMinute:
      r.totalTimeInGameSec > 0 ? Number(r.totalMvp) / (Number(r.totalTimeInGameSec) / 60) : 0,
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    byPosition: {
      1: posStats(r.p1AvgMvp, r.p1AvgAccuracy, r.p1Wins, r.p1Games),
      2: posStats(r.p2AvgMvp, r.p2AvgAccuracy, r.p2Wins, r.p2Games),
      3: posStats(r.p3AvgMvp, r.p3AvgAccuracy, r.p3Wins, r.p3Games),
      4: posStats(r.p4AvgMvp, r.p4AvgAccuracy, r.p4Wins, r.p4Games),
      5: posStats(r.p5AvgMvp, r.p5AvgAccuracy, r.p5Wins, r.p5Games),
    },
  }));
}

export type CompetitionCommanderPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgMissilesHitOpponent: number;
  nukeSuccessRatio: number | null;
  avgNukeLength: number | null;
  avgNukeEfficiency: number | null;
};

export async function getCompetitionCommanderPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionCommanderPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 1),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgMissilesHitOpponent: sql<number>`avg(${sm5Scorecard.missilesHitOpponent})`,
      nukeSuccessRatio: sql<
        number | null
      >`sum(${sm5Scorecard.nukesDetonated})::float / nullif(sum(${sm5Scorecard.nukesActivated}), 0)`,
      avgNukeLength: sql<number | null>`avg(${sm5Scorecard.averageNukeActivationTime})`,
      avgNukeEfficiency: sql<number | null>`avg(${sm5Scorecard.livesRemovedByNuke})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgMissilesHitOpponent: Number(r.avgMissilesHitOpponent),
    nukeSuccessRatio: r.nukeSuccessRatio !== null ? Number(r.nukeSuccessRatio) : null,
    avgNukeLength: r.avgNukeLength !== null ? Number(r.avgNukeLength) : null,
    avgNukeEfficiency: r.avgNukeEfficiency !== null ? Number(r.avgNukeEfficiency) : null,
  }));
}

export type CompetitionPositionPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
};

export async function getCompetitionTopPlayersByPosition(
  competitionId: string,
  position: number,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionPositionPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypeCondition = roundTypeSqlCondition(showPool, showFinals);
  if (!roundTypeCondition) return [];

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      JOIN game g ON g.id = cmg.game_id
      WHERE cm.competition_id = ${competitionId}
        AND ${roundTypeCondition}
        AND g.exclude = false
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, position),
  ];

  if (!showMercs) {
    conditions.push(eq(sm5Scorecard.isMercenary, false));
  }

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
  }));
}

export type CompetitionHeavyPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgMissilesHitOpponent: number;
};

export async function getCompetitionHeavyPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionHeavyPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 2),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgMissilesHitOpponent: sql<number>`avg(${sm5Scorecard.missilesHitOpponent})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgMissilesHitOpponent: Number(r.avgMissilesHitOpponent),
  }));
}

export type CompetitionScoutPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgShotsHitOpponent3hit: number;
  avgAssists: number;
  avgRapidFire: number | null;
  avgRapidFireDuration: number | null;
};

export async function getCompetitionScoutPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionScoutPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 3),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgShotsHitOpponent3hit: sql<number>`avg(${sm5Scorecard.shotsHitOpponent3hit})`,
      avgAssists: sql<number>`avg(${sm5Scorecard.assists})`,
      avgRapidFire: sql<number | null>`avg(${sm5Scorecard.rapidFire})`,
      avgRapidFireDuration: sql<number | null>`avg(${sm5Scorecard.averageRapidTime})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgShotsHitOpponent3hit: Number(r.avgShotsHitOpponent3hit),
    avgAssists: Number(r.avgAssists),
    avgRapidFire: r.avgRapidFire !== null ? Number(r.avgRapidFire) : null,
    avgRapidFireDuration: r.avgRapidFireDuration !== null ? Number(r.avgRapidFireDuration) : null,
  }));
}

export type CompetitionAmmoPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgAmmoBoost: number | null;
  avgResuppliesGiven: number | null;
  avgDoubleResuppliesGiven: number | null;
};

export async function getCompetitionAmmoPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionAmmoPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 4),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgAmmoBoost: sql<number | null>`avg(${sm5Scorecard.ammoBoost})`,
      avgResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.resuppliesGiven})`,
      avgDoubleResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.doubleResuppliesGiven})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgAmmoBoost: r.avgAmmoBoost !== null ? Number(r.avgAmmoBoost) : null,
    avgResuppliesGiven: r.avgResuppliesGiven !== null ? Number(r.avgResuppliesGiven) : null,
    avgDoubleResuppliesGiven:
      r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
  }));
}

export type CompetitionMedicPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgLifeBoost: number | null;
  avgResuppliesGiven: number | null;
  avgDoubleResuppliesGiven: number | null;
  survivalRate: number;
};

export async function getCompetitionMedicPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMedicPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 5),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgLifeBoost: sql<number | null>`avg(${sm5Scorecard.lifeBoost})`,
      avgResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.resuppliesGiven})`,
      avgDoubleResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.doubleResuppliesGiven})`,
      survived: sql<number>`count(*) filter (where ${sm5Scorecard.eliminated} = false)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgLifeBoost: r.avgLifeBoost !== null ? Number(r.avgLifeBoost) : null,
    avgResuppliesGiven: r.avgResuppliesGiven !== null ? Number(r.avgResuppliesGiven) : null,
    avgDoubleResuppliesGiven:
      r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
    survivalRate: Number(r.totalGames) > 0 ? Number(r.survived) / Number(r.totalGames) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Scope-aware leaderboard game selection
// ---------------------------------------------------------------------------

/** Raw `g.start_time` range fragments for the aliased subquery (social/all scope only). */
function dateRangeSqlForAlias(filter: { dateFrom?: string; dateTo?: string }): SQL[] {
  const parts: SQL[] = [];
  if (filter.dateFrom) parts.push(sql`g.start_time >= ${filter.dateFrom}::date`);
  if (filter.dateTo) parts.push(sql`g.start_time < (${filter.dateTo}::date + interval '1 day')`);
  return parts;
}

/** Selects games for an aliased `g` game row matching the scope. */
function scopeWhereForAlias(scopeFilter: GameScopeFilter): SQL {
  switch (scopeFilter.scope) {
    case "social": {
      const parts: SQL[] = [sql`g.competition_id IS NULL`];
      if (scopeFilter.centerId) parts.push(sql`g.center_id = ${scopeFilter.centerId}`);
      parts.push(...dateRangeSqlForAlias(scopeFilter));
      return sql.join(parts, sql` AND `);
    }
    case "competition":
      return scopeFilter.competitionId
        ? sql`g.competition_id = ${scopeFilter.competitionId}`
        : sql`g.competition_id IS NOT NULL`;
    case "all": {
      const parts: SQL[] = [];
      if (scopeFilter.centerId) parts.push(sql`g.center_id = ${scopeFilter.centerId}`);
      parts.push(...dateRangeSqlForAlias(scopeFilter));
      return parts.length ? sql.join(parts, sql` AND `) : sql`TRUE`;
    }
  }
}

/**
 * WHERE conditions selecting player scorecards for a leaderboard, across any
 * scope (social / competition / all). For a *specific* team-format competition the
 * games are selected via the match/round structure so the pool/finals toggles apply;
 * for a *solo* competition there is no match structure at all, so every non-excluded
 * game assigned to the competition counts and those toggles are meaningless. For every
 * other scope games are selected straight from the game table by scope.
 * Mercenaries are excluded unless `showMercs`. Returns null when a specific
 * competition's round selection is empty (caller should return no rows).
 */
/**
 * The non-excluded games a competition-scoped leaderboard covers, as a `SELECT game_id`
 * subquery, or null when the round toggles select nothing. Shared with the PDF-era variants in
 * competition-legacy.ts, which read a different scorecard source over the same games.
 */
export function competitionScopeGameIdsSql(
  competitionId: string,
  format: CompetitionFormat | undefined,
  options: CompetitionTopPlayersOptions,
): SQL | null {
  const { showPool = true, showFinals = false } = options;
  if (format && !hasMatchStructure(format)) {
    // No matches or rounds: take every non-excluded game assigned to the competition.
    // Covers both `solo` and `none` — neither has a match structure to select through.
    // Deliberately does not consult roundTypeSqlCondition — that returns null when both
    // toggles are off, which would blank such a leaderboard for no reason.
    return sql`
        SELECT g.id
        FROM game g
        WHERE g.competition_id = ${competitionId}
          AND g.exclude = false
      `;
  }
  const roundTypeCondition = roundTypeSqlCondition(showPool, showFinals);
  if (!roundTypeCondition) return null;
  return sql`
        SELECT cmg.game_id
        FROM competition_match_game cmg
        JOIN competition_match cm ON cm.id = cmg.match_id
        JOIN competition_round cr ON cr.id = cm.round_id
        JOIN game g ON g.id = cmg.game_id
        WHERE cm.competition_id = ${competitionId}
          AND ${roundTypeCondition}
          AND g.exclude = false
      `;
}

function leaderboardScopeConditions(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions,
  extra: SQL[] = [],
): SQL[] | null {
  const { showMercs = false } = options;

  let gameSelect: SQL;
  if (scopeFilter.scope === "competition" && scopeFilter.competitionId) {
    const gameIds = competitionScopeGameIdsSql(
      scopeFilter.competitionId,
      scopeFilter.format,
      options,
    );
    if (!gameIds) return null;
    gameSelect = sql`${sm5GameTeam.gameId} IN (${gameIds})`;
  } else {
    gameSelect = sql`${sm5GameTeam.gameId} IN (
      SELECT g.id FROM game g WHERE g.exclude = false AND (${scopeWhereForAlias(scopeFilter)})
    )`;
  }

  const conditions: SQL[] = [gameSelect, sql`${sm5Scorecard.playerId} IS NOT NULL`, ...extra];
  if (!showMercs) conditions.push(eq(sm5Scorecard.isMercenary, false));
  return conditions;
}

// ---------------------------------------------------------------------------
// Per-position scorecard leaderboards (individual game scorecards, not averages)
// ---------------------------------------------------------------------------

export type CompetitionPositionScorecard = {
  scorecardId: string;
  gameSlug: string;
  playerId: string;
  iplId: string;
  callsign: string;
  score: number;
  mvpPoints: number;
};

export async function getCompetitionPositionScorecards(
  scopeFilter: GameScopeFilter,
  position: number,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionPositionScorecard[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, position),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      scorecardId: sm5Scorecard.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      score: sm5Scorecard.score,
      mvpPoints: sm5Scorecard.mvpPoints,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .orderBy(desc(sm5Scorecard.mvpPoints))
    .limit(100);

  return rows.map((r) => ({
    scorecardId: r.scorecardId,
    gameSlug: r.gameSlug,
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    score: Number(r.score),
    mvpPoints: Number(r.mvpPoints),
  }));
}

// ---------------------------------------------------------------------------
// Games and points leaderboards (all positions combined)
// ---------------------------------------------------------------------------

export type CompetitionGamesPlayedItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalGames: number;
};

export type CompetitionTotalScoreItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalScore: number;
};

export type CompetitionTotalTimeItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalTimeMs: number;
};

async function getCompetitionAllPositionRows(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions,
) {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  return db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalGames: sql<number>`count(*)::int`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})::int`,
      totalTimeMs: sql<number>`sum(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime})::bigint`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);
}

export async function getCompetitionGamesPlayed(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionGamesPlayedItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalGames: Number(r.totalGames),
    }))
    .sort((a, b) => b.totalGames - a.totalGames)
    .slice(0, 100);
}

export async function getCompetitionTotalScore(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTotalScoreItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalScore: Number(r.totalScore),
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 100);
}

export async function getCompetitionTotalTime(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTotalTimeItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalTimeMs: Number(r.totalTimeMs),
    }))
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Miscellaneous Mischief leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMiscMischiefItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalShotsFired: number;
  totalAssists: number;
  totalPenalties: number;
  totalEliminations: number;
  totalResets: number;
  totalTeamResets: number;
  totalTimesReset: number;
  unusedSp: number | null;
  totalResupplyDowntimeMs: number;
  totalDoubleResuppliesGiven: number | null;
};

export async function getCompetitionMiscMischief(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMiscMischiefItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalShotsFired: sql<number>`sum(${sm5Scorecard.shotsFired})::int`,
      totalAssists: sql<number>`sum(${sm5Scorecard.assists})::int`,
      totalPenalties: sql<number>`sum((select count(*) from ${sm5GamePenalty} where ${sm5GamePenalty.scorecardId} = ${sm5Scorecard.id} and ${sm5GamePenalty.rescinded} = false))::int`,
      totalEliminations: sql<number>`sum(${sm5Scorecard.eliminatedOpponent})::int`,
      totalResets: sql<number>`sum(${sm5Scorecard.resetOpponent} + ${sm5Scorecard.missileResetOpponent})::int`,
      totalTeamResets: sql<number>`sum(${sm5Scorecard.resetTeam} + ${sm5Scorecard.missileResetTeam})::int`,
      totalTimesReset: sql<number>`sum(${sm5Scorecard.timesReset} + ${sm5Scorecard.timesResetByMissile})::int`,
      unusedSp: sql<
        number | null
      >`sum(${sm5Scorecard.spEarned} - ${sm5Scorecard.spSpent}) filter (where ${sm5Scorecard.spEarned} is not null and ${sm5Scorecard.spSpent} is not null)`,
      totalResupplyDowntimeMs: sql<number>`sum(${sm5Scorecard.resupplyDowntime})::bigint`,
      totalDoubleResuppliesGiven: sql<
        number | null
      >`sum(${sm5Scorecard.doubleResuppliesGiven}) filter (where ${sm5Scorecard.doubleResuppliesGiven} is not null)`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalShotsFired: Number(r.totalShotsFired),
    totalAssists: Number(r.totalAssists),
    totalPenalties: Number(r.totalPenalties),
    totalEliminations: Number(r.totalEliminations),
    totalResets: Number(r.totalResets),
    totalTeamResets: Number(r.totalTeamResets),
    totalTimesReset: Number(r.totalTimesReset),
    unusedSp: r.unusedSp !== null ? Number(r.unusedSp) : null,
    totalResupplyDowntimeMs: Number(r.totalResupplyDowntimeMs),
    totalDoubleResuppliesGiven:
      r.totalDoubleResuppliesGiven !== null ? Number(r.totalDoubleResuppliesGiven) : null,
  }));
}

// ---------------------------------------------------------------------------
// Nuke Nonsense leaderboards
// ---------------------------------------------------------------------------

export type CompetitionNukeNonsenseItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  nukesDetonated: number;
  nukesCanceled: number;
  teamNukesCanceled: number;
  avgNukeActivationTime: number | null;
  livesRemovedByNuke: number;
};

export async function getCompetitionNukeNonsense(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionNukeNonsenseItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      nukesDetonated: sql<number>`coalesce(sum(${sm5Scorecard.nukesDetonated}), 0)::int`,
      nukesCanceled: sql<number>`sum(${sm5Scorecard.nukesCanceled})::int`,
      teamNukesCanceled: sql<number>`sum(${sm5Scorecard.teamNukesCanceled})::int`,
      avgNukeActivationTime: sql<
        number | null
      >`avg(${sm5Scorecard.averageNukeActivationTime}) filter (where ${sm5Scorecard.averageNukeActivationTime} is not null)`,
      livesRemovedByNuke: sql<number>`coalesce(sum(${sm5Scorecard.livesRemovedByNuke}), 0)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    nukesDetonated: Number(r.nukesDetonated),
    nukesCanceled: Number(r.nukesCanceled),
    teamNukesCanceled: Number(r.teamNukesCanceled),
    avgNukeActivationTime:
      r.avgNukeActivationTime !== null ? Number(r.avgNukeActivationTime) : null,
    livesRemovedByNuke: Number(r.livesRemovedByNuke),
  }));
}

// ---------------------------------------------------------------------------
// Missile Malarkey leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMissileMalarkeyItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalMissiles: number;
  avgMissiles: number;
  timesHitByMissile: number;
  teamMissiles: number;
};

export async function getCompetitionMissileMalarkey(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMissileMalarkeyItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent} + ${sm5Scorecard.missilesHitTeam})::int`,
      avgMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent} + ${sm5Scorecard.missilesHitTeam})::float / nullif(count(*) filter (where ${sm5Scorecard.position} in (1, 2)), 0)`,
      timesHitByMissile: sql<number>`sum(${sm5Scorecard.timesHitByMissile})::int`,
      teamMissiles: sql<number>`sum(${sm5Scorecard.missilesHitTeam})::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalMissiles: Number(r.totalMissiles),
    avgMissiles: Number(r.avgMissiles),
    timesHitByMissile: Number(r.timesHitByMissile),
    teamMissiles: Number(r.teamMissiles),
  }));
}

// ---------------------------------------------------------------------------
// Medic Tomfoolery leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMedicTomfooleryItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalMedicHits: number;
  ownMedicHits: number;
  medicOnMedicHits: number;
  medicKills: number;
  medicMissiles: number;
};

export async function getCompetitionMedicTomfoolery(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMedicTomfooleryItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
      ownMedicHits: sql<number>`sum(${sm5Scorecard.teamMedicHits})::int`,
      medicOnMedicHits: sql<number>`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)::int`,
      medicKills: sql<number>`sum(${sm5Scorecard.eliminatedOpponentMedic})::int`,
      medicMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponentMedic})::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalMedicHits: Number(r.totalMedicHits),
    ownMedicHits: Number(r.ownMedicHits),
    medicOnMedicHits: r.medicOnMedicHits !== null ? Number(r.medicOnMedicHits) : 0,
    medicKills: Number(r.medicKills),
    medicMissiles: Number(r.medicMissiles),
  }));
}

export async function getCompetitionMedicHitsLeaderboard(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<PlayerMedicHitsItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5GameTeam.isNeutral, false),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})::float`,
      gamesPlayed: sql<number>`count(*)::int`,
      totalMedicHitsNonResup: sql<
        number | null
      >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (1, 2, 3))::int`,
      avgMedicHitsNonResup: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (1, 2, 3))::float`,
      gamesPlayedNonResup: sql<number>`count(*) filter (where ${sm5Scorecard.position} in (1, 2, 3))::int`,
      totalMedicHitsResup: sql<
        number | null
      >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (4, 5))::int`,
      avgMedicHitsResup: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (4, 5))::float`,
      gamesPlayedResup: sql<number>`count(*) filter (where ${sm5Scorecard.position} in (4, 5))::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(player, eq(sm5Scorecard.playerId, player.id))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`sum(${sm5Scorecard.medicHits}) desc`);

  return rows.map((r) => ({
    iplId: r.iplId,
    callsign: r.callsign,
    totalMedicHits: Number(r.totalMedicHits),
    avgMedicHits: Number(r.avgMedicHits),
    gamesPlayed: Number(r.gamesPlayed),
    totalMedicHitsNonResup:
      r.totalMedicHitsNonResup !== null ? Number(r.totalMedicHitsNonResup) : null,
    avgMedicHitsNonResup: r.avgMedicHitsNonResup !== null ? Number(r.avgMedicHitsNonResup) : null,
    gamesPlayedNonResup: Number(r.gamesPlayedNonResup),
    totalMedicHitsResup: r.totalMedicHitsResup !== null ? Number(r.totalMedicHitsResup) : null,
    avgMedicHitsResup: r.avgMedicHitsResup !== null ? Number(r.avgMedicHitsResup) : null,
    gamesPlayedResup: Number(r.gamesPlayedResup),
  }));
}

export async function createForfeitGame(data: {
  matchId: string;
  competitionId: string;
  centerId: string;
  gameNumber: number;
  team1Id: string;
  team2Id: string;
  forfeitingTeam: "team1" | "team2";
}): Promise<void> {
  // Partners are read off the match so a trios or duos forfeit names the whole side ("A & B").
  const [sides] = await db
    .select({
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
    })
    .from(competitionMatch)
    .where(eq(competitionMatch.id, data.matchId));
  const sideIds = {
    team1Id: data.team1Id,
    team1PartnerId: sides?.team1PartnerId ?? null,
    team1Partner2Id: sides?.team1Partner2Id ?? null,
    team2Id: data.team2Id,
    team2PartnerId: sides?.team2PartnerId ?? null,
    team2Partner2Id: sides?.team2Partner2Id ?? null,
  };
  const teamMap = await loadTeamNames([sideIds]);
  const team1Name = matchSideName(
    teamMap,
    sideIds.team1Id,
    sideIds.team1PartnerId,
    sideIds.team1Partner2Id,
  );
  const team2Name = matchSideName(
    teamMap,
    sideIds.team2Id,
    sideIds.team2PartnerId,
    sideIds.team2Partner2Id,
  );

  await db.transaction(async (tx) => {
    const winnerName = data.forfeitingTeam === "team1" ? team2Name : team1Name;
    const loserName = data.forfeitingTeam === "team1" ? team1Name : team2Name;

    const [gameRow] = await tx
      .insert(game)
      .values({
        centerId: data.centerId,
        competitionId: data.competitionId,
        startTime: new Date(),
        tdfFilename: "",
        outcome: "forfeit",
        scheduledDuration: 900,
        actualDuration: 0,
        type: "SM5",
        description: "Forfeit",
      })
      .returning({ id: game.id });

    const [winnerTeam] = await tx
      .insert(sm5GameTeam)
      .values({
        gameId: gameRow.id,
        tdfTeamIndex: 0,
        isNeutral: false,
        name: winnerName,
        colourEnum: 0,
        score: 0,
        eliminationBonus: 10000,
        result: "win",
        eliminated: false,
      })
      .returning({ id: sm5GameTeam.id });

    const [loserTeam] = await tx
      .insert(sm5GameTeam)
      .values({
        gameId: gameRow.id,
        tdfTeamIndex: 1,
        isNeutral: false,
        name: loserName,
        colourEnum: 1,
        score: 0,
        eliminationBonus: 0,
        result: "loss",
        eliminated: true,
      })
      .returning({ id: sm5GameTeam.id });

    await tx.insert(sm5GameTeam).values({
      gameId: gameRow.id,
      tdfTeamIndex: 2,
      isNeutral: true,
      name: "Neutral",
      colourEnum: 2,
      score: null,
      eliminationBonus: null,
      result: null,
      eliminated: null,
    });

    // Map team1/team2 game team IDs preserving match team identity
    const team1GameTeamId = data.forfeitingTeam === "team1" ? loserTeam.id : winnerTeam.id;
    const team2GameTeamId = data.forfeitingTeam === "team2" ? loserTeam.id : winnerTeam.id;

    await tx.insert(competitionMatchGame).values({
      matchId: data.matchId,
      gameId: gameRow.id,
      gameNumber: data.gameNumber,
      team1Sm5GameTeamId: team1GameTeamId,
      team2Sm5GameTeamId: team2GameTeamId,
    });
  });
}

// ---------------------------------------------------------------------------
// All-Star Rankings
// ---------------------------------------------------------------------------

export type AllStarPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  positionGames: number;
  totalGames: number;
  avgMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgMedicHits: number;
};

export type AllStarRankings = {
  1: AllStarPlayer[];
  2: AllStarPlayer[];
  3: AllStarPlayer[];
  4: AllStarPlayer[];
  5: AllStarPlayer[];
};

export async function getCompetitionAllStarRankings(
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
  format: CompetitionFormat = "team",
): Promise<AllStarRankings> {
  const conditions = leaderboardScopeConditions(
    { scope: "competition", competitionId, format },
    options,
  );
  if (!conditions) return { 1: [], 2: [], 3: [], 4: [], 5: [] };

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalGames: sql<number>`count(*)::int`,
      p1Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1)::int`,
      p1AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
      p2Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2)::int`,
      p2AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
      p3Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3)::int`,
      p3AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
      p4Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4)::int`,
      p4AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
      p5Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5)::int`,
      p5AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  const result: AllStarRankings = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  for (const r of rows) {
    const total = Number(r.totalGames);
    // accuracy/hitDiff/medicHits are NOT NULL columns, so once posGames > 0 (guaranteed
    // by the posGames > total / 2 check below) their averages can never be null.
    const posData: [keyof AllStarRankings, number, number | null, number, number, number][] = [
      [
        1,
        Number(r.p1Games),
        r.p1AvgMvp !== null ? Number(r.p1AvgMvp) : null,
        Number(r.p1AvgAccuracy),
        Number(r.p1AvgHitDiff),
        Number(r.p1AvgMedicHits),
      ],
      [
        2,
        Number(r.p2Games),
        r.p2AvgMvp !== null ? Number(r.p2AvgMvp) : null,
        Number(r.p2AvgAccuracy),
        Number(r.p2AvgHitDiff),
        Number(r.p2AvgMedicHits),
      ],
      [
        3,
        Number(r.p3Games),
        r.p3AvgMvp !== null ? Number(r.p3AvgMvp) : null,
        Number(r.p3AvgAccuracy),
        Number(r.p3AvgHitDiff),
        Number(r.p3AvgMedicHits),
      ],
      [
        4,
        Number(r.p4Games),
        r.p4AvgMvp !== null ? Number(r.p4AvgMvp) : null,
        Number(r.p4AvgAccuracy),
        Number(r.p4AvgHitDiff),
        Number(r.p4AvgMedicHits),
      ],
      [
        5,
        Number(r.p5Games),
        r.p5AvgMvp !== null ? Number(r.p5AvgMvp) : null,
        Number(r.p5AvgAccuracy),
        Number(r.p5AvgHitDiff),
        Number(r.p5AvgMedicHits),
      ],
    ];
    for (const [pos, posGames, avgMvp, avgAccuracy, avgHitDiff, avgMedicHits] of posData) {
      if (posGames > total / 2 && avgMvp !== null) {
        result[pos].push({
          playerId: r.playerId,
          iplId: r.iplId,
          callsign: r.callsign,
          positionGames: posGames,
          totalGames: total,
          avgMvp,
          avgAccuracy,
          avgHitDiff,
          avgMedicHits,
        });
      }
    }
  }

  for (const pos of [1, 2, 3, 4, 5] as const) {
    result[pos].sort((a, b) => b.avgMvp - a.avgMvp);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Competition games list (paginated, with computed label)
// ---------------------------------------------------------------------------

export type CompetitionGameListItem = {
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
  description: string | null;
  actualDuration: number;
  prefix: string | null; // e.g. "R1 M1 G1"; null when the game has no match assignment
  team1Label: string;
  team1ColourEnum: number;
  team1Result: "win" | "loss" | "draw" | null;
  team2Label: string;
  team2ColourEnum: number;
  team2Result: "win" | "loss" | "draw" | null;
  teams: {
    colourEnum: number;
    score: number | null;
    eliminationBonus: number | null;
    penaltyScore: number;
    result: "win" | "loss" | "draw" | null;
  }[];
};

async function queryCompetitionGames(
  competitionId: string,
  options: { excluded: boolean },
): Promise<CompetitionGameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      actualDuration: game.actualDuration,
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      team1ColourEnum: sql<number>`t1.colour_enum`,
      team1Result: sql<"win" | "loss" | "draw" | null>`t1.result`,
      team2ColourEnum: sql<number>`t2.colour_enum`,
      team2Result: sql<"win" | "loss" | "draw" | null>`t2.result`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(sql`competition_game_side t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`competition_game_side t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(
      and(eq(competitionMatch.competitionId, competitionId), eq(game.exclude, options.excluded)),
    )
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (rows.length === 0) return [];

  const teamIds = matchSideTeamIds(rows);
  const teams =
    teamIds.length > 0
      ? await db
          .select({
            id: competitionTeam.id,
            shortName: competitionTeam.shortName,
            name: competitionTeam.name,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      penaltyScore: sm5GameTeam.penaltyScore,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push(t);
    teamsByGame.set(t.gameId, list);
  }

  // Short label per team, joined with its partners' as "A & B" (trios) or "A & B & C" (duos).
  const label = (id: string | null) => {
    const t = id ? teamMap.get(id) : undefined;
    return t?.shortName ?? t?.name ?? "?";
  };
  const sideLabel = (id: string | null, ...partnerIds: (string | null)[]) =>
    [label(id), ...sideTeamIds(...partnerIds).map(label)].join(" & ");

  return rows.map((row) => {
    return {
      id: row.id,
      slug: row.slug,
      centerSlug: row.centerSlug,
      startTime: row.startTime,
      outcome: row.outcome,
      centerName: row.centerName,
      description: row.description,
      actualDuration: row.actualDuration,
      prefix: `R${row.roundNumber} M${row.matchNumber} G${row.gameNumber}`,
      team1Label: sideLabel(row.team1Id, row.team1PartnerId, row.team1Partner2Id),
      team1ColourEnum: row.team1ColourEnum,
      team1Result: row.team1Result,
      team2Label: sideLabel(row.team2Id, row.team2PartnerId, row.team2Partner2Id),
      team2ColourEnum: row.team2ColourEnum,
      team2Result: row.team2Result,
      teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
        colourEnum: t.colourEnum,
        score: t.score,
        eliminationBonus: t.eliminationBonus,
        penaltyScore: t.penaltyScore ?? 0,
        result: t.result,
      })),
    };
  });
}

export async function getCompetitionGamesList(
  competitionId: string,
): Promise<CompetitionGameListItem[]> {
  return queryCompetitionGames(competitionId, { excluded: false });
}

// Excluded games are not assigned to a competition match (they were aborted,
// replays, etc.), so they're attached to the competition via `game.competitionId`
// directly rather than through `competition_match_game`. Team names come from the
// in-game teams (sm5_game_team) since there's no competition team mapping.
export async function getExcludedCompetitionGames(
  competitionId: string,
): Promise<CompetitionGameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      actualDuration: game.actualDuration,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(and(eq(game.competitionId, competitionId), eq(game.exclude, true)))
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      name: sm5GameTeam.name,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      penaltyScore: sm5GameTeam.penaltyScore,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push(t);
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => {
    const [t1, t2] = teamsByGame.get(row.id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      centerSlug: row.centerSlug,
      startTime: row.startTime,
      outcome: row.outcome,
      centerName: row.centerName,
      description: row.description,
      actualDuration: row.actualDuration,
      prefix: null,
      team1Label: t1?.name ?? "?",
      team1ColourEnum: t1?.colourEnum ?? 0,
      team1Result: t1?.result ?? null,
      team2Label: t2?.name ?? "?",
      team2ColourEnum: t2?.colourEnum ?? 0,
      team2Result: t2?.result ?? null,
      teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
        colourEnum: t.colourEnum,
        score: t.score,
        eliminationBonus: t.eliminationBonus,
        penaltyScore: t.penaltyScore ?? 0,
        result: t.result,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Competition Player Stats (API)
// ---------------------------------------------------------------------------

export type CompetitionPlayerStatRow = {
  ipl_id: string | null;
  player_name: string;
  player_picture_url: string | null;
  team_name: string;
  team_logo_url: string | null;
  games_played: number;
  wins: number | null;
  losses: number | null;
  avg_score: number | null;
  avg_mvp: number | null;
  avg_accuracy: number | null;
  total_mvp: number | null;
  overall_hit_diff: number | null;
  total_medic_hits: number | null;
  total_missiles: number | null;
  total_nukes_canceled: number | null;
  total_nukes_detonated: number | null;
  total_rapid_fires: number | null;
  total_ammo_boosts: number | null;
  total_life_boosts: number | null;
  commander_total_games_played: number | null;
  commander_avg_mvp: number | null;
  commander_avg_score: number | null;
  commander_avg_accuracy: number | null;
  commander_avg_hit_diff: number | null;
  commander_avg_medic_hits: number | null;
  commander_total_medic_hits: number | null;
  commander_avg_missiled_opponent: number | null;
  commander_total_missiled_opponent: number | null;
  commander_total_nuke_cancels: number | null;
  heavy_total_games_played: number | null;
  heavy_avg_mvp: number | null;
  heavy_avg_score: number | null;
  heavy_avg_accuracy: number | null;
  heavy_avg_hit_diff: number | null;
  heavy_avg_medic_hits: number | null;
  heavy_total_medic_hits: number | null;
  heavy_avg_missiled_opponent: number | null;
  heavy_total_missiled_opponent: number | null;
  heavy_total_nuke_cancels: number | null;
  scout_total_games_played: number | null;
  scout_avg_mvp: number | null;
  scout_avg_score: number | null;
  scout_avg_accuracy: number | null;
  scout_avg_hit_diff: number | null;
  scout_avg_medic_hits: number | null;
  scout_total_medic_hits: number | null;
  scout_total_nuke_cancels: number | null;
  scout_total_rapid_fires: number | null;
  scout_total_shot_3hit: number | null;
  scout_avg_shot_3_hit: number | null;
  ammo_total_games_played: number | null;
  ammo_avg_mvp: number | null;
  ammo_avg_score: number | null;
  ammo_avg_accuracy: number | null;
  ammo_avg_hit_diff: number | null;
  ammo_avg_medic_hits: number | null;
  ammo_total_medic_hits: number | null;
  ammo_total_boosts: number | null;
  ammo_avg_boosts: number | null;
  ammo_avg_double_resup_ratio: number | null;
  medic_total_games_played: number | null;
  medic_avg_mvp: number | null;
  medic_avg_score: number | null;
  medic_avg_accuracy: number | null;
  medic_avg_hit_diff: number | null;
  medic_avg_medic_hits: number | null;
  medic_total_medic_hits: number | null;
  medic_total_boosts: number | null;
  medic_avg_boosts: number | null;
  medic_avg_double_resup_ratio: number | null;
};

const ZERO_PLAYER_STATS: Omit<
  CompetitionPlayerStatRow,
  "ipl_id" | "player_name" | "player_picture_url" | "team_name" | "team_logo_url"
> = {
  games_played: 0,
  wins: null,
  losses: null,
  avg_score: null,
  avg_mvp: null,
  avg_accuracy: null,
  total_mvp: null,
  overall_hit_diff: null,
  total_medic_hits: null,
  total_missiles: null,
  total_nukes_canceled: null,
  total_nukes_detonated: null,
  total_rapid_fires: null,
  total_ammo_boosts: null,
  total_life_boosts: null,
  commander_total_games_played: null,
  commander_avg_mvp: null,
  commander_avg_score: null,
  commander_avg_accuracy: null,
  commander_avg_hit_diff: null,
  commander_avg_medic_hits: null,
  commander_total_medic_hits: null,
  commander_avg_missiled_opponent: null,
  commander_total_missiled_opponent: null,
  commander_total_nuke_cancels: null,
  heavy_total_games_played: null,
  heavy_avg_mvp: null,
  heavy_avg_score: null,
  heavy_avg_accuracy: null,
  heavy_avg_hit_diff: null,
  heavy_avg_medic_hits: null,
  heavy_total_medic_hits: null,
  heavy_avg_missiled_opponent: null,
  heavy_total_missiled_opponent: null,
  heavy_total_nuke_cancels: null,
  scout_total_games_played: null,
  scout_avg_mvp: null,
  scout_avg_score: null,
  scout_avg_accuracy: null,
  scout_avg_hit_diff: null,
  scout_avg_medic_hits: null,
  scout_total_medic_hits: null,
  scout_total_nuke_cancels: null,
  scout_total_rapid_fires: null,
  scout_total_shot_3hit: null,
  scout_avg_shot_3_hit: null,
  ammo_total_games_played: null,
  ammo_avg_mvp: null,
  ammo_avg_score: null,
  ammo_avg_accuracy: null,
  ammo_avg_hit_diff: null,
  ammo_avg_medic_hits: null,
  ammo_total_medic_hits: null,
  ammo_total_boosts: null,
  ammo_avg_boosts: null,
  ammo_avg_double_resup_ratio: null,
  medic_total_games_played: null,
  medic_avg_mvp: null,
  medic_avg_score: null,
  medic_avg_accuracy: null,
  medic_avg_hit_diff: null,
  medic_avg_medic_hits: null,
  medic_total_medic_hits: null,
  medic_total_boosts: null,
  medic_avg_boosts: null,
  medic_avg_double_resup_ratio: null,
};

export async function getCompetitionPlayerStats(slug: string): Promise<{
  [key: string]: CompetitionPlayerStatRow[];
  alltime: CompetitionPlayerStatRow[];
} | null> {
  const [comp] = await db
    .select({ id: competition.id, format: competition.format })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (!comp) return null;

  // The player universe. A team competition draws it from the rosters; a solo competition
  // has no teams, so it draws it from the enrollment table instead and carries no team
  // identity or profile picture.
  type RosterEntry = {
    playerId: string;
    iplId: string | null;
    callsign: string;
    teamName: string;
    teamId: string | null;
    teamHasLogo: boolean;
    teamLogoVersion: number;
    rosterEntryId: string;
    hasProfilePicture: boolean;
    pictureVersion: number;
  };

  /** The roster-less shape shared by the solo and no-scoring universes. */
  const withoutTeam = (r: {
    playerId: string;
    iplId: string | null;
    callsign: string;
    rosterEntryId: string;
  }): RosterEntry => ({
    ...r,
    teamName: "",
    teamId: null,
    teamHasLogo: false,
    teamLogoVersion: 0,
    hasProfilePicture: false,
    pictureVersion: 0,
  });

  const rosterRows: RosterEntry[] =
    comp.format === "none"
      ? // Nothing enrols in a no-scoring competition, so the player universe is simply
        // everyone who has a scorecard in one of its games. `rosterEntryId` has no roster
        // row to point at; the player id stands in as the stable key.
        (
          await db
            .selectDistinctOn([player.id], {
              playerId: player.id,
              iplId: player.iplId,
              callsign: player.currentCallsign,
              rosterEntryId: player.id,
            })
            .from(sm5Scorecard)
            .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
            .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
            .where(and(eq(game.competitionId, comp.id), eq(game.exclude, false)))
            .orderBy(player.id)
        ).map(withoutTeam)
      : comp.format === "solo"
        ? (
            await db
              .select({
                playerId: player.id,
                iplId: player.iplId,
                callsign: player.currentCallsign,
                rosterEntryId: competitionPlayer.id,
              })
              .from(competitionPlayer)
              .innerJoin(player, eq(player.id, competitionPlayer.playerId))
              .where(eq(competitionPlayer.competitionId, comp.id))
              .orderBy(asc(player.currentCallsign))
          ).map(withoutTeam)
        : await db
            .selectDistinctOn([player.id], {
              playerId: player.id,
              iplId: player.iplId,
              callsign: player.currentCallsign,
              teamName: competitionTeam.name,
              teamId: competitionTeam.id,
              teamHasLogo: competitionTeam.hasLogo,
              teamLogoVersion: competitionTeam.logoVersion,
              rosterEntryId: competitionTeamPlayer.id,
              hasProfilePicture: competitionTeamPlayer.hasProfilePicture,
              pictureVersion: competitionTeamPlayer.pictureVersion,
            })
            .from(competitionTeam)
            .innerJoin(
              competitionTeamPlayer,
              eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
            )
            .innerJoin(player, eq(player.id, competitionTeamPlayer.playerId))
            .where(eq(competitionTeam.competitionId, comp.id))
            .orderBy(player.id, asc(competitionTeamPlayer.isMercenary));

  if (rosterRows.length === 0) return { [slug]: [], alltime: [] };

  const playerIds = rosterRows.map((r) => r.playerId);

  function buildAggQuery(extraConds: SQL<unknown>[]) {
    return db
      .select({
        playerId: player.id,
        iplId: player.iplId,
        callsign: player.currentCallsign,
        gamesPlayed: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
        losses: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'loss')::int`,
        avgScore: sql<number | null>`avg(${sm5Scorecard.score})`,
        avgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints})`,
        avgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy})`,
        totalMvp: sql<number | null>`sum(${sm5Scorecard.mvpPoints})`,
        overallHitDiff: sql<number | null>`avg(${sm5Scorecard.hitDiff})`,
        totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
        totalMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent})::int`,
        totalNukesCanceled: sql<number>`sum(${sm5Scorecard.nukesCanceled})::int`,
        totalNukesDetonated: sql<number>`coalesce(sum(${sm5Scorecard.nukesDetonated}), 0)::int`,
        totalRapidFires: sql<number>`coalesce(sum(${sm5Scorecard.rapidFire}), 0)::int`,
        totalAmmoBoosts: sql<number>`coalesce(sum(${sm5Scorecard.ammoBoost}), 0)::int`,
        totalLifeBoosts: sql<number>`coalesce(sum(${sm5Scorecard.lifeBoost}), 0)::int`,
        // Commander (position 1)
        cmdGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 1), 0)::int`,
        cmdAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgMissiledOpponent: sql<
          number | null
        >`avg(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalMissiledOpponent: sql<
          number | null
        >`sum(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 1)`,
        // Heavy (position 2)
        hvyGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 2), 0)::int`,
        hvyAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgMissiledOpponent: sql<
          number | null
        >`avg(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalMissiledOpponent: sql<
          number | null
        >`sum(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 2)`,
        // Scout (position 3)
        sctGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 3), 0)::int`,
        sctAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalRapidFires: sql<
          number | null
        >`sum(${sm5Scorecard.rapidFire}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalShot3hit: sql<
          number | null
        >`sum(${sm5Scorecard.shotsHitOpponent3hit}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgShot3hit: sql<
          number | null
        >`avg(${sm5Scorecard.shotsHitOpponent3hit}) filter (where ${sm5Scorecard.position} = 3)`,
        // Ammo Carrier (position 4)
        ammoGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 4), 0)::int`,
        ammoAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoTotalBoosts: sql<
          number | null
        >`sum(${sm5Scorecard.ammoBoost}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgBoosts: sql<
          number | null
        >`avg(${sm5Scorecard.ammoBoost}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgDoubleResupRatio: sql<
          number | null
        >`avg(${sm5Scorecard.doubleResuppliesGiven}::float / nullif(${sm5Scorecard.resuppliesGiven}, 0)) filter (where ${sm5Scorecard.position} = 4)`,
        // Medic (position 5)
        medGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 5), 0)::int`,
        medAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
        medTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
        medTotalBoosts: sql<
          number | null
        >`sum(${sm5Scorecard.lifeBoost}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgBoosts: sql<
          number | null
        >`avg(${sm5Scorecard.lifeBoost}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgDoubleResupRatio: sql<
          number | null
        >`avg(${sm5Scorecard.doubleResuppliesGiven}::float / nullif(${sm5Scorecard.resuppliesGiven}, 0)) filter (where ${sm5Scorecard.position} = 5)`,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
      .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
      .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
      .where(and(inArray(sm5Scorecard.playerId, playerIds), eq(game.exclude, false), ...extraConds))
      .groupBy(player.id, player.iplId, player.currentCallsign);
  }

  // Solo and no-scoring competitions have no match structure, so the competition's games
  // are simply the ones assigned to it. buildAggQuery already applies game.exclude = false.
  const compScopeConds: SQL<unknown>[] = !hasMatchStructure(comp.format)
    ? [eq(game.competitionId, comp.id)]
    : [
        sql`${sm5GameTeam.gameId} IN (
        SELECT cmg.game_id
        FROM competition_match_game cmg
        JOIN competition_match cm ON cm.id = cmg.match_id
        WHERE cm.competition_id = ${comp.id}
      )`,
        eq(sm5Scorecard.isMercenary, false),
      ];

  const [compRows, alltimeRows] = await Promise.all([
    buildAggQuery(compScopeConds),
    buildAggQuery([]),
  ]);

  function mapRow(
    r: (typeof compRows)[number] | undefined,
    iplId: string | null,
    callsign: string,
    playerPictureUrl: string | null,
    teamName: string,
    teamLogoUrl: string | null,
  ): CompetitionPlayerStatRow {
    if (!r) {
      return {
        ipl_id: iplId,
        player_name: callsign,
        player_picture_url: playerPictureUrl,
        team_name: teamName,
        team_logo_url: teamLogoUrl,
        ...ZERO_PLAYER_STATS,
      };
    }
    const n = (v: number | null) => (v !== null ? Number(v) : null);
    return {
      ipl_id: r.iplId,
      player_name: r.callsign,
      player_picture_url: playerPictureUrl,
      team_name: teamName,
      team_logo_url: teamLogoUrl,
      games_played: Number(r.gamesPlayed),
      wins: Number(r.wins),
      losses: Number(r.losses),
      avg_score: n(r.avgScore),
      avg_mvp: n(r.avgMvp),
      avg_accuracy: n(r.avgAccuracy),
      total_mvp: n(r.totalMvp),
      overall_hit_diff: n(r.overallHitDiff),
      total_medic_hits: Number(r.totalMedicHits),
      total_missiles: Number(r.totalMissiles),
      total_nukes_canceled: Number(r.totalNukesCanceled),
      total_nukes_detonated: Number(r.totalNukesDetonated),
      total_rapid_fires: Number(r.totalRapidFires),
      total_ammo_boosts: Number(r.totalAmmoBoosts),
      total_life_boosts: Number(r.totalLifeBoosts),
      commander_total_games_played: n(r.cmdGames),
      commander_avg_mvp: n(r.cmdAvgMvp),
      commander_avg_score: n(r.cmdAvgScore),
      commander_avg_accuracy: n(r.cmdAvgAccuracy),
      commander_avg_hit_diff: n(r.cmdAvgHitDiff),
      commander_avg_medic_hits: n(r.cmdAvgMedicHits),
      commander_total_medic_hits: n(r.cmdTotalMedicHits),
      commander_avg_missiled_opponent: n(r.cmdAvgMissiledOpponent),
      commander_total_missiled_opponent: n(r.cmdTotalMissiledOpponent),
      commander_total_nuke_cancels: n(r.cmdTotalNukeCancels),
      heavy_total_games_played: n(r.hvyGames),
      heavy_avg_mvp: n(r.hvyAvgMvp),
      heavy_avg_score: n(r.hvyAvgScore),
      heavy_avg_accuracy: n(r.hvyAvgAccuracy),
      heavy_avg_hit_diff: n(r.hvyAvgHitDiff),
      heavy_avg_medic_hits: n(r.hvyAvgMedicHits),
      heavy_total_medic_hits: n(r.hvyTotalMedicHits),
      heavy_avg_missiled_opponent: n(r.hvyAvgMissiledOpponent),
      heavy_total_missiled_opponent: n(r.hvyTotalMissiledOpponent),
      heavy_total_nuke_cancels: n(r.hvyTotalNukeCancels),
      scout_total_games_played: n(r.sctGames),
      scout_avg_mvp: n(r.sctAvgMvp),
      scout_avg_score: n(r.sctAvgScore),
      scout_avg_accuracy: n(r.sctAvgAccuracy),
      scout_avg_hit_diff: n(r.sctAvgHitDiff),
      scout_avg_medic_hits: n(r.sctAvgMedicHits),
      scout_total_medic_hits: n(r.sctTotalMedicHits),
      scout_total_nuke_cancels: n(r.sctTotalNukeCancels),
      scout_total_rapid_fires: n(r.sctTotalRapidFires),
      scout_total_shot_3hit: n(r.sctTotalShot3hit),
      scout_avg_shot_3_hit: n(r.sctAvgShot3hit),
      ammo_total_games_played: n(r.ammoGames),
      ammo_avg_mvp: n(r.ammoAvgMvp),
      ammo_avg_score: n(r.ammoAvgScore),
      ammo_avg_accuracy: n(r.ammoAvgAccuracy),
      ammo_avg_hit_diff: n(r.ammoAvgHitDiff),
      ammo_avg_medic_hits: n(r.ammoAvgMedicHits),
      ammo_total_medic_hits: n(r.ammoTotalMedicHits),
      ammo_total_boosts: n(r.ammoTotalBoosts),
      ammo_avg_boosts: n(r.ammoAvgBoosts),
      ammo_avg_double_resup_ratio: n(r.ammoAvgDoubleResupRatio),
      medic_total_games_played: n(r.medGames),
      medic_avg_mvp: n(r.medAvgMvp),
      medic_avg_score: n(r.medAvgScore),
      medic_avg_accuracy: n(r.medAvgAccuracy),
      medic_avg_hit_diff: n(r.medAvgHitDiff),
      medic_avg_medic_hits: n(r.medAvgMedicHits),
      medic_total_medic_hits: n(r.medTotalMedicHits),
      medic_total_boosts: n(r.medTotalBoosts),
      medic_avg_boosts: n(r.medAvgBoosts),
      medic_avg_double_resup_ratio: n(r.medAvgDoubleResupRatio),
    };
  }

  const compMap = new Map(compRows.map((r) => [r.playerId, r]));
  const alltimeMap = new Map(alltimeRows.map((r) => [r.playerId, r]));

  return {
    [slug]: rosterRows.map((p) =>
      mapRow(
        compMap.get(p.playerId),
        p.iplId,
        p.callsign,
        p.hasProfilePicture ? getPlayerPictureUrl(p.rosterEntryId, p.pictureVersion) : null,
        p.teamName,
        p.teamHasLogo && p.teamId ? getTeamLogoUrl(p.teamId, p.teamLogoVersion) : null,
      ),
    ),
    alltime: rosterRows.map((p) =>
      mapRow(
        alltimeMap.get(p.playerId),
        p.iplId,
        p.callsign,
        p.hasProfilePicture ? getPlayerPictureUrl(p.rosterEntryId, p.pictureVersion) : null,
        p.teamName,
        p.teamHasLogo && p.teamId ? getTeamLogoUrl(p.teamId, p.teamLogoVersion) : null,
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Competition schedule
// ---------------------------------------------------------------------------

export type CompetitionScheduleEntry = {
  gameName: string;
  team1Name: string;
  team2Name: string;
  team1LogoUrl: string | null;
  team2LogoUrl: string | null;
  scheduledStartTime: Date | null;
  actualStartTime: Date | null;
  team1Score: number | null;
  team2Score: number | null;
  scoreDifferential: number | null;
};

export async function getCompetitionSchedule(
  slug: string,
): Promise<CompetitionScheduleEntry[] | null> {
  const comp = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (comp.length === 0) return null;
  const competitionId = comp[0].id;

  // Fetch all matches with round and team info
  const matchRows = await db
    .select({
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundNumber: competitionRound.roundNumber,
      roundType: competitionRound.type,
      team1Id: competitionMatch.team1Id,
      team1PartnerId: competitionMatch.team1PartnerId,
      team1Partner2Id: competitionMatch.team1Partner2Id,
      team2Id: competitionMatch.team2Id,
      team2PartnerId: competitionMatch.team2PartnerId,
      team2Partner2Id: competitionMatch.team2Partner2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  // Fetch team names
  const teamIds = matchSideTeamIds(matchRows);
  const teams =
    teamIds.length > 0
      ? await db
          .select({
            id: competitionTeam.id,
            name: competitionTeam.name,
            hasLogo: competitionTeam.hasLogo,
            logoVersion: competitionTeam.logoVersion,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));

  // Fetch all game assignments with actual scores
  const matchIds = matchRows.map((m) => m.matchId);
  const assignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
      actualStartTime: game.startTime,
      team1Score: sql<
        number | null
      >`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team2Score: sql<
        number | null
      >`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .leftJoin(sql`competition_game_side t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .leftJoin(sql`competition_game_side t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(inArray(competitionMatchGame.matchId, matchIds));

  // Index assignments by matchId + gameNumber
  type AssignmentData = {
    actualStartTime: Date;
    team1Score: number | null;
    team2Score: number | null;
  };
  const assignmentMap = new Map<string, AssignmentData>();
  for (const a of assignments) {
    assignmentMap.set(`${a.matchId}:${a.gameNumber}`, {
      actualStartTime: a.actualStartTime,
      team1Score: a.team1Score,
      team2Score: a.team2Score,
    });
  }

  // Build one entry per game slot
  const entries: CompetitionScheduleEntry[] = [];
  for (const m of matchRows) {
    const isFinals = m.roundType === "finals";
    const roundPrefix = isFinals ? "Finals" : `R${m.roundNumber}`;
    const team1 = m.team1Id ? teamMap.get(m.team1Id) : undefined;
    const team2 = m.team2Id ? teamMap.get(m.team2Id) : undefined;
    const team1Name = matchSideName(teamNames, m.team1Id, m.team1PartnerId, m.team1Partner2Id);
    const team2Name = matchSideName(teamNames, m.team2Id, m.team2PartnerId, m.team2Partner2Id);
    const team1LogoUrl =
      m.team1Id && team1?.hasLogo ? getTeamLogoUrl(m.team1Id, team1.logoVersion) : null;
    const team2LogoUrl =
      m.team2Id && team2?.hasLogo ? getTeamLogoUrl(m.team2Id, team2.logoVersion) : null;

    for (const gameNumber of [1, 2] as const) {
      const scheduled = gameNumber === 1 ? m.game1ScheduledStartTime : m.game2ScheduledStartTime;
      const actual = assignmentMap.get(`${m.matchId}:${gameNumber}`);

      // Skip slots with no scheduled time and no actual game
      if (!scheduled && !actual) continue;

      const team1Score = actual?.team1Score ?? null;
      const team2Score = actual?.team2Score ?? null;

      entries.push({
        gameName: `${roundPrefix} M${m.matchNumber} G${gameNumber}`,
        team1Name,
        team2Name,
        team1LogoUrl,
        team2LogoUrl,
        scheduledStartTime: scheduled ?? null,
        actualStartTime: actual?.actualStartTime ?? null,
        team1Score,
        team2Score,
        scoreDifferential:
          team1Score !== null && team2Score !== null ? team1Score - team2Score : null,
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

// ---------------------------------------------------------------------------
// Competition standings (API)
// ---------------------------------------------------------------------------

export type CompetitionStandingsApiRow = Omit<CompetitionStandingsRow, "teamLogoVersion">;

export async function getCompetitionStandingsData(
  slug: string,
): Promise<CompetitionStandingsApiRow[] | null> {
  const [comp] = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (!comp) return null;

  const rows = await getCompetitionStandings(comp.id);
  return rows.map(({ teamLogoVersion, ...rest }) => rest);
}
