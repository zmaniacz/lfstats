// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import { parseGameSlug } from "../lib/game-slug";
import {
  game,
  sm5GameTeam,
  sm5PdfGameTeam,
  sm5Scorecard,
  sm5ScorecardMvp,
  sm5GamePlayerInteraction,
  sm5GamePlayerStep,
  sm5GameEvent,
  sm5GamePlayerState,
  sm5GameTarget,
  target,
  center,
  competition,
  competitionRound,
  competitionMatch,
  competitionMatchGame,
  gameReferee,
  gameTag,
  gameTagAssignment,
  lbGameTeam,
  lbScorecard,
} from "../schema";
import { eq, and, asc, desc, inArray, isNull, sql, SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

export type GameListFilters = {
  centerId?: string;
  scopeFilter?: GameScopeFilter;
};

export type GameTeamSummary = {
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  penaltyScore: number;
  result: "win" | "loss" | "draw" | null;
};

export type GameListItem = {
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
  description: string | null;
  competitionName: string | null;
  actualDuration: number;
  /** "sm5_pdf" for a legacy PDF-era game (end-of-game data only); otherwise "sm5" or absent. */
  gameType?: string;
  teams: GameTeamSummary[];
};

function buildGameListConditions(filters: GameListFilters): SQL[] {
  // SM5 games, including legacy PDF-era ones — Laserball lives in the same `game`
  // table (type = "lb").
  const conditions: SQL[] = [inArray(game.type, ["sm5", "sm5_pdf"])];
  if (filters.scopeFilter) {
    // A game list, not an aggregate: excluded games stay listed.
    conditions.push(...gameScopeConditions(filters.scopeFilter, { includeExcluded: true }));
  }
  if (filters.centerId) {
    conditions.push(eq(game.centerId, filters.centerId));
  }
  return conditions;
}

export async function getGamesList(filters: GameListFilters = {}): Promise<GameListItem[]> {
  const conditions = buildGameListConditions(filters);

  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      competitionName: competition.name,
      actualDuration: game.actualDuration,
      gameType: game.type,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = rows.filter((r) => r.gameType === "sm5").map((r) => r.id);
  const pdfGameIds = rows.filter((r) => r.gameType === "sm5_pdf").map((r) => r.id);

  const [tdfTeamRows, pdfTeamRows] = await Promise.all([
    gameIds.length
      ? db
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
          .orderBy(sm5GameTeam.tdfTeamIndex)
      : [],
    pdfGameIds.length
      ? db
          .select({
            gameId: sm5PdfGameTeam.gameId,
            colourEnum: sm5PdfGameTeam.colourEnum,
            score: sm5PdfGameTeam.score,
            eliminationBonus: sm5PdfGameTeam.eliminationBonus,
            penaltyScore: sm5PdfGameTeam.penaltyScore,
            result: sm5PdfGameTeam.result,
          })
          .from(sm5PdfGameTeam)
          .where(inArray(sm5PdfGameTeam.gameId, pdfGameIds))
          .orderBy(sm5PdfGameTeam.colourEnum)
      : [],
  ]);
  const teamRows = [...tdfTeamRows, ...pdfTeamRows];

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    centerSlug: row.centerSlug,
    startTime: row.startTime,
    outcome: row.outcome,
    centerName: row.centerName,
    description: row.description,
    competitionName: row.competitionName,
    actualDuration: row.actualDuration,
    gameType: row.gameType,
    teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
      colourEnum: t.colourEnum,
      score: t.score,
      eliminationBonus: t.eliminationBonus,
      penaltyScore: t.penaltyScore ?? 0,
      result: t.result,
    })),
  }));
}

export type GameExportFilters = {
  // Both bounds are inclusive and independently optional — omitting one leaves
  // that end of the range unbounded.
  startDate?: string;
  endDate?: string;
  gameType?: "sm5" | "lb";
  centerId?: string;
  competitionId?: string;
};

export type GameExportItem = {
  centerSlug: string;
  // `{countryCode}-{siteCode}-{YYYYMMDDHHmmss}` — the same slug used in game
  // page URLs and accepted by getGameBySlug / the video routes. Built here to
  // mirror parseGameSlug, its inverse.
  slug: string;
  startTime: Date;
  gameType: string;
  tdfFilename: string;
  // Null for social games. Round/match/game numbers are additionally null for a
  // competition game that has not been assigned to a match.
  competitionSlug: string | null;
  roundNumber: number | null;
  matchNumber: number | null;
  gameNumber: number | null;
};

