// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getPlayerStats, localToday, PlayerStatsRequestSchema } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/player_stats — 1–10 players over one scope, with breakdowns,
// baseline, rating and head-to-head.
export const POST = queryApiRoute("player_stats", PlayerStatsRequestSchema, async (input) => {
  const body = await getPlayerStats(input, localToday());
  return { body, rowCount: body.data.players.length };
});
