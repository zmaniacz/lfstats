// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import type { z } from "zod";
import { fromZodError, mapDatabaseError, QueryApiError } from "@lfstats/db/analytics";

// Public, unauthenticated GET routes that reuse the query API's read functions
// (docs/API.md). They follow the public API's conventions, not the query API's: no key, no
// rate limit, a plain `{ "error": "..." }` body. Only fixed-shape, bounded reads belong
// here; open-ended aggregates stay behind a key in /api/query/v1.

/** Query-string values as a plain object, with the named fields read as integers. */
export function queryParams(request: Request, integers: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    out[key] = integers.includes(key) && /^-?\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

/** Validates `input` and runs `read`, turning query API errors into public API errors. */
export async function publicRead<S extends z.ZodType>(
  name: string,
  schema: S,
  input: unknown,
  read: (input: z.infer<S>) => Promise<unknown>,
): Promise<NextResponse> {
  try {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw fromZodError(parsed.error);
    return NextResponse.json(await read(parsed.data));
  } catch (err) {
    const apiError = mapDatabaseError(err);
    if (!apiError) {
      console.error(`[api] ${name} failed`, err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
    // A missing resource reads as the public API's usual 404.
    const status = apiError instanceof QueryApiError ? apiError.status : 500;
    const message = apiError.hint ? `${apiError.message} ${apiError.hint}` : apiError.message;
    return NextResponse.json({ error: message }, { status });
  }
}
