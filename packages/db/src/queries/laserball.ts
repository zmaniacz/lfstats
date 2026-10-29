// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
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
import { gameScopeConditions, type GameScopeFilter } from "./scope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// True when the game is an overtime half (3, 4, ...) of a linked match.
const overtimeHalfSql = sql<boolean>`exists (select 1 from lb_match_game where lb_match_game.game_id = ${game.id} and lb_match_game.half > 2)`;

// ---------------------------------------------------------------------------
// Laserball Game List (read)
// ---------------------------------------------------------------------------

export type LbGameListFilters = {
  scopeFilter?: GameScopeFilter;
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
