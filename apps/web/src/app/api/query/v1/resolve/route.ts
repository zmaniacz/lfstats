// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { resolveNames, ResolveRequestSchema } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/resolve — player, center and competition names to ids.
export const POST = queryApiRoute("resolve", ResolveRequestSchema, async (input) => {
  const body = await resolveNames(input);
  const rowCount = Object.values(body.data).reduce((n, list) => n + list.length, 0);
  return { body, rowCount };
});
