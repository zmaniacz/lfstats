// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, count, desc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import { parseGameSlug } from "../lib/game-slug";
import {
  center,
  game,
  lbGameTeam,
  lbScorecard,
  lbGamePlayerInteraction,
  lbGameEvent,
  lbGamePlayerState,
  player,
} from "../schema";
import type { GameMomentumData, MomentumEvent, ScoreEvent } from "./games";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// True when the game is an overtime half (3, 4, ...) of a linked match.
const overtimeHalfSql = sql<boolean>`exists (select 1 from lb_match_game where lb_match_game.game_id = ${game.id} and lb_match_game.half > 2)`;

// ---------------------------------------------------------------------------
// Laserball Game List (read)
// ---------------------------------------------------------------------------

export type LbGameListFilters = {
  scopeFilter?: GameScopeFilter;
  /** Only these games (e.g. a user's favorites). */
  gameIds?: string[];
};

export type LbGameTeamSummary = {
  colourEnum: number;
  score: number | null;
  result: "win" | "loss" | "draw" | null;
};

export type LbGameListItem = {
  // An overtime half of a linked match.
  overtime: boolean;
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: string;
  centerName: string;
  description: string | null;
  actualDuration: number;
  teams: LbGameTeamSummary[];
};

function buildLbGameListConditions(filters: LbGameListFilters): SQL[] {
  const conditions: SQL[] = [eq(game.type, "lb")];
  // A game list, not an aggregate: excluded games stay listed.
  if (filters.scopeFilter) {
    conditions.push(...gameScopeConditions(filters.scopeFilter, { includeExcluded: true }));
  }
  if (filters.gameIds) conditions.push(inArray(game.id, filters.gameIds));
  return conditions;
}

export async function getLbGamesList(filters: LbGameListFilters = {}): Promise<LbGameListItem[]> {
  const conditions = buildLbGameListConditions(filters);

  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      overtime: overtimeHalfSql,
      centerName: center.name,
      description: game.description,
      actualDuration: game.actualDuration,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(...conditions))
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: lbGameTeam.gameId,
      colourEnum: lbGameTeam.colourEnum,
      score: lbGameTeam.score,
      result: lbGameTeam.result,
    })
    .from(lbGameTeam)
    .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
    .orderBy(lbGameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, LbGameTeamSummary[]>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push({ colourEnum: t.colourEnum, score: t.score, result: t.result });
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    centerSlug: row.centerSlug,
    startTime: row.startTime,
    outcome: row.outcome,
    overtime: row.overtime,
    centerName: row.centerName,
    description: row.description,
    actualDuration: row.actualDuration,
    teams: teamsByGame.get(row.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Laserball Player Stats (read)
// ---------------------------------------------------------------------------

export type LbPlayerWinLoss = {
  wins: number;
  losses: number;
  draws: number;
};

export async function getLbPlayerWinLoss(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<LbPlayerWinLoss> {
  const rows = await db
    .select({ result: lbGameTeam.result, count: count() })
    .from(lbScorecard)
    .innerJoin(lbGameTeam, eq(lbScorecard.teamId, lbGameTeam.id))
    .innerJoin(game, eq(lbGameTeam.gameId, game.id))
    .where(
      and(
        eq(lbScorecard.playerId, playerId),
        eq(lbGameTeam.isNeutral, false),
        ...gameScopeConditions(scopeFilter),
      ),
    )
    .groupBy(lbGameTeam.result);

  const out: LbPlayerWinLoss = { wins: 0, losses: 0, draws: 0 };
  for (const r of rows) {
    if (r.result === "win") out.wins = r.count;
    else if (r.result === "loss") out.losses = r.count;
    else if (r.result === "draw") out.draws = r.count;
  }
  return out;
}

export type LbPlayerGameListItem = {
  // An overtime half of a linked match.
  overtime: boolean;
  id: string;
  gameSlug: string;
  startTime: Date;
  outcome: string;
  centerId: string;
  centerSlug: string;
  centerName: string;
  description: string | null;
  teams: LbGameTeamSummary[];
  teamColourEnum: number;
  result: "win" | "loss" | "draw" | null;
  goals: number;
  assists: number;
  steals: number;
  blocks: number;
};

export async function getLbPlayerGames(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<LbPlayerGameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      startTime: game.startTime,
      outcome: game.outcome,
      overtime: overtimeHalfSql,
      centerId: center.id,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      centerName: center.name,
      description: game.description,
      teamColourEnum: lbGameTeam.colourEnum,
      result: lbGameTeam.result,
      goals: lbScorecard.goals,
      assists: sql<number>`(${lbScorecard.assists1} + ${lbScorecard.assists2})::int`,
      steals: lbScorecard.stealsDone,
      blocks: lbScorecard.blocksDone,
    })
    .from(lbScorecard)
    .innerJoin(lbGameTeam, eq(lbScorecard.teamId, lbGameTeam.id))
    .innerJoin(game, eq(lbGameTeam.gameId, game.id))
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(lbScorecard.playerId, playerId),
        // Excluded games are dropped here too: this list also feeds the player's charts.
        ...gameScopeConditions(scopeFilter),
      ),
    )
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = [...new Set(rows.map((r) => r.id))];
  const teamRows = await db
    .select({
      gameId: lbGameTeam.gameId,
      colourEnum: lbGameTeam.colourEnum,
      score: lbGameTeam.score,
      result: lbGameTeam.result,
    })
    .from(lbGameTeam)
    .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
    .orderBy(lbGameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, LbGameTeamSummary[]>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push({ colourEnum: t.colourEnum, score: t.score, result: t.result });
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    gameSlug: row.gameSlug,
    startTime: row.startTime,
    outcome: row.outcome,
    overtime: row.overtime,
    centerId: row.centerId,
    centerSlug: row.centerSlug,
    centerName: row.centerName,
    description: row.description,
    teams: teamsByGame.get(row.id) ?? [],
    teamColourEnum: row.teamColourEnum,
    result: row.result,
    goals: row.goals,
    assists: row.assists,
    steals: row.steals,
    blocks: row.blocks,
  }));
}

