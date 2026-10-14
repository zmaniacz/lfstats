// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import type { z } from "zod";
import {
  authenticateApiKey,
  authenticateOAuthAccessToken,
  logApiRequest,
  OAUTH_ACCESS_TOKEN_PREFIX,
  sameResource,
  type ApiRequestPrincipal,
  type AuthenticatedApiKey,
} from "@lfstats/db";
import {
  fromZodError,
  mapDatabaseError,
  QueryApiError,
  RateLimiter,
  rateLimitsFor,
  withAnalyticsSlot,
} from "@lfstats/db/analytics";
import { mcpResourceUrl, siteOrigin } from "@/lib/oauth/server";

// Shared request pipeline for every /api/query/v1 route and the /mcp endpoint
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

/** Who an authorized /mcp request runs as: an API key, or a user via an OAuth client. */
export type McpPrincipal = { label: string; log: ApiRequestPrincipal };

/**
 * Authenticates an /mcp request and applies its rate limit. Throws QueryApiError.
 *
 * /mcp accepts an `lfs_` API key, exactly like /api/query/v1, or an OAuth access token
 * (docs/Query_API_Spec.md "OAuth"). OAuth tokens are bound to the /mcp resource, so they
 * are deliberately not accepted by the HTTP query routes.
 */
export async function authorizeMcpRequest(request: Request): Promise<McpPrincipal> {
  const token = bearerToken(request);
  if (!token?.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)) {
    const key = await authenticateQueryKey(request);
    enforceRateLimit(key);
    return { label: `api_key:${key.id}`, log: { apiKeyId: key.id } };
  }

  const grant = await authenticateOAuthAccessToken(token);
  if (!grant) {
    throw new QueryApiError("invalid_api_key", "The access token is invalid, expired or revoked.");
  }
  if (!sameResource(grant.resource, mcpResourceUrl(await siteOrigin()))) {
    throw new QueryApiError("invalid_api_key", "The access token was not issued for this server.");
  }
  if (!grant.scopes.includes("query:read")) {
    throw new QueryApiError(
      "insufficient_scope",
      "This access token does not have the query:read scope.",
    );
  }
  // One bucket per user, whichever client they connect with, at the default limits.
  const bucket = `user:${grant.userId}`;
  const limit = rateLimiter.check(
    bucket,
    rateLimitsFor({ rateLimitPerMinute: null, rateLimitPerDay: null }),
  );
  if (!limit.ok) {
    throw new QueryApiError("rate_limited", "Rate limit exceeded for this account.", {
      retryAfterSeconds: limit.retryAfterSeconds,
    });
  }
  return { label: bucket, log: { userId: grant.userId, oauthClientId: grant.clientId } };
}

export type QueryHandlerResult = {
  body: { data: unknown; meta?: Record<string, unknown> };
  /** Rows returned, for the request log. */
  rowCount?: number;
};

export type QueryHandlerContext = {
  key: AuthenticatedApiKey;
  request: Request;
  /** Dynamic route segments, e.g. `{ slug }` for games/[slug]. */
  params: Record<string, string>;
};

type RouteContext = { params?: Promise<Record<string, string | string[]>> };

function errorResponse(err: QueryApiError): NextResponse {
  const headers: Record<string, string> = {};
  if (err.retryAfterSeconds !== undefined) headers["Retry-After"] = String(err.retryAfterSeconds);
  return NextResponse.json({ error: err.toBody() }, { status: err.status, headers });
}

/** POST: the JSON body. GET: the query string, as an object of strings. */
async function readBody(request: Request): Promise<unknown> {
  if (request.method === "GET") return Object.fromEntries(new URL(request.url).searchParams);
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
): (request: Request, context?: RouteContext) => Promise<NextResponse> {
  return async (request: Request, context?: RouteContext) => {
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

      const rawParams = (await context?.params) ?? {};
      const params = Object.fromEntries(
        Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]),
      );
      const authorizedKey = key;
      const result = await withAnalyticsSlot(() =>
        handler(parsed.data, { key: authorizedKey, request, params }),
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
