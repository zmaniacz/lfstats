// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { HIGHLIGHT_CATEGORIES } from "../../lib/highlights/detectors";
import {
  COMPETITION_CATEGORIES,
  COMPETITION_STATES,
  COMPETITION_TYPES,
  DATE_PRESETS,
  GAME_KINDS,
  GAME_TYPES,
  LIST_KINDS,
  LIST_LIMITS,
  PENALTY_LIMITS,
  POSITIONS,
  QUERY_LIMITS,
  RANKINGS_LIMITS,
  ROUND_TYPES,
  TEAM_RESULTS,
} from "../../schemas/query-api";
import { HIGHLIGHT_MEANINGS } from "./games";
import { getMetricCatalog } from "./metrics";
import { DEFAULT_RATE_LIMIT_PER_DAY, DEFAULT_RATE_LIMIT_PER_MINUTE } from "./rate-limit";

export const QUERY_API_VERSION = "1.1";

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
      list_kinds: LIST_KINDS,
      competition_categories: COMPETITION_CATEGORIES,
      competition_states: COMPETITION_STATES,
      competition_types: COMPETITION_TYPES,
      // SM5 highlight types, for search_games.highlights and game_detail.include_highlights.
      highlight_categories: HIGHLIGHT_CATEGORIES.map((id) => ({
        id,
        meaning: HIGHLIGHT_MEANINGS[id].name,
        magnitude: HIGHLIGHT_MEANINGS[id].magnitude,
      })),
      metrics: getMetricCatalog(),
      defaults: { min_games: 10, leaderboard_limit: 10 },
      limits: {
        ...QUERY_LIMITS,
        rankings_max_limit: RANKINGS_LIMITS.max_limit,
        list_max_limit: LIST_LIMITS.max_limit,
        penalties_max_limit: PENALTY_LIMITS.max_limit,
        rate_limit_per_minute: DEFAULT_RATE_LIMIT_PER_MINUTE,
        rate_limit_per_day: DEFAULT_RATE_LIMIT_PER_DAY,
      },
    },
  };
}
