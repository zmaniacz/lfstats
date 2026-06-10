// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { eq, isNull, isNotNull, SQL } from "drizzle-orm";
import { game } from "../schema";

/**
 * Describes which slice of games a query should cover:
 * - social: games with no competition (optionally a single center)
 * - competition: games attached to a competition (optionally a single one)
 * - all: every game, social and competition alike
 *
 * This is the single source of truth for the social/competition SQL split.
 * Pass the result of gameScopeConditions() into a query's `and(...)` where clause.
 */
export type GameScopeFilter =
  | { scope: "all" }
  | { scope: "social"; centerId?: string }
  | { scope: "competition"; competitionId?: string };

export function gameScopeConditions(filter: GameScopeFilter): SQL[] {
  const conditions: SQL[] = [];
  switch (filter.scope) {
    case "social":
      conditions.push(isNull(game.competitionId));
      if (filter.centerId) {
        conditions.push(eq(game.centerId, filter.centerId));
      }
      break;
    case "competition":
      conditions.push(isNotNull(game.competitionId));
      if (filter.competitionId) {
        conditions.push(eq(game.competitionId, filter.competitionId));
      }
      break;
    case "all":
      // No constraints — every game qualifies.
      break;
  }
  return conditions;
}
