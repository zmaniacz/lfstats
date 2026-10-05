// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { localToday, searchGames, SearchGamesRequestSchema } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/search_games — find games; compact summaries with keyset paging.
export const POST = queryApiRoute("search_games", SearchGamesRequestSchema, async (input) => {
  const body = await searchGames(input, localToday());
  return { body, rowCount: body.data.length };
});
