// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { CompetitionRequestSchema, getCompetitionDetail } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// GET /api/query/v1/competitions/{slug} — one competition with its standings.
export const GET = queryApiRoute("competition", CompetitionRequestSchema, async (input, ctx) => {
  const body = await getCompetitionDetail(ctx.params.slug ?? "", input);
  return { body, rowCount: body.data.standings.length };
});
