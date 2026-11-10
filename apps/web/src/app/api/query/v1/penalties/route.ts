// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { localToday, PenaltiesRequestSchema, searchPenalties } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/penalties — SM5 player penalties across games.
export const POST = queryApiRoute("penalties", PenaltiesRequestSchema, async (input) => {
  const body = await searchPenalties(input, localToday());
  return { body, rowCount: body.data.length };
});
