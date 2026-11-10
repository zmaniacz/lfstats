// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getRankings, RankingsRequestSchema } from "@lfstats/db/analytics";
import { publicRead, queryParams } from "@/lib/query-api/public";

// GET /api/rankings — the global SM5 player ranking. See docs/API.md.
export function GET(request: Request) {
  const input = { limit: 100, ...queryParams(request, ["limit", "offset"]) };
  return publicRead("rankings", RankingsRequestSchema, input, async (parsed) => {
    const { data, meta } = await getRankings(parsed);
    return {
      data,
      ranked_players: meta.ranked_players ?? 0,
      window_start: meta.window_start ?? null,
      window_end: meta.window_end ?? null,
      computed_at: meta.computed_at ?? null,
      model_version: meta.model_version ?? null,
      truncated: meta.truncated,
    };
  });
}