// ---------------------------------------------------------------------------
// Laserball Game Detail (read)
// ---------------------------------------------------------------------------

export type LbGameDetailPlayer = typeof lbScorecard.$inferSelect;

export type LbGameDetailTeam = {
  id: string;
  tdfTeamIndex: number;
  name: string;
  colourEnum: number;
  score: number | null;
  result: "win" | "loss" | "draw" | null;
  players: LbGameDetailPlayer[];
};

export type LbGameDetail = {
  // An overtime half of a linked match.
  overtime: boolean;
  id: string;
  slug: string;
  centerId: string;
  centerName: string;
  startTime: Date;
  outcome: string;
  description: string | null;
  scheduledDuration: number;
  actualDuration: number;
  tdfFilename: string;
  exclude: boolean;
  teams: LbGameDetailTeam[];
};

export async function getLbGameDetail(gameId: string): Promise<LbGameDetail | null> {
  const [gameRow] = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerName: center.name,
      startTime: game.startTime,
      outcome: game.outcome,
      overtime: overtimeHalfSql,
      description: game.description,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      tdfFilename: game.tdfFilename,
      exclude: game.exclude,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(eq(game.id, gameId), eq(game.type, "lb")));

  if (!gameRow) return null;

  const [teamRows, scorecardRows] = await Promise.all([
    db
      .select()
      .from(lbGameTeam)
      .where(and(eq(lbGameTeam.gameId, gameId), eq(lbGameTeam.isNeutral, false)))
      .orderBy(lbGameTeam.tdfTeamIndex),
    db
      .select()
      .from(lbScorecard)
      .where(eq(lbScorecard.gameId, gameId))
      .orderBy(desc(lbScorecard.goals)),
  ]);

  const playersByTeam = new Map<string, LbGameDetailPlayer[]>();
  for (const s of scorecardRows) {
    const list = playersByTeam.get(s.teamId) ?? [];
    list.push(s);
    playersByTeam.set(s.teamId, list);
  }

  return {
    ...gameRow,
    teams: teamRows.map((t) => ({
      id: t.id,
      tdfTeamIndex: t.tdfTeamIndex,
      name: t.name,
      colourEnum: t.colourEnum,
      score: t.score,
      result: t.result,
      players: playersByTeam.get(t.id) ?? [],
    })),
  };
}

