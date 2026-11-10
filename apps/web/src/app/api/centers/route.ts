// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { listDirectory, ListRequestSchema } from "@lfstats/db/analytics";
import { publicRead } from "@/lib/query-api/public";

// GET /api/centers — every center with its game counts. See docs/API.md.
export function GET() {
  return publicRead(
    "centers",
    ListRequestSchema,
    { what: "centers", limit: 200 },
    async (input) => ({
      data: (await listDirectory(input)).data,
    }),
  );
}
