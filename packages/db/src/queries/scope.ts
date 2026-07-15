// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { eq, isNull, isNotNull, sql, SQL } from "drizzle-orm";
import { game } from "../schema";

/**
 * Describes which slice of games a query should cover:
 * - social: games with no competition (optionally a single center and/or date range)
 * - competition: games attached to a competition (optionally a single one)
 * - all: every game, social and competition alike (optionally a single center and/or date range)
 *
 * dateFrom/dateTo only exist on the social/all variants — competitions have their own
 * round/match structure and never get date-range filtering.
 *
 * This is the single source of truth for the social/competition SQL split.
 * Pass the result of gameScopeConditions() into a query's `and(...)` where clause.
 */
export type GameScopeFilter =
  | { scope: "all"; centerId?: string; dateFrom?: string; dateTo?: string }
  | { scope: "social"; centerId?: string; dateFrom?: string; dateTo?: string }
  | { scope: "competition"; competitionId?: string };

function dateRangeConditions(filter: { dateFrom?: string; dateTo?: string }): SQL[] {
  const conditions: SQL[] = [];
  if (filter.dateFrom) {
    conditions.push(sql`${game.startTime} >= ${filter.dateFrom}::date`);
  }
  if (filter.dateTo) {
    conditions.push(sql`${game.startTime} < (${filter.dateTo}::date + interval '1 day')`);
  }
  return conditions;
}

export function gameScopeConditions(filter: GameScopeFilter): SQL[] {
  const conditions: SQL[] = [];
  switch (filter.scope) {
    case "social":
      conditions.push(isNull(game.competitionId));
      if (filter.centerId) {
        conditions.push(eq(game.centerId, filter.centerId));
      }
      conditions.push(...dateRangeConditions(filter));
      break;
    case "competition":
      conditions.push(isNotNull(game.competitionId));
      if (filter.competitionId) {
        conditions.push(eq(game.competitionId, filter.competitionId));
      }
      break;
    case "all":
      if (filter.centerId) {
        conditions.push(eq(game.centerId, filter.centerId));
      }
      conditions.push(...dateRangeConditions(filter));
      break;
  }
  return conditions;
}