export async function getLbGameDetailBySlug(slug: string): Promise<LbGameDetail | null> {
  const parsed = parseGameSlug(slug);
  if (!parsed) return null;

  const [idRow] = await db
    .select({ id: game.id })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.type, "lb"),
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );

  if (!idRow) return null;
  return getLbGameDetail(idRow.id);
}

// ---------------------------------------------------------------------------
// Laserball Game Structure
//
// Identity/reference upserts (center, player, battlesuit, callsign history) and
// the shared `game` insert + natural-key lookups are reused from ./chomper —
// laserball shares those tables. Only the lb_-specific inserts live here.
// ---------------------------------------------------------------------------

export async function insertLbGameTeams(tx: Tx, rows: (typeof lbGameTeam.$inferInsert)[]) {
  return tx.insert(lbGameTeam).values(rows).returning();
}

// ---------------------------------------------------------------------------
// Player Performance
// ---------------------------------------------------------------------------

export async function insertLbScorecards(tx: Tx, rows: (typeof lbScorecard.$inferInsert)[]) {
  if (rows.length === 0) return [];
  return tx.insert(lbScorecard).values(rows).returning();
}

export async function insertLbGamePlayerInteractions(
  tx: Tx,
  rows: (typeof lbGamePlayerInteraction.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(lbGamePlayerInteraction).values(rows);
}

// ---------------------------------------------------------------------------
// Replay Data
// ---------------------------------------------------------------------------

export async function insertLbGameEvents(tx: Tx, rows: (typeof lbGameEvent.$inferInsert)[]) {
  if (rows.length === 0) return [];
  const CHUNK = 1000;
  const results: (typeof lbGameEvent.$inferSelect)[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = await tx
      .insert(lbGameEvent)
      .values(rows.slice(i, i + CHUNK))
      .returning();
    results.push(...batch);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Laserball Nightly (read)
// ---------------------------------------------------------------------------

export async function getLbGameDatesForCenter(centerId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ gameDate: sql<string>`date(${game.startTime})::text` })
    .from(game)
    .where(
      and(
        eq(game.type, "lb"),
        eq(game.centerId, centerId),
        isNull(game.competitionId),
        eq(game.exclude, false),
      ),
    )
    .orderBy(desc(sql`date(${game.startTime})::text`));
  return rows.map((r) => r.gameDate);
}

export async function getMostRecentLbCenterSlug(): Promise<string | null> {
  const [row] = await db
    .select({
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(eq(game.type, "lb"), isNull(game.competitionId), eq(game.exclude, false)))
    .orderBy(desc(game.startTime))
    .limit(1);
  return row?.slug ?? null;
}

export async function getLbNightlyDetails(centerId: string, date: string): Promise<LbGameDetail[]> {
  const gameRows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerId: game.centerId,
      centerName: center.name,
      startTime: game.startTime,
      outcome: game.outcome,
      overtime: overtimeHalfSql,
      description: game.description,
      scheduledDuration: game.scheduledDuration,
      actualDuration: game.actualDuration,
      tdfFilename: game.tdfFilename,
      exclude: game.exclude,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.type, "lb"),
        eq(game.centerId, centerId),
        sql`date(${game.startTime}) = ${date}::date`,
        isNull(game.competitionId),
        eq(game.exclude, false),
      ),
    )
    .orderBy(desc(game.startTime));

  if (gameRows.length === 0) return [];

  const gameIds = gameRows.map((r) => r.id);

  const [teamRows, scorecardRows] = await Promise.all([
    db
      .select()
      .from(lbGameTeam)
      .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
      .orderBy(lbGameTeam.tdfTeamIndex),
    db
      .select()
      .from(lbScorecard)
      .where(inArray(lbScorecard.gameId, gameIds))
      .orderBy(desc(lbScorecard.goals)),
  ]);

  const playersByTeam = new Map<string, LbGameDetailPlayer[]>();
  for (const s of scorecardRows) {
    const list = playersByTeam.get(s.teamId) ?? [];
    list.push(s);
    playersByTeam.set(s.teamId, list);
  }

  const teamsByGame = new Map<string, LbGameDetailTeam[]>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push({
      id: t.id,
      tdfTeamIndex: t.tdfTeamIndex,
      name: t.name,
      colourEnum: t.colourEnum,
      score: t.score,
      result: t.result,
      players: playersByTeam.get(t.id) ?? [],
    });
    teamsByGame.set(t.gameId, list);
  }

  return gameRows.map((row) => ({ ...row, teams: teamsByGame.get(row.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// Laserball Replay Data (read)
// ---------------------------------------------------------------------------

export type LbReplayPlayer = {
  scorecardId: string;
  callsign: string;
  teamId: string;
  teamName: string;
  teamColour: number;
};

export type LbReplayEvent = {
  id: string;
  time: number;
  eventType: string;
  description: string;
  actorScorecardId: string | null;
  targetScorecardId: string | null;
};

export type LbReplayPlayerState = {
  scorecardId: string;
  time: number;
  score: number;
  state: number;
  hasBall: boolean;
  isActive: boolean;
  assists: number;
  stealsDone: number;
  stealsReceived: number;
  blocksDone: number;
  blocksReceived: number;
  clearsDone: number;
  clearsReceived: number;
  passesDone: number;
  passesReceived: number;
  possessionTimeMs: number;
};

export type LbReplayData = {
  duration: number;
  players: LbReplayPlayer[];
  events: LbReplayEvent[];
  playerStates: LbReplayPlayerState[];
};

export async function getLbGameReplayData(gameId: string): Promise<LbReplayData | null> {
  const [gameRow] = await db
    .select({ actualDuration: game.actualDuration })
    .from(game)
    .where(and(eq(game.id, gameId), eq(game.type, "lb")));

  if (!gameRow) return null;

  const [eventRows, stateRows, scorecardRows] = await Promise.all([
    db
      .select({
        id: lbGameEvent.id,
        time: lbGameEvent.time,
        eventType: lbGameEvent.eventType,
        description: lbGameEvent.description,
        actorScorecardId: lbGameEvent.actorScorecardId,
        targetScorecardId: lbGameEvent.targetScorecardId,
      })
      .from(lbGameEvent)
      .where(eq(lbGameEvent.gameId, gameId))
      .orderBy(asc(lbGameEvent.time)),

    db
      .select({
        scorecardId: lbGamePlayerState.scorecardId,
        time: lbGamePlayerState.time,
        score: lbGamePlayerState.score,
        state: lbGamePlayerState.state,
        hasBall: lbGamePlayerState.hasBall,
        isActive: lbGamePlayerState.isActive,
        assists: lbGamePlayerState.assists,
        stealsDone: lbGamePlayerState.stealsDone,
        stealsReceived: lbGamePlayerState.stealsReceived,
        blocksDone: lbGamePlayerState.blocksDone,
        blocksReceived: lbGamePlayerState.blocksReceived,
        clearsDone: lbGamePlayerState.clearsDone,
        clearsReceived: lbGamePlayerState.clearsReceived,
        passesDone: lbGamePlayerState.passesDone,
        passesReceived: lbGamePlayerState.passesReceived,
        possessionTimeMs: lbGamePlayerState.possessionTimeMs,
      })
      .from(lbGamePlayerState)
      .where(eq(lbGamePlayerState.gameId, gameId))
      .orderBy(asc(lbGamePlayerState.scorecardId), asc(lbGamePlayerState.time)),

    db
      .select({
        id: lbScorecard.id,
        callsign: lbScorecard.callsign,
        teamId: lbScorecard.teamId,
        teamName: lbGameTeam.name,
        teamColour: lbGameTeam.colourEnum,
      })
      .from(lbScorecard)
      .innerJoin(lbGameTeam, eq(lbScorecard.teamId, lbGameTeam.id))
      .where(and(eq(lbScorecard.gameId, gameId), eq(lbGameTeam.isNeutral, false))),
  ]);

  return {
    duration: gameRow.actualDuration,
    players: scorecardRows.map((sc) => ({
      scorecardId: sc.id,
      callsign: sc.callsign,
      teamId: sc.teamId,
      teamName: sc.teamName,
      teamColour: sc.teamColour,
    })),
    events: eventRows.map((e) => ({
      id: e.id,
      time: e.time,
      eventType: e.eventType,
      description: e.description,
      actorScorecardId: e.actorScorecardId,
      targetScorecardId: e.targetScorecardId,
    })),
    playerStates: stateRows,
  };
}

// ---------------------------------------------------------------------------
// Laserball Replay State Insert (write)
// ---------------------------------------------------------------------------

export async function insertLbGamePlayerStates(
  tx: Tx,
  rows: (typeof lbGamePlayerState.$inferInsert)[],
) {
  if (rows.length === 0) return;
  // Batch in chunks to avoid hitting postgres parameter limits on large games
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(lbGamePlayerState).values(rows.slice(i, i + CHUNK));
  }
}

// ---------------------------------------------------------------------------
// Laserball Leaderboards (read)
// ---------------------------------------------------------------------------

export type LbLeaderboardOptions = {
  /** Count mercenary scorecards. Off by default, as on the SM5 boards. */
  showMercs?: boolean;
  /** Narrow to one player, for their profile. */
  playerId?: string;
  /** Narrow to one center, for its page (applies in every scope, competition included). */
  centerId?: string;
};

function lbLeaderboardConditions(
  scopeFilter: GameScopeFilter,
  options: LbLeaderboardOptions,
): SQL[] {
  // Guests have no profile to rank.
  const conditions = [
    ...gameScopeConditions(scopeFilter),
    sql`${lbScorecard.playerId} IS NOT NULL`,
  ];
  if (!options.showMercs) conditions.push(eq(lbScorecard.isMercenary, false));
  if (options.playerId) conditions.push(eq(lbScorecard.playerId, options.playerId));
  if (options.centerId) conditions.push(eq(game.centerId, options.centerId));
  return conditions;
}

/** The per-game stats a "best single game" board can rank by. */
export type LbGameLeaderboardStat = "goals" | "assists" | "steals" | "blocks" | "clears" | "passes";

const lbGameStatSql: Record<LbGameLeaderboardStat, SQL<number>> = {
  goals: sql<number>`${lbScorecard.goals}`,
  assists: sql<number>`(${lbScorecard.assists1} + ${lbScorecard.assists2})`,
  steals: sql<number>`${lbScorecard.stealsDone}`,
  blocks: sql<number>`${lbScorecard.blocksDone}`,
  clears: sql<number>`${lbScorecard.clearsDone}`,
  passes: sql<number>`${lbScorecard.passesDone}`,
};

export type LbGameLeaderboardRow = {
  scorecardId: string;
  gameSlug: string;
  playerId: string;
  iplId: string;
  callsign: string;
  value: number;
};

/** The 100 best single-game scorecards in scope for one stat (zeroes left out). */
export async function getLbGameLeaderboard(
  scopeFilter: GameScopeFilter,
  stat: LbGameLeaderboardStat,
  options: LbLeaderboardOptions = {},
): Promise<LbGameLeaderboardRow[]> {
  const value = lbGameStatSql[stat];
  const rows = await db
    .select({
      scorecardId: lbScorecard.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      value: sql<number>`${value}::int`,
    })
    .from(lbScorecard)
    .innerJoin(game, eq(game.id, lbScorecard.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(player, eq(player.id, lbScorecard.playerId))
    .where(and(...lbLeaderboardConditions(scopeFilter, options), sql`${value} > 0`))
    .orderBy(desc(value), asc(game.startTime))
    .limit(100);
  return rows;
}

export type LbLeaderboardTotals = {
  playerId: string;
  iplId: string;
  callsign: string;
  gamesPlayed: number;
  timePlayedMs: number;
  goals: number;
  assists: number;
  steals: number;
  blocks: number;
};

/** Every ranked player's totals over the games in scope, one row per player. */
export async function getLbLeaderboardTotals(
  scopeFilter: GameScopeFilter,
  options: LbLeaderboardOptions = {},
): Promise<LbLeaderboardTotals[]> {
  const sc = lbScorecard;
  return db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      gamesPlayed: sql<number>`count(*)::int`,
      timePlayedMs: sql<number>`sum(${sc.timePlayedMs})::float8`,
      goals: sql<number>`sum(${sc.goals})::int`,
      assists: sql<number>`sum(${sc.assists1} + ${sc.assists2})::int`,
      steals: sql<number>`sum(${sc.stealsDone})::int`,
      blocks: sql<number>`sum(${sc.blocksDone})::int`,
    })
    .from(sc)
    .innerJoin(game, eq(game.id, sc.gameId))
    .innerJoin(player, eq(player.id, sc.playerId))
    .where(and(...lbLeaderboardConditions(scopeFilter, options)))
    .groupBy(player.id, player.iplId, player.currentCallsign);
}

export type LbPlayerAverages = {
  playerId: string;
  iplId: string;
  callsign: string;
  gamesPlayed: number;
  wins: number;
  totalGoals: number;
  avgGoals: number;
  avgAssists: number;
  avgSteals: number;
  avgBlocks: number;
  avgClears: number;
  avgPasses: number;
  avgPossessionMs: number;
};

/** Every ranked player's per-game averages over the games in scope, one row per player. */
export async function getLbPlayerAverages(
  scopeFilter: GameScopeFilter,
  options: LbLeaderboardOptions = {},
): Promise<LbPlayerAverages[]> {
  const sc = lbScorecard;
  return db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      gamesPlayed: sql<number>`count(*)::int`,
      wins: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'win'))::int`,
      totalGoals: sql<number>`sum(${sc.goals})::int`,
      avgGoals: sql<number>`avg(${sc.goals})::float8`,
      avgAssists: sql<number>`avg(${sc.assists1} + ${sc.assists2})::float8`,
      avgSteals: sql<number>`avg(${sc.stealsDone})::float8`,
      avgBlocks: sql<number>`avg(${sc.blocksDone})::float8`,
      avgClears: sql<number>`avg(${sc.clearsDone})::float8`,
      avgPasses: sql<number>`avg(${sc.passesDone})::float8`,
      avgPossessionMs: sql<number>`avg(${sc.possessionTimeMs})::float8`,
    })
    .from(sc)
    .innerJoin(lbGameTeam, eq(lbGameTeam.id, sc.teamId))
    .innerJoin(game, eq(game.id, sc.gameId))
    .innerJoin(player, eq(player.id, sc.playerId))
    .where(and(...lbLeaderboardConditions(scopeFilter, options)))
    .groupBy(player.id, player.iplId, player.currentCallsign);
}

export type LbHeadToHeadRow = {
  targetPlayerId: string;
  targetIplId: string;
  targetCallsign: string;
  isSameTeam: boolean;
  games: number;
  /** The main player's results in those games. */
  wins: number;
  losses: number;
  draws: number;
  steals: number;
  stolenBy: number;
  blocks: number;
  blockedBy: number;
  passesTo: number;
  passesFrom: number;
};

/**
 * Every ranked player who shared a game with this one, split by whether they were on the same
 * side, with the record and the steals, blocks and passes between the two.
 */
export async function getLbPlayerHeadToHead(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<LbHeadToHeadRow[]> {
  const mainSc = alias(lbScorecard, "main_sc");
  const tgtSc = alias(lbScorecard, "tgt_sc");
  const fwd = alias(lbGamePlayerInteraction, "fwd");
  const rev = alias(lbGamePlayerInteraction, "rev");
  const tgtPlayer = alias(player, "tgt_player");
  const isSameTeam = sql<boolean>`(${mainSc.teamId} = ${tgtSc.teamId})`;

  return db
    .select({
      targetPlayerId: tgtPlayer.id,
      targetIplId: tgtPlayer.iplId,
      targetCallsign: tgtPlayer.currentCallsign,
      isSameTeam,
      games: sql<number>`count(distinct ${mainSc.gameId})::int`,
      wins: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'win'))::int`,
      losses: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'loss'))::int`,
      draws: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'draw'))::int`,
      steals: sql<number>`coalesce(sum(${fwd.steals}), 0)::int`,
      stolenBy: sql<number>`coalesce(sum(${rev.steals}), 0)::int`,
      blocks: sql<number>`coalesce(sum(${fwd.blocks}), 0)::int`,
      blockedBy: sql<number>`coalesce(sum(${rev.blocks}), 0)::int`,
      passesTo: sql<number>`coalesce(sum(${fwd.passes}), 0)::int`,
      passesFrom: sql<number>`coalesce(sum(${rev.passes}), 0)::int`,
    })
    .from(mainSc)
    .innerJoin(lbGameTeam, eq(lbGameTeam.id, mainSc.teamId))
    .innerJoin(game, eq(game.id, mainSc.gameId))
    .innerJoin(tgtSc, and(eq(tgtSc.gameId, mainSc.gameId), ne(tgtSc.id, mainSc.id)))
    .innerJoin(tgtPlayer, eq(tgtPlayer.id, tgtSc.playerId))
    .leftJoin(fwd, and(eq(fwd.scorecardId, mainSc.id), eq(fwd.targetScorecardId, tgtSc.id)))
    .leftJoin(rev, and(eq(rev.scorecardId, tgtSc.id), eq(rev.targetScorecardId, mainSc.id)))
    .where(
      and(
        eq(mainSc.playerId, playerId),
        ne(tgtPlayer.id, playerId),
        ...gameScopeConditions(scopeFilter),
      ),
    )
    .groupBy(tgtPlayer.id, tgtPlayer.iplId, tgtPlayer.currentCallsign, isSameTeam);
}

