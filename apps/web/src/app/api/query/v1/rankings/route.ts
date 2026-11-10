// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getRankings, RankingsRequestSchema } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/rankings — the global SM5 player ranking.
export const POST = queryApiRoute("rankings", RankingsRequestSchema, async (input) => {
  const body = await getRankings(input);
  return { body, rowCount: body.data.length };
});
