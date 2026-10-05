// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { GameDetailRequestSchema, getGameDetail } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// GET /api/query/v1/games/{slug} — one game with every player's stats.
export const GET = queryApiRoute("game_detail", GameDetailRequestSchema, async (input, ctx) => {
  const body = await getGameDetail(ctx.params.slug ?? "", input);
  return { body, rowCount: body.data.teams.reduce((n, t) => n + t.players.length, 0) };
});