// ---------------------------------------------------------------------------
// Laserball Center Stats (read)
// ---------------------------------------------------------------------------

function lbCenterConditions(scopeFilter: GameScopeFilter, centerId?: string): SQL[] {
  const conditions = [eq(game.type, "lb"), ...gameScopeConditions(scopeFilter)];
  if (centerId) conditions.push(eq(game.centerId, centerId));
  return conditions;
}

export type LbCenterSummary = {
  centerId: string;
  centerSlug: string;
  centerName: string;
  games: number;
  /** Distinct ranked players; guests aren't counted. */
  players: number;
  draws: number;
  /** Both teams' goals together. */
  avgGoalsPerGame: number;
  avgDurationMs: number;
};

/** One row per center with Laserball games in scope (or just `centerId`), busiest first. */
export async function getLbCenterSummaries(
  scopeFilter: GameScopeFilter,
  centerId?: string,
): Promise<LbCenterSummary[]> {
  const conditions = lbCenterConditions(scopeFilter, centerId);
  const [gameRows, playerRows] = await Promise.all([
    db
      .select({
        centerId: center.id,
        centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
        centerName: center.name,
        games: sql<number>`count(*)::int`,
        draws: sql<number>`(count(*) filter (where ${game.outcome} = 'draw'))::int`,
        avgGoalsPerGame: sql<number>`avg((
          select coalesce(sum(${lbGameTeam.score}), 0) from ${lbGameTeam}
          where ${lbGameTeam.gameId} = ${game.id} and ${lbGameTeam.isNeutral} = false
        ))::float8`,
        avgDurationMs: sql<number>`avg(${game.actualDuration})::float8`,
      })
      .from(game)
      .innerJoin(center, eq(center.id, game.centerId))
      .where(and(...conditions))
      .groupBy(center.id)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        centerId: game.centerId,
        players: sql<number>`count(distinct ${lbScorecard.playerId})::int`,
      })
      .from(lbScorecard)
      .innerJoin(game, eq(game.id, lbScorecard.gameId))
      .where(and(...conditions))
      .groupBy(game.centerId),
  ]);
  const playersByCenter = new Map(playerRows.map((r) => [r.centerId, r.players]));
  return gameRows.map((r) => ({ ...r, players: playersByCenter.get(r.centerId) ?? 0 }));
}

