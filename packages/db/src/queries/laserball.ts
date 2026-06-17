// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import {
  center,
  game,
  lbGameTeam,
  lbScorecard,
  lbGamePlayerInteraction,
  lbGameEvent,
  lbGamePlayerState,
} from "../schema";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Laserball Game List (read)
// ---------------------------------------------------------------------------

export const LB_GAMES_PER_PAGE = 10;

export type LbGameListFilters = {
  scopeFilter?: GameScopeFilter;
  dateSearch?: string;
};

export type LbGameTeamSummary = {
  colourEnum: number;
  score: number | null;
  result: "win" | "loss" | "draw" | null;
};

export type LbGameListItem = {
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: string;
  centerName: string;
  description: string | null;
  teams: LbGameTeamSummary[];
};

function buildLbGameListConditions(filters: LbGameListFilters): SQL[] {
  const conditions: SQL[] = [eq(game.type, "lb")];
  if (filters.scopeFilter) conditions.push(...gameScopeConditions(filters.scopeFilter));
  if (filters.dateSearch) {
    conditions.push(
      sql`to_char(${game.startTime}, 'YYYY-MM-DD') ILIKE ${"%" + filters.dateSearch + "%"}`,
    );
  }
  return conditions;
}

export async function getLbGamesPage(
  page: number,
  filters: LbGameListFilters = {},
): Promise<LbGameListItem[]> {
  const offset = (page - 1) * LB_GAMES_PER_PAGE;
  const conditions = buildLbGameListConditions(filters);

  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(...conditions))
    .orderBy(desc(game.startTime))
    .limit(LB_GAMES_PER_PAGE)
    .offset(offset);

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
    centerName: row.centerName,
    description: row.description,
    teams: teamsByGame.get(row.id) ?? [],
  }));
}

export async function getLbGamesCount(filters: LbGameListFilters = {}): Promise<number> {
  const conditions = buildLbGameListConditions(filters);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(...conditions));
  return row?.count ?? 0;
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
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
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
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
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
  const parts = slug.split("-");
  if (parts.length !== 3) return null;
  const [cc, sc, ts] = parts;
  const countryCode = parseInt(cc!, 10);
  const siteCode = parseInt(sc!, 10);
  if (isNaN(countryCode) || isNaN(siteCode) || !/^\d{14}$/.test(ts!)) return null;

  const [idRow] = await db
    .select({ id: game.id })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.type, "lb"),
        eq(center.countryCode, countryCode),
        eq(center.siteCode, siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${ts}`,
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
