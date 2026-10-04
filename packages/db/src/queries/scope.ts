// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { eq, isNull, isNotNull, sql, SQL } from "drizzle-orm";
import { game } from "../schema";
import type { CompetitionFormat } from "./admin";

/**
 * Describes which slice of games a query should cover:
 * - social: games with no competition (optionally a single center and/or date range)
 * - competition: games attached to a competition (optionally a single one)
 * - all: every game, social and competition alike (optionally a single center and/or date range)
 *
 * dateFrom/dateTo only exist on the social/all variants — competitions have their own
 * round/match structure and never get date-range filtering.
 *
 * `format` is optional and only meaningful alongside a specific `competitionId`. It does
 * not affect gameScopeConditions() — which already reads game.competition_id directly —
 * but the leaderboard helpers in competition-tournament.ts select competition games via
 * the match/round structure, and only a `team` competition has matches. Omitting it
 * therefore keeps the existing team-shaped behaviour.
 *
 * This is the single source of truth for the social/competition SQL split.
 * Pass the result of gameScopeConditions() into a query's `and(...)` where clause.
 */
export type GameScopeFilter =
  | { scope: "all"; centerId?: string; dateFrom?: string; dateTo?: string }
  | { scope: "social"; centerId?: string; dateFrom?: string; dateTo?: string }
  | { scope: "competition"; competitionId?: string; format?: CompetitionFormat };

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

export type GameScopeOptions = {
  /**
   * Keep `game.exclude = true` rows. Only for game *lists*, where excluded games stay
   * visible (they are stored, replayable and badged on the game page). Never set this
   * for an aggregate, average, count or leaderboard — see docs/Competition_Structure.md
   * "Routing precedence": an excluded game is removed from every aggregate.
   */
  includeExcluded?: boolean;
};

/**
 * WHERE conditions for a scope. Always includes `game.exclude = false` unless
 * `includeExcluded` is set, so every scoped aggregate drops excluded games by default.
 * `filter` may be omitted (no scope narrowing) and still yields the exclude condition.
 */
export function gameScopeConditions(
  filter: GameScopeFilter | undefined,
  options: GameScopeOptions = {},
): SQL[] {
  const conditions: SQL[] = [];
  if (!options.includeExcluded) {
    conditions.push(eq(game.exclude, false));
  }
  if (!filter) return conditions;
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