export type LbColorResults = {
  colourEnum: number;
  wins: number;
  losses: number;
  draws: number;
};

/** Each team colour's results over the Laserball games in scope (or at `centerId`). */
export async function getLbResultsByColor(
  scopeFilter: GameScopeFilter,
  centerId?: string,
): Promise<LbColorResults[]> {
  return db
    .select({
      colourEnum: lbGameTeam.colourEnum,
      wins: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'win'))::int`,
      losses: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'loss'))::int`,
      draws: sql<number>`(count(*) filter (where ${lbGameTeam.result} = 'draw'))::int`,
    })
    .from(lbGameTeam)
    .innerJoin(game, eq(game.id, lbGameTeam.gameId))
    .where(and(eq(lbGameTeam.isNeutral, false), ...lbCenterConditions(scopeFilter, centerId)))
    .groupBy(lbGameTeam.colourEnum)
    .orderBy(asc(lbGameTeam.colourEnum));
}

// ---------------------------------------------------------------------------
// Laserball Momentum (read)
// ---------------------------------------------------------------------------

// The events the momentum chart weighs: goal, steal, block (docs/Laserball_TDF_Spec.md).
const LB_MOMENTUM_EVENT_TYPES = ["1101", "1102", "1103", "1104"];
const LB_GOAL_EVENT_TYPES = new Set(["1101", "1102"]);

