// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import type { z } from "zod";
import { authenticateApiKey, logApiRequest, type AuthenticatedApiKey } from "@lfstats/db";
import {
  fromZodError,
  mapDatabaseError,
  QueryApiError,
  RateLimiter,
  rateLimitsFor,
  withAnalyticsSlot,
} from "@lfstats/db/analytics";

// Shared request pipeline for every /api/query/v1 route and, later, the /mcp endpoint
// (docs/Query_API_Spec.md): API key → scope check → rate limit → body validation →
// concurrency slot → handler → request log. Routes only supply a schema and a handler.

const globalForLimiter = globalThis as typeof globalThis & { _queryRateLimiter?: RateLimiter };
const rateLimiter = (globalForLimiter._queryRateLimiter ??= new RateLimiter());

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function authenticateQueryKey(request: Request): Promise<AuthenticatedApiKey> {
  const token = bearerToken(request);
  if (!token) {
    throw new QueryApiError("missing_api_key", "An API key is required.", {
      hint: "Send `Authorization: Bearer lfs_…` with a key that has the query:read permission.",
    });
  }
  const key = await authenticateApiKey(token);
  if (!key) {
    throw new QueryApiError("invalid_api_key", "The API key is unknown or has been revoked.");
  }
  if (!key.scopes.includes("query:read")) {
    throw new QueryApiError(
      "insufficient_scope",
      "This API key does not have the query:read permission.",
    );
  }
  return key;
}

function enforceRateLimit(key: AuthenticatedApiKey): void {
  const limit = rateLimiter.check(key.id, rateLimitsFor(key));
  if (!limit.ok) {
    throw new QueryApiError("rate_limited", "Rate limit exceeded for this API key.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }
}

/**
 * Authenticates a query API request and applies its rate limit. Throws QueryApiError.
 * Exported so the MCP transport can reuse it without the JSON envelope.
 */
export async function authorizeQueryRequest(request: Request): Promise<AuthenticatedApiKey> {
  const key = await authenticateQueryKey(request);
  enforceRateLimit(key);
  return key;
}

export type QueryHandlerResult = {
  body: { data: unknown; meta?: Record<string, unknown> };
  /** Rows returned, for the request log. */
  rowCount?: number;
};

export type QueryHandlerContext = { key: AuthenticatedApiKey; request: Request };

function errorResponse(err: QueryApiError): NextResponse {
  const headers: Record<string, string> = {};
  if (err.retryAfterSeconds !== undefined) headers["Retry-After"] = String(err.retryAfterSeconds);
  return NextResponse.json({ error: err.toBody() }, { status: err.status, headers });
}

async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET") return {};
  const text = await request.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new QueryApiError("invalid_request", "The request body is not valid JSON.");
  }
}

/**
 * Builds a route handler. Errors become the documented `{ error: {...} }` body; database
 * error text is logged server-side and never returned.
 */
export function queryApiRoute<S extends z.ZodType>(
  endpoint: string,
  schema: S,
  handler: (input: z.infer<S>, ctx: QueryHandlerContext) => Promise<QueryHandlerResult>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const started = performance.now();
    let key: AuthenticatedApiKey | null = null;
    let status = 200;
    let errorCode: string | null = null;
    let rowCount: number | undefined;

    try {
      key = await authenticateQueryKey(request);
      // After `key` is set, so rate-limited requests are logged against their key.
      enforceRateLimit(key);

      const parsed = schema.safeParse(await readBody(request));
      if (!parsed.success) throw fromZodError(parsed.error);

      const authorizedKey = key;
      const result = await withAnalyticsSlot(() =>
        handler(parsed.data, { key: authorizedKey, request }),
      );
      rowCount = result.rowCount;
      return NextResponse.json(result.body);
    } catch (err) {
      const apiError = mapDatabaseError(err);
      if (!apiError) console.error(`[query-api] ${endpoint} failed`, err);
      const response = errorResponse(
        apiError ?? new QueryApiError("invalid_request", "The query could not be completed."),
      );
      status = response.status;
      errorCode = apiError?.code ?? "internal_error";
      return response;
    } finally {
      // Unauthenticated requests have no key to attribute, so they are not logged.
      if (key) {
        logApiRequest({
          apiKeyId: key.id,
          endpoint,
          status,
          durationMs: Math.round(performance.now() - started),
          rowCount,
          errorCode,
        }).catch((err) => console.error("[query-api] request log failed", err));
      }
    }
  };
}
