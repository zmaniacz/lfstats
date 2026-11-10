// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { listDirectory, ListRequestSchema } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// POST /api/query/v1/list — every center, competition or game tag.
export const POST = queryApiRoute("list", ListRequestSchema, async (input) => {
  const body = await listDirectory(input);
  return { body, rowCount: body.data.length };
});