/**
 * One Laserball game in the shape the SM5 momentum and score charts take: goals, steals and
 * blocks as momentum events, and each team's running goal total as score events.
 */
export async function getLbGameMomentumData(gameId: string): Promise<GameMomentumData | null> {
  const [gameRow] = await db
    .select({ actualDuration: game.actualDuration })
    .from(game)
    .where(and(eq(game.id, gameId), eq(game.type, "lb")));
  if (!gameRow) return null;

  const actorSc = alias(lbScorecard, "actor_sc");
  const targetSc = alias(lbScorecard, "target_sc");

  const [teamRows, eventRows] = await Promise.all([
    db
      .select({
        teamId: lbGameTeam.id,
        teamName: lbGameTeam.name,
        colourEnum: lbGameTeam.colourEnum,
        score: lbGameTeam.score,
        result: lbGameTeam.result,
      })
      .from(lbGameTeam)
      .where(and(eq(lbGameTeam.gameId, gameId), eq(lbGameTeam.isNeutral, false)))
      .orderBy(asc(lbGameTeam.tdfTeamIndex)),
    db
      .select({
        time: lbGameEvent.time,
        eventType: lbGameEvent.eventType,
        actorTeamId: actorSc.teamId,
        markerLabel: actorSc.callsign,
        targetTeamId: targetSc.teamId,
      })
      .from(lbGameEvent)
      .innerJoin(actorSc, eq(lbGameEvent.actorScorecardId, actorSc.id))
      .leftJoin(targetSc, eq(lbGameEvent.targetScorecardId, targetSc.id))
      .where(
        and(
          eq(lbGameEvent.gameId, gameId),
          inArray(lbGameEvent.eventType, LB_MOMENTUM_EVENT_TYPES),
        ),
      )
      .orderBy(asc(lbGameEvent.time)),
  ]);

  const events: MomentumEvent[] = eventRows.map((e) => ({ ...e, markerPosition: null }));

  const goalsByTeam = new Map<string, number>();
  const scoreEvents: ScoreEvent[] = [];
  for (const e of eventRows) {
    if (!LB_GOAL_EVENT_TYPES.has(e.eventType)) continue;
    const score = (goalsByTeam.get(e.actorTeamId) ?? 0) + 1;
    goalsByTeam.set(e.actorTeamId, score);
    scoreEvents.push({ time: e.time, teamId: e.actorTeamId, score });
  }

  return {
    duration: gameRow.actualDuration,
    teams: teamRows.map((t) => ({
      ...t,
      eliminationBonus: null,
      penaltyScore: null,
      eliminated: null,
    })),
    events,
    scoreEvents,
  };
}