export async function getGamesForExport(filters: GameExportFilters): Promise<GameExportItem[]> {
  // PDF-era games (sm5_pdf) have no TDF and no sm5 rows, so the export leaves them out.
  const conditions: SQL[] = [eq(game.exclude, false), inArray(game.type, ["sm5", "lb"])];
  if (filters.startDate) {
    conditions.push(sql`date(${game.startTime}) >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    conditions.push(sql`date(${game.startTime}) <= ${filters.endDate}::date`);
  }
  if (filters.gameType) conditions.push(eq(game.type, filters.gameType));
  if (filters.centerId) conditions.push(eq(game.centerId, filters.centerId));
  if (filters.competitionId) conditions.push(eq(game.competitionId, filters.competitionId));

  return db
    .select({
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      startTime: game.startTime,
      gameType: game.type,
      tdfFilename: game.tdfFilename,
      competitionSlug: competition.slug,
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.gameId, game.id))
    .leftJoin(competitionMatch, eq(competitionMatchGame.matchId, competitionMatch.id))
    .leftJoin(competitionRound, eq(competitionMatch.roundId, competitionRound.id))
    .where(and(...conditions))
    .orderBy(desc(game.startTime));
}

// ---------------------------------------------------------------------------
// Single-game summary (public API)
// ---------------------------------------------------------------------------

/**
 * One player entity that took the field.
 *
 * `iplId` is null for guests: they play under a `@NNN` hardware id (TDF_Spec.md
 * Appendix C) which the ingest does not persist on the scorecard, so a guest is
 * identifiable only by codename.
 */
export type GameSummaryPlayer = {
  iplId: string | null;
  callsign: string;
};

export type GameSummaryTeam = {
  tdfTeamIndex: number;
  name: string;
  colourEnum: number;
  isNeutral: boolean;
  players: GameSummaryPlayer[];
};

/** A non-player target entity: `entityId` is its `@NNN` hardware id. */
export type GameSummaryTarget = {
  entityId: string;
  name: string;
  type: string;
  /** Owning team's name, null when the target belongs to no team. */
  teamName: string | null;
};

/** A referee signs in either with an iplId or with a bare hardware id. */
export type GameSummaryReferee = {
  iplId: string | null;
  entityId: string | null;
  callsign: string;
};

export type GameSummary = {
  slug: string;
  gameType: string;
  startTime: Date;
  /** Both in milliseconds. */
  scheduledDuration: number;
  actualDuration: number;
  centerSlug: string;
  centerName: string;
  tdfFilename: string;
  teams: GameSummaryTeam[];
  /** Always empty for Laserball, which has no target entities. */
  targets: GameSummaryTarget[];
  referees: GameSummaryReferee[];
};

/**
 * Every entity in one game, keyed by its public slug — the roster behind a
 * TDF, not its stats. Covers both SM5 and Laserball (like getGameBySlug, and
 * unlike getGameDetailBySlug, it does not filter on game.type), reading
 * whichever team/scorecard pair matches the stored type.
 *
 * Targets and referees are returned alongside the teams rather than nested
 * inside them: referees belong to no team at all, and a target's team says
 * which side owns it rather than who played on it.
 */
export async function getGameSummaryBySlug(slug: string): Promise<GameSummary | null> {
  const parsed = parseGameSlug(slug);
  if (!parsed) return null;

  const [gameRow] = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      centerName: center.name,
      gameType: game.type,
      startTime: game.startTime,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );

  // PDF-era games have no TDF roster to describe.
  if (!gameRow || gameRow.gameType === "sm5_pdf") return null;

  const isLb = gameRow.gameType === "lb";
  const gameTeam = isLb ? lbGameTeam : sm5GameTeam;
  const scorecard = isLb ? lbScorecard : sm5Scorecard;

  const [teamRows, playerRows, targetRows, refereeRows] = await Promise.all([
    db
      .select({
        id: gameTeam.id,
        tdfTeamIndex: gameTeam.tdfTeamIndex,
        name: gameTeam.name,
        colourEnum: gameTeam.colourEnum,
        isNeutral: gameTeam.isNeutral,
      })
      .from(gameTeam)
      .where(eq(gameTeam.gameId, gameRow.id))
      .orderBy(asc(gameTeam.tdfTeamIndex)),

    db
      .select({
        teamId: scorecard.teamId,
        iplId: scorecard.iplId,
        callsign: scorecard.callsign,
      })
      .from(scorecard)
      .where(eq(scorecard.gameId, gameRow.id))
      .orderBy(asc(scorecard.callsign)),

    // Laserball files declare no target entities, so this table only ever has
    // SM5 rows — the gameId filter alone is enough to return [] for lb.
    db
      .select({
        entityId: target.hardwareId,
        name: target.name,
        type: sm5GameTarget.type,
        teamName: sm5GameTeam.name,
      })
      .from(sm5GameTarget)
      .innerJoin(target, eq(target.id, sm5GameTarget.targetId))
      .leftJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5GameTarget.gameTeamId))
      .where(eq(sm5GameTarget.gameId, gameRow.id))
      .orderBy(asc(target.hardwareId)),

    db
      .select({
        iplId: gameReferee.iplId,
        entityId: gameReferee.hardwareId,
        callsign: gameReferee.callsign,
      })
      .from(gameReferee)
      .where(eq(gameReferee.gameId, gameRow.id))
      .orderBy(asc(gameReferee.callsign)),
  ]);

  const playersByTeam = new Map<string, GameSummaryPlayer[]>();
  for (const p of playerRows) {
    const list = playersByTeam.get(p.teamId) ?? [];
    list.push({ iplId: p.iplId, callsign: p.callsign });
    playersByTeam.set(p.teamId, list);
  }

  return {
    slug: gameRow.slug,
    gameType: gameRow.gameType,
    startTime: gameRow.startTime,
    scheduledDuration: gameRow.scheduledDuration,
    actualDuration: gameRow.actualDuration,
    centerSlug: gameRow.centerSlug,
    centerName: gameRow.centerName,
    tdfFilename: gameRow.tdfFilename,
    teams: teamRows.map((t) => ({
      tdfTeamIndex: t.tdfTeamIndex,
      name: t.name,
      colourEnum: t.colourEnum,
      isNeutral: t.isNeutral,
      players: playersByTeam.get(t.id) ?? [],
    })),
    targets: targetRows,
    referees: refereeRows,
  };
}

export type MvpComponentRow = {
  component: string;
  inputValue: number;
  points: number;
};

export type PlayerHitData = {
  callsign: string;
  position: number;
  score: number;
  isTeammate: boolean;
  hitsDealt: number;
  missilesDealt: number;
  hitsReceived: number;
  missilesReceived: number;
  resetsDealt: number;
  resetsReceived: number;
  missileResetsDealt: number;
  missileResetsReceived: number;
};

export type GameDetailPlayer = {
  id: string;
  playerId: string | null;
  iplId: string | null;
  callsign: string;
  position: number;
  eliminated: boolean;
  score: number;
  mvpPoints: number;
  livesLeft: number;
  shotsLeft: number;
  hitDiff: number;
  accuracy: number;
  // Shot stats
  shotsFired: number;
  shotsHit: number;
  shotsHitOpponent: number;
  shotsHitOpponent3hit: number;
  shotsHitTeam: number;
  shotsHitOpponentMedic: number;
  shotsHitTeamMedic: number;
  medicHits: number;
  teamMedicHits: number;
  timesHit: number;
  timesReset: number;
  // Missile stats
  missileHits: number;
  missilesHitOpponent: number;
  missilesHitTeam: number;
  missilesHitOpponentMedic: number;
  missilesHitTeamMedic: number;
  timesHitByMissile: number;
  timesResetByMissile: number;
  // Nuke stats (Commander only, nullable)
  nukesActivated: number | null;
  nukesDetonated: number | null;
  nukesHitMedic: number | null;
  livesRemovedByNuke: number | null;
  totalNukeActivationTime: number | null;
  averageNukeActivationTime: number | null;
  // Nuke cancel stats (all positions)
  nukesCanceled: number;
  teamNukesCanceled: number;
  // Scout special ability (nullable)
  rapidFire: number | null;
  totalRapidTime: number | null;
  averageRapidTime: number | null;
  shotsFiredDuringRapid: number | null;
  shotsHitDuringRapid: number | null;
  shotsHitOpponentDuringRapid: number | null;
  shotsHitTeamDuringRapid: number | null;
  accuracyDuringRapid: number | null;
  // Ammo/Medic special ability (nullable)
  ammoBoost: number | null;
  lifeBoost: number | null;
  // Support stats (Ammo/Medic only, nullable for giving; universal for receiving)
  resuppliesGiven: number | null;
  doubleResuppliesGiven: number | null;
  resuppliesReceivedAmmo: number;
  resuppliesReceivedLives: number;
  doubleResuppliesReceived: number;
  // Combat outcomes
  deactivatedOpponent: number;
  deactivatedTeam: number;
  eliminatedOpponent: number;
  eliminatedTeam: number;
  eliminatedOpponentMedic: number;
  eliminatedTeamMedic: number;
  assists: number;
  resetOpponent: number;
  resetTeam: number;
  missileResetOpponent: number;
  missileResetTeam: number;
  // SP tracking (null for Heavy Weapons)
  spEarned: number | null;
  spSpent: number | null;
  // Targets and penalties
  targetsDestroyed: number;
  penalties: number;
  isMercenary: boolean;
  // Uptime & downtime (ms)
  uptime: number;
  resupplyDowntime: number;
  otherDowntime: number;
  endTime: Date;
  // Step-tracker total (TDF line type 10). null when the game's TDF carries no step data;
  // 0 when it does but this player never reported a step.
  steps: number | null;
  mvpComponents: MvpComponentRow[];
  hitInteractions: PlayerHitData[];
};

export type GameDetailTeam = {
  id: string;
  name: string;
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  penaltyScore: number;
  result: "win" | "loss" | "draw" | null;
  eliminated: boolean | null;
  players: GameDetailPlayer[];
};

export type GameTagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type GameDetail = {
  id: string;
  slug: string;
  centerId: string;
  centerSlug: string;
  competitionId: string | null;
  competitionName: string | null;
  description: string | null;
  startTime: Date;
  centerName: string;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  scheduledDuration: number;
  actualDuration: number;
  exclude: boolean;
  tdfFilename: string;
  tags: GameTagSummary[];
  teams: GameDetailTeam[];
};

/**
 * The `game` row every GameDetail list starts from — a GameDetail minus the two collections
 * that buildGameDetails() fans out and attaches.
 */
type GameDetailListRow = Omit<GameDetail, "tags" | "teams">;

/**
 * Per-scorecard step totals for a set of games. Step data only exists for TDFs that carry
 * line type 10, so a game with no rows at all yields null for every player, while a player
 * in a step-tracked game who never moved yields 0.
 */
async function getStepTotals(
  gameIds: string[],
): Promise<(gameId: string, scorecardId: string) => number | null> {
  const rows = await db
    .select({
      gameId: sm5GamePlayerStep.gameId,
      scorecardId: sm5GamePlayerStep.scorecardId,
      steps: sql<number>`sum(${sm5GamePlayerStep.delta})::int`,
    })
    .from(sm5GamePlayerStep)
    .where(inArray(sm5GamePlayerStep.gameId, gameIds))
    .groupBy(sm5GamePlayerStep.gameId, sm5GamePlayerStep.scorecardId);

  const gamesWithSteps = new Set(rows.map((r) => r.gameId));
  const byScorecard = new Map(rows.map((r) => [r.scorecardId, Number(r.steps)]));
  return (gameId, scorecardId) =>
    gamesWithSteps.has(gameId) ? (byScorecard.get(scorecardId) ?? 0) : null;
}

/**
 * Fans a set of already-selected game rows out into full GameDetails: teams, scorecards,
 * MVP components, per-player hit interactions and tags, in one round trip each.
 *
 * Shared by every "list of fully-detailed games" query — the callers differ only in which
 * games they select (a center's night, a competition's whole run), never in what a detailed
 * game looks like.
 */
async function buildGameDetails(gameRows: GameDetailListRow[]): Promise<GameDetail[]> {
  if (gameRows.length === 0) return [];

  const gameIds = gameRows.map((r) => r.id);

  const [teamRows, scorecardRows, mvpRows, interactionRows, tagRows, stepsFor] = await Promise.all([
    db
      .select({
        gameId: sm5GameTeam.gameId,
        id: sm5GameTeam.id,
        name: sm5GameTeam.name,
        colourEnum: sm5GameTeam.colourEnum,
        score: sm5GameTeam.score,
        eliminationBonus: sm5GameTeam.eliminationBonus,
        penaltyScore: sm5GameTeam.penaltyScore,
        result: sm5GameTeam.result,
        eliminated: sm5GameTeam.eliminated,
      })
      .from(sm5GameTeam)
      .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false))),

    db
      .select({
        id: sm5Scorecard.id,
        gameId: sm5Scorecard.gameId,
        teamId: sm5Scorecard.teamId,
        playerId: sm5Scorecard.playerId,
        iplId: sm5Scorecard.iplId,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
        eliminated: sm5Scorecard.eliminated,
        score: sm5Scorecard.score,
        mvpPoints: sm5Scorecard.mvpPoints,
        livesLeft: sm5Scorecard.livesLeft,
        shotsLeft: sm5Scorecard.shotsLeft,
        hitDiff: sm5Scorecard.hitDiff,
        accuracy: sm5Scorecard.accuracy,
        shotsFired: sm5Scorecard.shotsFired,
        shotsHit: sm5Scorecard.shotsHit,
        shotsHitOpponent: sm5Scorecard.shotsHitOpponent,
        shotsHitOpponent3hit: sm5Scorecard.shotsHitOpponent3hit,
        shotsHitTeam: sm5Scorecard.shotsHitTeam,
        shotsHitOpponentMedic: sm5Scorecard.shotsHitOpponentMedic,
        shotsHitTeamMedic: sm5Scorecard.shotsHitTeamMedic,
        medicHits: sm5Scorecard.medicHits,
        teamMedicHits: sm5Scorecard.teamMedicHits,
        timesHit: sm5Scorecard.timesHit,
        missileHits: sm5Scorecard.missileHits,
        missilesHitOpponent: sm5Scorecard.missilesHitOpponent,
        missilesHitTeam: sm5Scorecard.missilesHitTeam,
        missilesHitOpponentMedic: sm5Scorecard.missilesHitOpponentMedic,
        missilesHitTeamMedic: sm5Scorecard.missilesHitTeamMedic,
        timesHitByMissile: sm5Scorecard.timesHitByMissile,
        nukesActivated: sm5Scorecard.nukesActivated,
        nukesDetonated: sm5Scorecard.nukesDetonated,
        nukesHitMedic: sm5Scorecard.nukesHitMedic,
        livesRemovedByNuke: sm5Scorecard.livesRemovedByNuke,
        totalNukeActivationTime: sm5Scorecard.totalNukeActivationTime,
        averageNukeActivationTime: sm5Scorecard.averageNukeActivationTime,
        nukesCanceled: sm5Scorecard.nukesCanceled,
        teamNukesCanceled: sm5Scorecard.teamNukesCanceled,
        rapidFire: sm5Scorecard.rapidFire,
        totalRapidTime: sm5Scorecard.totalRapidTime,
        averageRapidTime: sm5Scorecard.averageRapidTime,
        shotsFiredDuringRapid: sm5Scorecard.shotsFiredDuringRapid,
        shotsHitDuringRapid: sm5Scorecard.shotsHitDuringRapid,
        shotsHitOpponentDuringRapid: sm5Scorecard.shotsHitOpponentDuringRapid,
        shotsHitTeamDuringRapid: sm5Scorecard.shotsHitTeamDuringRapid,
        accuracyDuringRapid: sm5Scorecard.accuracyDuringRapid,
        ammoBoost: sm5Scorecard.ammoBoost,
        lifeBoost: sm5Scorecard.lifeBoost,
        resuppliesGiven: sm5Scorecard.resuppliesGiven,
        doubleResuppliesGiven: sm5Scorecard.doubleResuppliesGiven,
        resuppliesReceivedAmmo: sm5Scorecard.resuppliesReceivedAmmo,
        resuppliesReceivedLives: sm5Scorecard.resuppliesReceivedLives,
        doubleResuppliesReceived: sm5Scorecard.doubleResuppliesReceived,
        deactivatedOpponent: sm5Scorecard.deactivatedOpponent,
        deactivatedTeam: sm5Scorecard.deactivatedTeam,
        eliminatedOpponent: sm5Scorecard.eliminatedOpponent,
        eliminatedTeam: sm5Scorecard.eliminatedTeam,
        eliminatedOpponentMedic: sm5Scorecard.eliminatedOpponentMedic,
        eliminatedTeamMedic: sm5Scorecard.eliminatedTeamMedic,
        assists: sm5Scorecard.assists,
        resetOpponent: sm5Scorecard.resetOpponent,
        resetTeam: sm5Scorecard.resetTeam,
        missileResetOpponent: sm5Scorecard.missileResetOpponent,
        missileResetTeam: sm5Scorecard.missileResetTeam,
        timesReset: sm5Scorecard.timesReset,
        timesResetByMissile: sm5Scorecard.timesResetByMissile,
        spEarned: sm5Scorecard.spEarned,
        spSpent: sm5Scorecard.spSpent,
        targetsDestroyed: sm5Scorecard.targetsDestroyed,
        penalties: sm5Scorecard.penalties,
        isMercenary: sm5Scorecard.isMercenary,
        uptime: sm5Scorecard.uptime,
        resupplyDowntime: sm5Scorecard.resupplyDowntime,
        otherDowntime: sm5Scorecard.otherDowntime,
        endTime: sm5Scorecard.endTime,
      })
      .from(sm5Scorecard)
      .where(inArray(sm5Scorecard.gameId, gameIds))
      .orderBy(desc(sm5Scorecard.score)),

    db
      .select({
        scorecardId: sm5ScorecardMvp.scorecardId,
        component: sm5ScorecardMvp.component,
        inputValue: sm5ScorecardMvp.inputValue,
        points: sm5ScorecardMvp.points,
      })
      .from(sm5ScorecardMvp)
      .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
      .where(inArray(sm5Scorecard.gameId, gameIds)),

    db
      .select({
        scorecardId: sm5GamePlayerInteraction.scorecardId,
        targetScorecardId: sm5GamePlayerInteraction.targetScorecardId,
        shotsHit: sm5GamePlayerInteraction.shotsHit,
        missileHits: sm5GamePlayerInteraction.missileHits,
        resets: sm5GamePlayerInteraction.resets,
        missileResets: sm5GamePlayerInteraction.missileResets,
      })
      .from(sm5GamePlayerInteraction)
      .where(inArray(sm5GamePlayerInteraction.gameId, gameIds)),

    db
      .select({
        gameId: gameTagAssignment.gameId,
        id: gameTag.id,
        name: gameTag.name,
        color: gameTag.color,
      })
      .from(gameTag)
      .innerJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
      .where(inArray(gameTagAssignment.gameId, gameIds)),

    getStepTotals(gameIds),
  ]);

  const mvpByScorecard = new Map<string, MvpComponentRow[]>();
  for (const row of mvpRows) {
    if (row.inputValue === 0 && row.points === 0) continue;
    const list = mvpByScorecard.get(row.scorecardId) ?? [];
    list.push({ component: row.component, inputValue: row.inputValue, points: row.points });
    mvpByScorecard.set(row.scorecardId, list);
  }

  const scorecardMeta = new Map<
    string,
    { callsign: string; position: number; score: number; teamId: string }
  >();
  for (const sc of scorecardRows) {
    scorecardMeta.set(sc.id, {
      callsign: sc.callsign,
      position: sc.position,
      score: sc.score,
      teamId: sc.teamId,
    });
  }

  type RawHit = {
    shotsHit: number;
    missileHits: number;
    resets: number;
    missileResets: number;
  };
  const interactionDealt = new Map<string, Map<string, RawHit>>();
  const interactionReceived = new Map<string, Map<string, RawHit>>();
  for (const row of interactionRows) {
    if (!interactionDealt.has(row.scorecardId)) interactionDealt.set(row.scorecardId, new Map());
    interactionDealt.get(row.scorecardId)!.set(row.targetScorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
      resets: row.resets,
      missileResets: row.missileResets,
    });
    if (!interactionReceived.has(row.targetScorecardId))
      interactionReceived.set(row.targetScorecardId, new Map());
    interactionReceived.get(row.targetScorecardId)!.set(row.scorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
      resets: row.resets,
      missileResets: row.missileResets,
    });
  }

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  const scorecardsByTeam = new Map<string, typeof scorecardRows>();
  for (const sc of scorecardRows) {
    const list = scorecardsByTeam.get(sc.teamId) ?? [];
    list.push(sc);
    scorecardsByTeam.set(sc.teamId, list);
  }

  const tagsByGame = new Map<string, GameTagSummary[]>();
  for (const tag of tagRows) {
    const list = tagsByGame.get(tag.gameId) ?? [];
    list.push({ id: tag.id, name: tag.name, color: tag.color });
    tagsByGame.set(tag.gameId, list);
  }

  function buildPlayers(teamId: string, teamIdRef: string): GameDetailPlayer[] {
    return (scorecardsByTeam.get(teamId) ?? []).map((sc) => ({
      id: sc.id,
      playerId: sc.playerId,
      iplId: sc.iplId,
      callsign: sc.callsign,
      position: sc.position,
      eliminated: sc.eliminated,
      score: sc.score,
      mvpPoints: sc.mvpPoints,
      livesLeft: sc.livesLeft,
      shotsLeft: sc.shotsLeft,
      hitDiff: sc.hitDiff,
      accuracy: sc.accuracy,
      shotsFired: sc.shotsFired,
      shotsHit: sc.shotsHit,
      shotsHitOpponent: sc.shotsHitOpponent,
      shotsHitOpponent3hit: sc.shotsHitOpponent3hit,
      shotsHitTeam: sc.shotsHitTeam,
      shotsHitOpponentMedic: sc.shotsHitOpponentMedic,
      shotsHitTeamMedic: sc.shotsHitTeamMedic,
      medicHits: sc.medicHits,
      teamMedicHits: sc.teamMedicHits,
      timesHit: sc.timesHit,
      timesReset: sc.timesReset,
      missileHits: sc.missileHits,
      missilesHitOpponent: sc.missilesHitOpponent,
      missilesHitTeam: sc.missilesHitTeam,
      missilesHitOpponentMedic: sc.missilesHitOpponentMedic,
      missilesHitTeamMedic: sc.missilesHitTeamMedic,
      timesHitByMissile: sc.timesHitByMissile,
      timesResetByMissile: sc.timesResetByMissile,
      nukesActivated: sc.nukesActivated,
      nukesDetonated: sc.nukesDetonated,
      nukesHitMedic: sc.nukesHitMedic,
      livesRemovedByNuke: sc.livesRemovedByNuke,
      totalNukeActivationTime: sc.totalNukeActivationTime,
      averageNukeActivationTime: sc.averageNukeActivationTime,
      nukesCanceled: sc.nukesCanceled,
      teamNukesCanceled: sc.teamNukesCanceled,
      rapidFire: sc.rapidFire,
      totalRapidTime: sc.totalRapidTime,
      averageRapidTime: sc.averageRapidTime,
      shotsFiredDuringRapid: sc.shotsFiredDuringRapid,
      shotsHitDuringRapid: sc.shotsHitDuringRapid,
      shotsHitOpponentDuringRapid: sc.shotsHitOpponentDuringRapid,
      shotsHitTeamDuringRapid: sc.shotsHitTeamDuringRapid,
      accuracyDuringRapid: sc.accuracyDuringRapid,
      ammoBoost: sc.ammoBoost,
      lifeBoost: sc.lifeBoost,
      resuppliesGiven: sc.resuppliesGiven,
      doubleResuppliesGiven: sc.doubleResuppliesGiven,
      resuppliesReceivedAmmo: sc.resuppliesReceivedAmmo,
      resuppliesReceivedLives: sc.resuppliesReceivedLives,
      doubleResuppliesReceived: sc.doubleResuppliesReceived,
      deactivatedOpponent: sc.deactivatedOpponent,
      deactivatedTeam: sc.deactivatedTeam,
      eliminatedOpponent: sc.eliminatedOpponent,
      eliminatedTeam: sc.eliminatedTeam,
      eliminatedOpponentMedic: sc.eliminatedOpponentMedic,
      eliminatedTeamMedic: sc.eliminatedTeamMedic,
      assists: sc.assists,
      resetOpponent: sc.resetOpponent,
      resetTeam: sc.resetTeam,
      missileResetOpponent: sc.missileResetOpponent,
      missileResetTeam: sc.missileResetTeam,
      spEarned: sc.spEarned,
      spSpent: sc.spSpent,
      targetsDestroyed: sc.targetsDestroyed,
      penalties: sc.penalties,
      isMercenary: sc.isMercenary,
      uptime: sc.uptime,
      resupplyDowntime: sc.resupplyDowntime,
      otherDowntime: sc.otherDowntime,
      endTime: sc.endTime,
      steps: stepsFor(sc.gameId, sc.id),
      mvpComponents: mvpByScorecard.get(sc.id) ?? [],
      hitInteractions: (() => {
        const dealt = interactionDealt.get(sc.id) ?? new Map<string, RawHit>();
        const received = interactionReceived.get(sc.id) ?? new Map<string, RawHit>();
        const otherIds = new Set([...dealt.keys(), ...received.keys()]);
        const interactions: PlayerHitData[] = [];
        for (const otherId of otherIds) {
          const meta = scorecardMeta.get(otherId);
          if (!meta) continue;
          const d = dealt.get(otherId) ?? {
            shotsHit: 0,
            missileHits: 0,
            resets: 0,
            missileResets: 0,
          };
          const r = received.get(otherId) ?? {
            shotsHit: 0,
            missileHits: 0,
            resets: 0,
            missileResets: 0,
          };
          interactions.push({
            callsign: meta.callsign,
            position: meta.position,
            isTeammate: meta.teamId === teamIdRef,
            hitsDealt: d.shotsHit,
            missilesDealt: d.missileHits,
            hitsReceived: r.shotsHit,
            missilesReceived: r.missileHits,
            resetsDealt: d.resets,
            resetsReceived: r.resets,
            missileResetsDealt: d.missileResets,
            missileResetsReceived: r.missileResets,
            score: meta.score,
          });
        }
        return interactions.sort((a, b) => b.score - a.score);
      })(),
    }));
  }

  return gameRows.map((gameRow) => {
    const gameTeams: GameDetailTeam[] = (teamsByGame.get(gameRow.id) ?? [])
      .sort((a, b) => (a.result === "win" ? -1 : b.result === "win" ? 1 : 0))
      .map((team) => ({
        id: team.id,
        name: team.name,
        colourEnum: team.colourEnum,
        score: team.score,
        eliminationBonus: team.eliminationBonus,
        penaltyScore: team.penaltyScore ?? 0,
        result: team.result,
        eliminated: team.eliminated,
        players: buildPlayers(team.id, team.id),
      }));

    return {
      id: gameRow.id,
      slug: gameRow.slug,
      centerId: gameRow.centerId,
      centerSlug: gameRow.centerSlug,
      competitionId: gameRow.competitionId,
      competitionName: gameRow.competitionName,
      description: gameRow.description,
      startTime: gameRow.startTime,
      centerName: gameRow.centerName,
      outcome: gameRow.outcome,
      scheduledDuration: gameRow.scheduledDuration,
      actualDuration: gameRow.actualDuration,
      exclude: gameRow.exclude,
      tdfFilename: gameRow.tdfFilename,
      tags: tagsByGame.get(gameRow.id) ?? [],
      teams: gameTeams,
    };
  });
}

/** Every non-competition SM5 game a center played on one date, in full detail. */
export async function getNightlyDetails(centerId: string, date: string): Promise<GameDetail[]> {
  const gameRows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      competitionId: game.competitionId,
      competitionName: sql<string | null>`null`,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      exclude: game.exclude,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.type, "sm5"),
        eq(game.centerId, centerId),
        sql`date(${game.startTime}) = ${date}::date`,
        isNull(game.competitionId),
        eq(game.exclude, false),
      ),
    )
    .orderBy(desc(game.startTime));

  return buildGameDetails(gameRows);
}

/**
 * Every SM5 game assigned to a competition, in full detail, newest first.
 *
 * This is the competition-wide twin of getNightlyDetails(): a `format = 'none'` competition
 * has no rounds or matches to slice by, so its whole run is presented as one flat list the
 * same way a social night is.
 */
export async function getCompetitionGameDetails(competitionId: string): Promise<GameDetail[]> {
  const gameRows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      competitionId: game.competitionId,
      competitionName: competition.name,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      exclude: game.exclude,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .innerJoin(competition, eq(game.competitionId, competition.id))
    .where(
      and(eq(game.type, "sm5"), eq(game.competitionId, competitionId), eq(game.exclude, false)),
    )
    .orderBy(desc(game.startTime));

  return buildGameDetails(gameRows);
}

export async function getGameCenterId(id: string): Promise<string | null> {
  const [row] = await db.select({ centerId: game.centerId }).from(game).where(eq(game.id, id));
  return row?.centerId ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  await db.delete(game).where(eq(game.id, id));
}

export async function getGameDetail(id: string): Promise<GameDetail | null> {
  const [gameRow] = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      competitionId: game.competitionId,
      competitionName: competition.name,
      description: game.description,
      startTime: game.startTime,
      centerName: center.name,
      outcome: game.outcome,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      exclude: game.exclude,
      tdfFilename: game.tdfFilename,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(eq(game.id, id));

  if (!gameRow) return null;

  const [teamRows, scorecardRows, mvpRows, interactionRows, tagRows, stepsFor] = await Promise.all([
    db
      .select({
        id: sm5GameTeam.id,
        name: sm5GameTeam.name,
        colourEnum: sm5GameTeam.colourEnum,
        score: sm5GameTeam.score,
        eliminationBonus: sm5GameTeam.eliminationBonus,
        penaltyScore: sm5GameTeam.penaltyScore,
        result: sm5GameTeam.result,
        eliminated: sm5GameTeam.eliminated,
      })
      .from(sm5GameTeam)
      .where(and(eq(sm5GameTeam.gameId, id), eq(sm5GameTeam.isNeutral, false))),

    db
      .select({
        id: sm5Scorecard.id,
        teamId: sm5Scorecard.teamId,
        playerId: sm5Scorecard.playerId,
        iplId: sm5Scorecard.iplId,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
        eliminated: sm5Scorecard.eliminated,
        score: sm5Scorecard.score,
        mvpPoints: sm5Scorecard.mvpPoints,
        livesLeft: sm5Scorecard.livesLeft,
        shotsLeft: sm5Scorecard.shotsLeft,
        hitDiff: sm5Scorecard.hitDiff,
        accuracy: sm5Scorecard.accuracy,
        // Shot stats
        shotsFired: sm5Scorecard.shotsFired,
        shotsHit: sm5Scorecard.shotsHit,
        shotsHitOpponent: sm5Scorecard.shotsHitOpponent,
        shotsHitOpponent3hit: sm5Scorecard.shotsHitOpponent3hit,
        shotsHitTeam: sm5Scorecard.shotsHitTeam,
        shotsHitOpponentMedic: sm5Scorecard.shotsHitOpponentMedic,
        shotsHitTeamMedic: sm5Scorecard.shotsHitTeamMedic,
        medicHits: sm5Scorecard.medicHits,
        teamMedicHits: sm5Scorecard.teamMedicHits,
        timesHit: sm5Scorecard.timesHit,
        // Missile stats
        missileHits: sm5Scorecard.missileHits,
        missilesHitOpponent: sm5Scorecard.missilesHitOpponent,
        missilesHitTeam: sm5Scorecard.missilesHitTeam,
        missilesHitOpponentMedic: sm5Scorecard.missilesHitOpponentMedic,
        missilesHitTeamMedic: sm5Scorecard.missilesHitTeamMedic,
        timesHitByMissile: sm5Scorecard.timesHitByMissile,
        // Nuke stats
        nukesActivated: sm5Scorecard.nukesActivated,
        nukesDetonated: sm5Scorecard.nukesDetonated,
        nukesHitMedic: sm5Scorecard.nukesHitMedic,
        livesRemovedByNuke: sm5Scorecard.livesRemovedByNuke,
        totalNukeActivationTime: sm5Scorecard.totalNukeActivationTime,
        averageNukeActivationTime: sm5Scorecard.averageNukeActivationTime,
        // Nuke cancel stats
        nukesCanceled: sm5Scorecard.nukesCanceled,
        teamNukesCanceled: sm5Scorecard.teamNukesCanceled,
        // Scout special ability
        rapidFire: sm5Scorecard.rapidFire,
        totalRapidTime: sm5Scorecard.totalRapidTime,
        averageRapidTime: sm5Scorecard.averageRapidTime,
        shotsFiredDuringRapid: sm5Scorecard.shotsFiredDuringRapid,
        shotsHitDuringRapid: sm5Scorecard.shotsHitDuringRapid,
        shotsHitOpponentDuringRapid: sm5Scorecard.shotsHitOpponentDuringRapid,
        shotsHitTeamDuringRapid: sm5Scorecard.shotsHitTeamDuringRapid,
        accuracyDuringRapid: sm5Scorecard.accuracyDuringRapid,
        // Ammo/Medic special ability
        ammoBoost: sm5Scorecard.ammoBoost,
        lifeBoost: sm5Scorecard.lifeBoost,
        // Support stats
        resuppliesGiven: sm5Scorecard.resuppliesGiven,
        doubleResuppliesGiven: sm5Scorecard.doubleResuppliesGiven,
        resuppliesReceivedAmmo: sm5Scorecard.resuppliesReceivedAmmo,
        resuppliesReceivedLives: sm5Scorecard.resuppliesReceivedLives,
        doubleResuppliesReceived: sm5Scorecard.doubleResuppliesReceived,
        // Combat outcomes
        deactivatedOpponent: sm5Scorecard.deactivatedOpponent,
        deactivatedTeam: sm5Scorecard.deactivatedTeam,
        eliminatedOpponent: sm5Scorecard.eliminatedOpponent,
        eliminatedTeam: sm5Scorecard.eliminatedTeam,
        eliminatedOpponentMedic: sm5Scorecard.eliminatedOpponentMedic,
        eliminatedTeamMedic: sm5Scorecard.eliminatedTeamMedic,
        assists: sm5Scorecard.assists,
        resetOpponent: sm5Scorecard.resetOpponent,
        resetTeam: sm5Scorecard.resetTeam,
        missileResetOpponent: sm5Scorecard.missileResetOpponent,
        missileResetTeam: sm5Scorecard.missileResetTeam,
        timesReset: sm5Scorecard.timesReset,
        timesResetByMissile: sm5Scorecard.timesResetByMissile,
        // SP tracking
        spEarned: sm5Scorecard.spEarned,
        spSpent: sm5Scorecard.spSpent,
        // Targets and penalties
        targetsDestroyed: sm5Scorecard.targetsDestroyed,
        penalties: sm5Scorecard.penalties,
        isMercenary: sm5Scorecard.isMercenary,
        // Uptime & downtime
        uptime: sm5Scorecard.uptime,
        resupplyDowntime: sm5Scorecard.resupplyDowntime,
        otherDowntime: sm5Scorecard.otherDowntime,
        endTime: sm5Scorecard.endTime,
      })
      .from(sm5Scorecard)
      .where(eq(sm5Scorecard.gameId, id))
      .orderBy(desc(sm5Scorecard.score)),

    db
      .select({
        scorecardId: sm5ScorecardMvp.scorecardId,
        component: sm5ScorecardMvp.component,
        inputValue: sm5ScorecardMvp.inputValue,
        points: sm5ScorecardMvp.points,
      })
      .from(sm5ScorecardMvp)
      .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
      .where(eq(sm5Scorecard.gameId, id)),

    db
      .select({
        scorecardId: sm5GamePlayerInteraction.scorecardId,
        targetScorecardId: sm5GamePlayerInteraction.targetScorecardId,
        shotsHit: sm5GamePlayerInteraction.shotsHit,
        missileHits: sm5GamePlayerInteraction.missileHits,
        resets: sm5GamePlayerInteraction.resets,
        missileResets: sm5GamePlayerInteraction.missileResets,
      })
      .from(sm5GamePlayerInteraction)
      .where(eq(sm5GamePlayerInteraction.gameId, id)),

    db
      .select({
        id: gameTag.id,
        name: gameTag.name,
        color: gameTag.color,
      })
      .from(gameTag)
      .innerJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
      .where(eq(gameTagAssignment.gameId, id)),

    getStepTotals([id]),
  ]);

  const mvpByScorecard = new Map<string, MvpComponentRow[]>();
  for (const row of mvpRows) {
    if (row.inputValue === 0 && row.points === 0) continue;
    const list = mvpByScorecard.get(row.scorecardId) ?? [];
    list.push({
      component: row.component,
      inputValue: row.inputValue,
      points: row.points,
    });
    mvpByScorecard.set(row.scorecardId, list);
  }

  // Build a lookup of scorecardId → {callsign, position, score, teamId} for interaction labeling
  const scorecardMeta = new Map<
    string,
    { callsign: string; position: number; score: number; teamId: string }
  >();
  for (const sc of scorecardRows) {
    scorecardMeta.set(sc.id, {
      callsign: sc.callsign,
      position: sc.position,
      score: sc.score,
      teamId: sc.teamId,
    });
  }

  // Build bidirectional interaction data keyed by player scorecardId
  // interactionDealt[actorId][targetId] = {shotsHit, missileHits}
  // interactionReceived[targetId][actorId] = {shotsHit, missileHits}
  type RawHit = {
    shotsHit: number;
    missileHits: number;
    resets: number;
    missileResets: number;
  };
  const interactionDealt = new Map<string, Map<string, RawHit>>();
  const interactionReceived = new Map<string, Map<string, RawHit>>();

  for (const row of interactionRows) {
    if (!interactionDealt.has(row.scorecardId)) interactionDealt.set(row.scorecardId, new Map());
    interactionDealt.get(row.scorecardId)!.set(row.targetScorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
      resets: row.resets,
      missileResets: row.missileResets,
    });
    if (!interactionReceived.has(row.targetScorecardId))
      interactionReceived.set(row.targetScorecardId, new Map());
    interactionReceived.get(row.targetScorecardId)!.set(row.scorecardId, {
      shotsHit: row.shotsHit,
      missileHits: row.missileHits,
      resets: row.resets,
      missileResets: row.missileResets,
    });
  }

  const scorecardsByTeam = new Map<string, typeof scorecardRows>();
  for (const sc of scorecardRows) {
    const list = scorecardsByTeam.get(sc.teamId) ?? [];
    list.push(sc);
    scorecardsByTeam.set(sc.teamId, list);
  }

  const teams: GameDetailTeam[] = teamRows
    .sort((a, b) => (a.result === "win" ? -1 : b.result === "win" ? 1 : 0))
    .map((team) => ({
      id: team.id,
      name: team.name,
      colourEnum: team.colourEnum,
      score: team.score,
      eliminationBonus: team.eliminationBonus,
      penaltyScore: team.penaltyScore ?? 0,
      result: team.result,
      eliminated: team.eliminated,
      players: (scorecardsByTeam.get(team.id) ?? []).map((sc) => ({
        id: sc.id,
        playerId: sc.playerId,
        iplId: sc.iplId,
        callsign: sc.callsign,
        position: sc.position,
        eliminated: sc.eliminated,
        score: sc.score,
        mvpPoints: sc.mvpPoints,
        livesLeft: sc.livesLeft,
        shotsLeft: sc.shotsLeft,
        hitDiff: sc.hitDiff,
        accuracy: sc.accuracy,
        shotsFired: sc.shotsFired,
        shotsHit: sc.shotsHit,
        shotsHitOpponent: sc.shotsHitOpponent,
        shotsHitOpponent3hit: sc.shotsHitOpponent3hit,
        shotsHitTeam: sc.shotsHitTeam,
        shotsHitOpponentMedic: sc.shotsHitOpponentMedic,
        shotsHitTeamMedic: sc.shotsHitTeamMedic,
        medicHits: sc.medicHits,
        teamMedicHits: sc.teamMedicHits,
        timesHit: sc.timesHit,
        timesReset: sc.timesReset,
        missileHits: sc.missileHits,
        missilesHitOpponent: sc.missilesHitOpponent,
        missilesHitTeam: sc.missilesHitTeam,
        missilesHitOpponentMedic: sc.missilesHitOpponentMedic,
        missilesHitTeamMedic: sc.missilesHitTeamMedic,
        timesHitByMissile: sc.timesHitByMissile,
        timesResetByMissile: sc.timesResetByMissile,
        nukesActivated: sc.nukesActivated,
        nukesDetonated: sc.nukesDetonated,
        nukesHitMedic: sc.nukesHitMedic,
        livesRemovedByNuke: sc.livesRemovedByNuke,
        totalNukeActivationTime: sc.totalNukeActivationTime,
        averageNukeActivationTime: sc.averageNukeActivationTime,
        nukesCanceled: sc.nukesCanceled,
        teamNukesCanceled: sc.teamNukesCanceled,
        rapidFire: sc.rapidFire,
        totalRapidTime: sc.totalRapidTime,
        averageRapidTime: sc.averageRapidTime,
        shotsFiredDuringRapid: sc.shotsFiredDuringRapid,
        shotsHitDuringRapid: sc.shotsHitDuringRapid,
        shotsHitOpponentDuringRapid: sc.shotsHitOpponentDuringRapid,
        shotsHitTeamDuringRapid: sc.shotsHitTeamDuringRapid,
        accuracyDuringRapid: sc.accuracyDuringRapid,
        ammoBoost: sc.ammoBoost,
        lifeBoost: sc.lifeBoost,
        resuppliesGiven: sc.resuppliesGiven,
        doubleResuppliesGiven: sc.doubleResuppliesGiven,
        resuppliesReceivedAmmo: sc.resuppliesReceivedAmmo,
        resuppliesReceivedLives: sc.resuppliesReceivedLives,
        doubleResuppliesReceived: sc.doubleResuppliesReceived,
        deactivatedOpponent: sc.deactivatedOpponent,
        deactivatedTeam: sc.deactivatedTeam,
        eliminatedOpponent: sc.eliminatedOpponent,
        eliminatedTeam: sc.eliminatedTeam,
        eliminatedOpponentMedic: sc.eliminatedOpponentMedic,
        eliminatedTeamMedic: sc.eliminatedTeamMedic,
        assists: sc.assists,
        resetOpponent: sc.resetOpponent,
        resetTeam: sc.resetTeam,
        missileResetOpponent: sc.missileResetOpponent,
        missileResetTeam: sc.missileResetTeam,
        spEarned: sc.spEarned,
        spSpent: sc.spSpent,
        targetsDestroyed: sc.targetsDestroyed,
        penalties: sc.penalties,
        isMercenary: sc.isMercenary,
        uptime: sc.uptime,
        resupplyDowntime: sc.resupplyDowntime,
        otherDowntime: sc.otherDowntime,
        endTime: sc.endTime,
        steps: stepsFor(id, sc.id),
        mvpComponents: mvpByScorecard.get(sc.id) ?? [],
        hitInteractions: (() => {
          const dealt = interactionDealt.get(sc.id) ?? new Map<string, RawHit>();
          const received = interactionReceived.get(sc.id) ?? new Map<string, RawHit>();
          const otherIds = new Set([...dealt.keys(), ...received.keys()]);
          const interactions: PlayerHitData[] = [];
          for (const otherId of otherIds) {
            const meta = scorecardMeta.get(otherId);
            if (!meta) continue;
            const d = dealt.get(otherId) ?? {
              shotsHit: 0,
              missileHits: 0,
              resets: 0,
              missileResets: 0,
            };
            const r = received.get(otherId) ?? {
              shotsHit: 0,
              missileHits: 0,
              resets: 0,
              missileResets: 0,
            };
            interactions.push({
              callsign: meta.callsign,
              position: meta.position,
              isTeammate: meta.teamId === sc.teamId,
              hitsDealt: d.shotsHit,
              missilesDealt: d.missileHits,
              hitsReceived: r.shotsHit,
              missilesReceived: r.missileHits,
              resetsDealt: d.resets,
              resetsReceived: r.resets,
              missileResetsDealt: d.missileResets,
              missileResetsReceived: r.missileResets,
              score: meta.score,
            });
          }
          return interactions.sort((a, b) => b.score - a.score);
        })(),
      })),
    }));

  return {
    id: gameRow.id,
    slug: gameRow.slug,
    centerId: gameRow.centerId,
    centerSlug: gameRow.centerSlug,
    competitionId: gameRow.competitionId,
    competitionName: gameRow.competitionName ?? null,
    description: gameRow.description,
    startTime: gameRow.startTime,
    centerName: gameRow.centerName,
    outcome: gameRow.outcome,
    scheduledDuration: gameRow.scheduledDuration,
    actualDuration: gameRow.actualDuration,
    exclude: gameRow.exclude,
    tdfFilename: gameRow.tdfFilename,
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    teams,
  };
}

export async function getGameDetailBySlug(slug: string): Promise<GameDetail | null> {
  const parsed = parseGameSlug(slug);
  if (!parsed) return null;

  const [idRow] = await db
    .select({ id: game.id })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.type, "sm5"),
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );

  if (!idRow) return null;
  return getGameDetail(idRow.id);
}

export async function getGameSlugById(gameId: string): Promise<string | null> {
  const [row] = await db
    .select({
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(eq(game.id, gameId));

  return row?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export type ReplayPlayer = {
  scorecardId: string;
  callsign: string;
  position: number;
  teamId: string;
  teamName: string;
  teamColour: number;
  eliminated: boolean;
};

export type ReplayEvent = {
  id: string;
  time: number;
  eventType: string;
  description: string;
  actorScorecardId: string | null;
  actorGameTargetId: string | null;
  targetScorecardId: string | null;
  targetGameTargetId: string | null;
  isPlayerTarget: boolean;
};

export type NonPlayerActor = {
  gameTargetId: string;
  name: string;
  type: string;
};

export type ReplayPlayerState = {
  scorecardId: string;
  time: number;
  score: number;
  lives: number;
  shots: number;
  missiles: number;
  sp: number;
  state: number;
  isRapidFire: boolean;
  isNuking: boolean;
  isEliminated: boolean;
  accuracy: number;
  hitDiff: number;
};

export type ReplayData = {
  duration: number;
  players: ReplayPlayer[];
  events: ReplayEvent[];
  playerStates: ReplayPlayerState[];
  nonPlayerActors: NonPlayerActor[];
};

export async function getGameReplayData(gameId: string): Promise<ReplayData | null> {
  const [gameRow] = await db
    .select({ actualDuration: game.actualDuration })
    .from(game)
    .where(eq(game.id, gameId));

  if (!gameRow) return null;

  const [eventRows, stateRows, scorecardRows, nonPlayerActorRows] = await Promise.all([
    db
      .select({
        id: sm5GameEvent.id,
        time: sm5GameEvent.time,
        eventType: sm5GameEvent.eventType,
        description: sm5GameEvent.description,
        actorScorecardId: sm5GameEvent.actorScorecardId,
        actorGameTargetId: sm5GameEvent.actorGameTargetId,
        targetScorecardId: sm5GameEvent.targetScorecardId,
        targetGameTargetId: sm5GameEvent.targetGameTargetId,
      })
      .from(sm5GameEvent)
      .where(eq(sm5GameEvent.gameId, gameId))
      .orderBy(asc(sm5GameEvent.time)),

    db
      .select({
        scorecardId: sm5GamePlayerState.scorecardId,
        time: sm5GamePlayerState.time,
        score: sm5GamePlayerState.score,
        lives: sm5GamePlayerState.lives,
        shots: sm5GamePlayerState.shots,
        missiles: sm5GamePlayerState.missiles,
        sp: sm5GamePlayerState.sp,
        state: sm5GamePlayerState.state,
        isRapidFire: sm5GamePlayerState.isRapidFire,
        isNuking: sm5GamePlayerState.isNuking,
        isEliminated: sm5GamePlayerState.isEliminated,
        accuracy: sm5GamePlayerState.accuracy,
        hitDiff: sm5GamePlayerState.hitDiff,
      })
      .from(sm5GamePlayerState)
      .where(eq(sm5GamePlayerState.gameId, gameId))
      .orderBy(asc(sm5GamePlayerState.scorecardId), asc(sm5GamePlayerState.time)),

    db
      .select({
        id: sm5Scorecard.id,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
        teamId: sm5Scorecard.teamId,
        eliminated: sm5Scorecard.eliminated,
        teamName: sm5GameTeam.name,
        teamColour: sm5GameTeam.colourEnum,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
      .where(and(eq(sm5Scorecard.gameId, gameId), eq(sm5GameTeam.isNeutral, false))),

    db
      .select({
        gameTargetId: sm5GameTarget.id,
        name: target.name,
        type: sm5GameTarget.type,
      })
      .from(sm5GameTarget)
      .innerJoin(target, eq(sm5GameTarget.targetId, target.id))
      .where(eq(sm5GameTarget.gameId, gameId)),
  ]);

  return {
    duration: gameRow.actualDuration,
    players: scorecardRows.map((sc) => ({
      scorecardId: sc.id,
      callsign: sc.callsign,
      position: sc.position,
      teamId: sc.teamId,
      teamName: sc.teamName,
      teamColour: sc.teamColour,
      eliminated: sc.eliminated,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      time: e.time,
      eventType: e.eventType,
      description: e.description,
      actorScorecardId: e.actorScorecardId,
      actorGameTargetId: e.actorGameTargetId,
      targetScorecardId: e.targetScorecardId,
      targetGameTargetId: e.targetGameTargetId,
      isPlayerTarget: e.targetScorecardId !== null,
    })),
    playerStates: stateRows.map((s) => ({
      scorecardId: s.scorecardId,
      time: s.time,
      score: s.score,
      lives: s.lives,
      shots: s.shots,
      missiles: s.missiles,
      sp: s.sp,
      state: s.state,
      isRapidFire: s.isRapidFire,
      isNuking: s.isNuking,
      isEliminated: s.isEliminated,
      accuracy: s.accuracy,
      hitDiff: s.hitDiff,
    })),
    nonPlayerActors: nonPlayerActorRows,
  };
}

// ---------------------------------------------------------------------------
// Player Timeline
// ---------------------------------------------------------------------------

export type PlayerTimelinePoint = {
  time: number;
  score: number;
  lives: number;
  shots: number;
  state: number;
};

export type PlayerTimelineInterval = {
  start: number;
  end: number;
  kind: "down" | "resupply";
};

export type PlayerTimelineMarkerKind =
  | "missileGiven"
  | "missiled"
  | "nukeActivate"
  | "nukeDetonate"
  | "nukedBy"
  | "teamNuke"
  | "baseDestroyed"
  | "baseAward";

export type PlayerTimelineMarker = {
  time: number;
  kind: PlayerTimelineMarkerKind;
  // The other party involved: missile target/shooter, the nuking commander, or
  // the base destroyed. Null for the player's own nuke events.
  otherCallsign: string | null;
};

export type PlayerTimeline = {
  duration: number;
  eliminatedAt: number | null;
  points: PlayerTimelinePoint[];
  // Null when the game's TDF carried no step lines (matches getStepTotals).
  steps: { time: number; total: number }[] | null;
  // Steps per minute in fixed time slices, null alongside steps. maxRate is
  // the busiest slice of any player in the game, so every player's activity
  // lane shares one scale.
  activity: { bins: PlayerActivityBin[]; maxRate: number } | null;
  intervals: PlayerTimelineInterval[];
  markers: PlayerTimelineMarker[];
};

export type PlayerActivityBin = { start: number; end: number; rate: number };

const ACTIVITY_BIN_MS = 15_000;

// Buckets step deltas into ACTIVITY_BIN_MS slices up to endTime. The trailing
// partial slice is folded into the one before it, so no slice is shorter than
// ACTIVITY_BIN_MS and a few steps in a sliver of time can't spike the rate.
function activityBins(steps: { time: number; delta: number }[], endTime: number) {
  if (endTime <= 0) return [];
  const count = Math.max(1, Math.floor(endTime / ACTIVITY_BIN_MS));
  const totals = Array.from({ length: count }, () => 0);
  for (const s of steps) {
    if (s.time > endTime) continue;
    totals[Math.min(count - 1, Math.floor(s.time / ACTIVITY_BIN_MS))]! += s.delta;
  }
  return totals.map((total, i): PlayerActivityBin => {
    const start = i * ACTIVITY_BIN_MS;
    const end = i === count - 1 ? endTime : start + ACTIVITY_BIN_MS;
    return { start, end, rate: (total * 60_000) / (end - start) };
  });
}

const TIMELINE_EVENT_TYPES = [
  "0206", // deactivated by shot
  "0204", // target destroyed (3rd shot)
  "0209", // deactivated by warbot
  "0303", // target destroyed (missile)
  "0306", // missile hit opponent
  "0308", // missile hit teammate
  "0404", // nuke activate
  "0405", // nuke detonate
  "0500", // ammo resupply
  "0502", // lives resupply
  "0600", // penalty (actor is the penalised player)
  "0B03", // base awarded on early team elimination
] as const;

// Deactivations that mark a downtime span as "other", even when they land on a
// player who is already down (mirrors the simulator's deactivationCause).
const OTHER_DEACTIVATION_TYPES = new Set(["0206", "0209", "0306", "0308"]);

// A resupply's state_3 row can land a few ms after the 0500/0502 that caused
// it on 2.005+ files (see chomper-design.md), so match within a small window.
const RESUPPLY_MATCH_WINDOW_MS = 100;

/**
 * One player's activity over a game: score/lives/shots/steps series, the
 * spans they were deactivated (split into resupply vs other downtime by the
 * latest cause, as the simulator attributes it), and missile/nuke moments.
 *
 * Spans run from the first deactivation to reactivation. The scorecard's
 * downtime totals can be lower: the simulator restarts its downtime clock when
 * a player is re-deactivated during state 2, so the earlier part of that
 * window is not counted anywhere.
 */
export async function getPlayerTimeline(
  gameId: string,
  scorecardId: string,
): Promise<PlayerTimeline | null> {
  const [scRow] = await db
    .select({ teamId: sm5Scorecard.teamId, duration: game.actualDuration })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(and(eq(sm5Scorecard.id, scorecardId), eq(sm5Scorecard.gameId, gameId)));

  if (!scRow) return null;

  const actorScorecard = alias(sm5Scorecard, "actor_scorecard");
  const targetScorecard = alias(sm5Scorecard, "target_scorecard");

  const [stateRows, gameStepRows, eliminationRows, eventRows] = await Promise.all([
    db
      .select({
        time: sm5GamePlayerState.time,
        score: sm5GamePlayerState.score,
        lives: sm5GamePlayerState.lives,
        shots: sm5GamePlayerState.shots,
        state: sm5GamePlayerState.state,
        isEliminated: sm5GamePlayerState.isEliminated,
      })
      .from(sm5GamePlayerState)
      .where(
        and(eq(sm5GamePlayerState.gameId, gameId), eq(sm5GamePlayerState.scorecardId, scorecardId)),
      )
      .orderBy(asc(sm5GamePlayerState.time)),

    // Every player's steps: this player's series, plus the game-wide scale.
    db
      .select({
        scorecardId: sm5GamePlayerStep.scorecardId,
        time: sm5GamePlayerStep.time,
        delta: sm5GamePlayerStep.delta,
        total: sm5GamePlayerStep.total,
      })
      .from(sm5GamePlayerStep)
      .where(eq(sm5GamePlayerStep.gameId, gameId))
      .orderBy(asc(sm5GamePlayerStep.time)),

    db
      .select({
        scorecardId: sm5GamePlayerState.scorecardId,
        time: sql<number>`min(${sm5GamePlayerState.time})::int`,
      })
      .from(sm5GamePlayerState)
      .where(and(eq(sm5GamePlayerState.gameId, gameId), eq(sm5GamePlayerState.isEliminated, true)))
      .groupBy(sm5GamePlayerState.scorecardId),

    db
      .select({
        id: sm5GameEvent.id,
        time: sm5GameEvent.time,
        eventType: sm5GameEvent.eventType,
        actorScorecardId: sm5GameEvent.actorScorecardId,
        targetScorecardId: sm5GameEvent.targetScorecardId,
        actorCallsign: actorScorecard.callsign,
        actorTeamId: actorScorecard.teamId,
        targetCallsign: targetScorecard.callsign,
        targetName: target.name,
      })
      .from(sm5GameEvent)
      .leftJoin(actorScorecard, eq(sm5GameEvent.actorScorecardId, actorScorecard.id))
      .leftJoin(targetScorecard, eq(sm5GameEvent.targetScorecardId, targetScorecard.id))
      .leftJoin(sm5GameTarget, eq(sm5GameEvent.targetGameTargetId, sm5GameTarget.id))
      .leftJoin(target, eq(sm5GameTarget.targetId, target.id))
      .where(
        and(
          eq(sm5GameEvent.gameId, gameId),
          inArray(sm5GameEvent.eventType, [...TIMELINE_EVENT_TYPES]),
        ),
      )
      .orderBy(asc(sm5GameEvent.time)),
  ]);

  const duration = scRow.duration;
  const eliminatedAt = stateRows.find((s) => s.isEliminated)?.time ?? null;
  const endTime = eliminatedAt ?? duration;

  // Every non-eliminated opponent is hit by a detonation, including players
  // already down, so an opponent 0405 before this player's elimination is a hit.
  const isOpponentNuke = (e: (typeof eventRows)[number]) =>
    e.eventType === "0405" &&
    e.actorScorecardId !== scorecardId &&
    e.actorTeamId !== null &&
    e.actorTeamId !== scRow.teamId &&
    e.time <= endTime;

  // Events that set the cause of the current downtime span, as the simulator
  // tracks it: a resupply (even one landing while already down) makes the span
  // resupply downtime; a nuke or any other deactivation makes it other downtime.
  const causes: { time: number; resupply: boolean }[] = [];
  const resupplyTimes: number[] = [];
  for (const e of eventRows) {
    if ((e.eventType === "0500" || e.eventType === "0502") && e.targetScorecardId === scorecardId) {
      resupplyTimes.push(e.time);
      causes.push({ time: e.time, resupply: true });
    } else if (
      isOpponentNuke(e) ||
      (OTHER_DEACTIVATION_TYPES.has(e.eventType) && e.targetScorecardId === scorecardId) ||
      (e.eventType === "0600" && e.actorScorecardId === scorecardId)
    ) {
      causes.push({ time: e.time, resupply: false });
    }
  }
  const isResupplyAt = (t: number) =>
    resupplyTimes.some((r) => r <= t && t - r <= RESUPPLY_MATCH_WINDOW_MS);

  // State 0 is active; 3 and 2 are the two halves of the deactivated window.
  // A re-deactivation during state 2 re-enters 3 and restarts the cycle without
  // the player ever coming back up, so the whole run is one span.
  const spans: { start: number; end: number }[] = [];
  let downStart: number | null = null;
  let prevState = 0;
  for (const s of stateRows) {
    if (s.time > endTime) break;
    if (s.state === 3 && prevState !== 3) {
      if (downStart === null) downStart = s.time;
      if (!isResupplyAt(s.time)) causes.push({ time: s.time, resupply: false });
    } else if (s.state === 0 && downStart !== null) {
      spans.push({ start: downStart, end: s.time });
      downStart = null;
    }
    prevState = s.state;
  }
  if (downStart !== null) spans.push({ start: downStart, end: endTime });

  causes.sort((a, b) => a.time - b.time);
  const intervals: PlayerTimelineInterval[] = spans.map(({ start, end }) => {
    let resupply = false;
    for (const c of causes) {
      if (c.time >= end) break;
      if (c.time >= start - RESUPPLY_MATCH_WINDOW_MS) resupply = c.resupply;
    }
    return { start, end, kind: resupply ? "resupply" : "down" };
  });

  const markers: PlayerTimelineMarker[] = [];
  for (const e of eventRows) {
    const isActor = e.actorScorecardId === scorecardId;
    switch (e.eventType) {
      case "0306":
      case "0308":
        if (isActor) {
          markers.push({ time: e.time, kind: "missileGiven", otherCallsign: e.targetCallsign });
        } else if (e.targetScorecardId === scorecardId) {
          markers.push({ time: e.time, kind: "missiled", otherCallsign: e.actorCallsign });
        }
        break;
      case "0204":
      case "0303":
        if (isActor) {
          markers.push({ time: e.time, kind: "baseDestroyed", otherCallsign: e.targetName });
        }
        break;
      case "0B03":
        if (isActor) {
          markers.push({ time: e.time, kind: "baseAward", otherCallsign: e.targetName });
        }
        break;
      case "0404":
        if (isActor) markers.push({ time: e.time, kind: "nukeActivate", otherCallsign: null });
        break;
      case "0405":
        if (isActor) {
          markers.push({ time: e.time, kind: "nukeDetonate", otherCallsign: null });
        } else if (e.actorTeamId === scRow.teamId) {
          markers.push({ time: e.time, kind: "teamNuke", otherCallsign: e.actorCallsign });
        } else if (isOpponentNuke(e)) {
          markers.push({ time: e.time, kind: "nukedBy", otherCallsign: e.actorCallsign });
        }
        break;
    }
  }

  let activity: PlayerTimeline["activity"] = null;
  if (gameStepRows.length > 0) {
    const stepsByScorecard = new Map<string, { time: number; delta: number }[]>();
    for (const r of gameStepRows) {
      const list = stepsByScorecard.get(r.scorecardId) ?? [];
      list.push(r);
      stepsByScorecard.set(r.scorecardId, list);
    }
    const eliminatedBy = new Map(eliminationRows.map((r) => [r.scorecardId, r.time]));
    let maxRate = 0;
    for (const [id, steps] of stepsByScorecard) {
      for (const b of activityBins(steps, eliminatedBy.get(id) ?? duration)) {
        if (b.rate > maxRate) maxRate = b.rate;
      }
    }
    activity = {
      bins: activityBins(stepsByScorecard.get(scorecardId) ?? [], endTime),
      maxRate,
    };
  }

  return {
    duration,
    eliminatedAt,
    points: stateRows.map((s) => ({
      time: s.time,
      score: s.score,
      lives: s.lives,
      shots: s.shots,
      state: s.state,
    })),
    steps:
      gameStepRows.length === 0
        ? null
        : gameStepRows
            .filter((r) => r.scorecardId === scorecardId)
            .map((r) => ({ time: r.time, total: r.total })),
    activity,
    intervals,
    markers,
  };
}

// ---------------------------------------------------------------------------
// Game Momentum
// ---------------------------------------------------------------------------

// Scoring event types that feed the momentum chart. Referee penalties and
// non-scoring events (misses, locks, mission start/end, state changes) are
// intentionally excluded.
export const MOMENTUM_EVENT_TYPES = [
  "0205", // opponent hit (tag)
  "0206", // opponent deactivate
  "0306", // missile hit opponent
  "0204", // target destroyed (shot)
  "0303", // target destroyed (missile)
  "0B03", // base award
  "0405", // nuke detonate
] as const;

export type MomentumEvent = {
  time: number;
  eventType: string;
  actorTeamId: string;
  targetTeamId: string | null;
  // Text shown on the marker when hovered. For scoring events this is the
  // acting player; for eliminations (synthetic "ELIM" eventType) it's the
  // eliminated player, even though the momentum credit goes to their opponent.
  markerLabel: string | null;
  // Position (1-5) of the player named in markerLabel. Only populated for
  // eliminations, where the tooltip shows what role was taken out.
  markerPosition: number | null;
};

export type MomentumTeam = {
  teamId: string;
  teamName: string;
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  penaltyScore: number | null;
  result: "win" | "loss" | "draw" | null;
  eliminated: boolean | null;
};

// A team's cumulative score immediately after it changed. Only emitted on
// change, mirroring the sparse event-driven shape of MomentumEvent.
export type ScoreEvent = {
  time: number;
  teamId: string;
  score: number;
};

export type GameMomentumData = {
  duration: number;
  teams: MomentumTeam[];
  events: MomentumEvent[];
  scoreEvents: ScoreEvent[];
};

export async function getGameMomentumData(gameId: string): Promise<GameMomentumData | null> {
  const [gameRow] = await db
    .select({ actualDuration: game.actualDuration })
    .from(game)
    .where(eq(game.id, gameId));

  if (!gameRow) return null;

  const actorScorecard = alias(sm5Scorecard, "actor_scorecard");
  const targetScorecard = alias(sm5Scorecard, "target_scorecard");

  const [teamRows, scoringEventRows, eliminationRows, scoreSnapshotRows] = await Promise.all([
    db
      .select({
        teamId: sm5GameTeam.id,
        teamName: sm5GameTeam.name,
        colourEnum: sm5GameTeam.colourEnum,
        score: sm5GameTeam.score,
        eliminationBonus: sm5GameTeam.eliminationBonus,
        penaltyScore: sm5GameTeam.penaltyScore,
        result: sm5GameTeam.result,
        eliminated: sm5GameTeam.eliminated,
      })
      .from(sm5GameTeam)
      .where(and(eq(sm5GameTeam.gameId, gameId), eq(sm5GameTeam.isNeutral, false)))
      .orderBy(asc(sm5GameTeam.id)),

    db
      .select({
        time: sm5GameEvent.time,
        eventType: sm5GameEvent.eventType,
        actorTeamId: actorScorecard.teamId,
        markerLabel: actorScorecard.callsign,
        targetTeamId: targetScorecard.teamId,
      })
      .from(sm5GameEvent)
      .innerJoin(actorScorecard, eq(sm5GameEvent.actorScorecardId, actorScorecard.id))
      .leftJoin(targetScorecard, eq(sm5GameEvent.targetScorecardId, targetScorecard.id))
      .where(
        and(eq(sm5GameEvent.gameId, gameId), inArray(sm5GameEvent.eventType, MOMENTUM_EVENT_TYPES)),
      )
      .orderBy(asc(sm5GameEvent.time)),

    // Elimination timing isn't a discrete TDF event — it's derived from the
    // player-state snapshot recorded at the moment isEliminated flips true.
    db
      .select({
        time: sm5GamePlayerState.time,
        scorecardId: sm5GamePlayerState.scorecardId,
        teamId: sm5Scorecard.teamId,
        callsign: sm5Scorecard.callsign,
        position: sm5Scorecard.position,
      })
      .from(sm5GamePlayerState)
      .innerJoin(sm5Scorecard, eq(sm5GamePlayerState.scorecardId, sm5Scorecard.id))
      .where(and(eq(sm5GamePlayerState.gameId, gameId), eq(sm5GamePlayerState.isEliminated, true)))
      .orderBy(asc(sm5GamePlayerState.time)),

    // Per-player cumulative score snapshots, used to reconstruct each team's
    // running score total over time (see scoreEvents below).
    db
      .select({
        time: sm5GamePlayerState.time,
        scorecardId: sm5GamePlayerState.scorecardId,
        teamId: sm5Scorecard.teamId,
        score: sm5GamePlayerState.score,
      })
      .from(sm5GamePlayerState)
      .innerJoin(sm5Scorecard, eq(sm5GamePlayerState.scorecardId, sm5Scorecard.id))
      .where(eq(sm5GamePlayerState.gameId, gameId))
      .orderBy(asc(sm5GamePlayerState.time)),
  ]);

  // Keep only the first (earliest) isEliminated snapshot per scorecard — the
  // moment they actually went down.
  const seenScorecards = new Set<string>();
  const eliminationEvents: MomentumEvent[] = [];
  for (const row of eliminationRows) {
    if (seenScorecards.has(row.scorecardId)) continue;
    seenScorecards.add(row.scorecardId);
    const opposingTeam = teamRows.find((t) => t.teamId !== row.teamId);
    if (!opposingTeam) continue;
    eliminationEvents.push({
      time: row.time,
      eventType: "ELIM",
      actorTeamId: opposingTeam.teamId,
      targetTeamId: row.teamId,
      markerLabel: row.callsign,
      markerPosition: row.position,
    });
  }

  const events = [
    ...scoringEventRows.map((r) => ({ ...r, markerPosition: null })),
    ...eliminationEvents,
  ].sort((a, b) => a.time - b.time);

  // Reconstruct each team's cumulative score over time from per-player score
  // snapshots: turn each player's snapshot into a delta against their own
  // previous score, then accumulate deltas into a running team total.
  const teamIds = new Set(teamRows.map((t) => t.teamId));
  const lastPlayerScore = new Map<string, number>();
  const teamTotal = new Map<string, number>(teamRows.map((t) => [t.teamId, 0]));
  const scoreEvents: ScoreEvent[] = [];
  for (const row of scoreSnapshotRows) {
    if (!teamIds.has(row.teamId)) continue;
    const delta = row.score - (lastPlayerScore.get(row.scorecardId) ?? 0);
    if (delta === 0) continue;
    lastPlayerScore.set(row.scorecardId, row.score);
    const newTotal = (teamTotal.get(row.teamId) ?? 0) + delta;
    teamTotal.set(row.teamId, newTotal);
    scoreEvents.push({ time: row.time, teamId: row.teamId, score: newTotal });
  }

  return {
    duration: gameRow.actualDuration,
    teams: teamRows,
    events,
    scoreEvents,
  };
}

export async function setScorecardMercenary(
  scorecardId: string,
  isMercenary: boolean,
): Promise<void> {
  await db.update(sm5Scorecard).set({ isMercenary }).where(eq(sm5Scorecard.id, scorecardId));
}
