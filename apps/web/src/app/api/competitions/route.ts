// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { listDirectory, ListRequestSchema } from "@lfstats/db/analytics";
import { publicRead, queryParams } from "@/lib/query-api/public";

// GET /api/competitions — every competition, newest first. See docs/API.md.
export function GET(request: Request) {
  const input = { limit: 200, ...queryParams(request, ["year", "limit"]), what: "competitions" };
  return publicRead("competitions", ListRequestSchema, input, async (parsed) => {
    const { data, meta } = await listDirectory(parsed);
    return { data, truncated: meta.truncated };
  });
}
