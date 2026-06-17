// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Laserball Game List (read)
// ---------------------------------------------------------------------------

export const LB_GAMES_PER_PAGE = 10;

export type LbGameListFilters = {
  centerId?: string;
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
  if (filters.centerId) conditions.push(eq(game.centerId, filters.centerId));
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
