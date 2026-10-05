// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getLeaderboard, LeaderboardRequestSchema, localToday } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/leaderboard — rank players by one metric within a scope.
export const POST = queryApiRoute("leaderboard", LeaderboardRequestSchema, async (input) => {
  const body = await getLeaderboard(input, localToday());
  return { body, rowCount: body.data.length };
});
