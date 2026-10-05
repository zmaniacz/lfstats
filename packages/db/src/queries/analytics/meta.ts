// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, sql } from "drizzle-orm";
import { center, game } from "../../schema";
import type { GameType } from "../../schemas/query-api";
import { getMetric, metricCatalogEntry } from "./metrics";
import { getAnalyticsDb } from "./pool";
import { describeScope, scopeGameConditions, type ResolvedScope } from "./scope";

// The `meta` half of the response envelope (docs/Query_API_Spec.md "Response envelope").
// It exists so the model can state its assumptions: the resolved scope, what each metric
// means, how many rows there were and how fresh the data is.

/**
 * Center-local timestamp as ISO-8601 without a zone suffix. Formatted in SQL: a JS Date
 * would serialize with a misleading `Z` (see root CLAUDE.md, "no UTC conversion").
 */
export function localTimestampSql(column: unknown) {
  return sql<string>`to_char(${column}, 'YYYY-MM-DD"T"HH24:MI:SS')`;
}

export const centerSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`;

/** The public game slug (docs/API.md "Game slugs"). Needs `center` joined to `game`. */
export const gameSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

/** Start time of the newest game in scope, or null if the scope has no games. */
export async function dataAsOf(scope: ResolvedScope): Promise<string | null> {
  const [row] = await getAnalyticsDb()
    .select({ latest: localTimestampSql(sql`max(${game.startTime})`) })
    .from(game)
    .where(and(...scopeGameConditions(scope)));
  return row?.latest ?? null;
}

export function metricDefinitions(gameType: GameType, ids: readonly string[]) {
  return Object.fromEntries(
    ids.map((id) => {
      const { label, definition, unit, higher_is_better, positions } = metricCatalogEntry(
        getMetric(gameType, id, "metrics"),
      );
      return [id, { label, definition, unit, higher_is_better, positions }];
    }),
  );
}

export type ScopedMetaInput = {
  scope: ResolvedScope;
  metricIds: readonly string[];
  rowCount: number;
  truncated: boolean;
  warnings: string[];
  dataAsOf: string | null;
  extra?: Record<string, unknown>;
};

export function scopedMeta(input: ScopedMetaInput): Record<string, unknown> {
  return {
    scope: describeScope(input.scope),
    ...input.extra,
    metrics: metricDefinitions(input.scope.game_type, input.metricIds),
    row_count: input.rowCount,
    truncated: input.truncated,
    warnings: input.warnings,
    data_as_of: input.dataAsOf,
  };
}
