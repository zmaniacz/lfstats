// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { CatalogRequestSchema, getQueryCatalog, localToday } from "@lfstats/db/analytics";
import { queryApiRoute } from "@/lib/query-api/handler";

// GET /api/query/v1/catalog — metrics, enum values and limits. See docs/Query_API_Spec.md.
export const GET = queryApiRoute("catalog", CatalogRequestSchema, async () => ({
  body: getQueryCatalog(localToday()),
}));
