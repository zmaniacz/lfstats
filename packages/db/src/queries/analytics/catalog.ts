// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  DATE_PRESETS,
  GAME_KINDS,
  GAME_TYPES,
  POSITIONS,
  QUERY_LIMITS,
  ROUND_TYPES,
  TEAM_RESULTS,
} from "../../schemas/query-api";
import { getMetricCatalog } from "./metrics";
import { DEFAULT_RATE_LIMIT_PER_DAY, DEFAULT_RATE_LIMIT_PER_MINUTE } from "./rate-limit";

export const QUERY_API_VERSION = "1.0";

/** GET /catalog: everything a client needs to build a valid request. No database access. */
export function getQueryCatalog(today: string) {
  return {
    data: {
      api_version: QUERY_API_VERSION,
      today,
      game_types: GAME_TYPES,
      game_kinds: GAME_KINDS,
      positions: POSITIONS,
      round_types: ROUND_TYPES,
      team_results: TEAM_RESULTS,
      date_presets: DATE_PRESETS,
      metrics: getMetricCatalog(),
      defaults: { min_games: 10, leaderboard_limit: 10 },
      limits: {
        ...QUERY_LIMITS,
        rate_limit_per_minute: DEFAULT_RATE_LIMIT_PER_MINUTE,
        rate_limit_per_day: DEFAULT_RATE_LIMIT_PER_DAY,
      },
    },
  };
}
