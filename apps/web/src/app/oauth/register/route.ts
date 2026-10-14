// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { z } from "zod";
import {
  isAllowedRedirectUri,
  registerOAuthClient,
  TOKEN_ENDPOINT_AUTH_METHODS,
} from "@lfstats/db";
import { RateLimiter } from "@lfstats/db/analytics";
import { corsPreflight, oauthError, oauthJson } from "@/lib/oauth/server";

// RFC 7591 Dynamic Client Registration. Open, as MCP clients (Claude, ChatGPT, VS Code,
// Cursor…) register themselves on first connect. Registering grants nothing: a client
// still needs a signed-in user to approve it on the consent page.

const globalForLimiter = globalThis as typeof globalThis & { _oauthRegisterLimiter?: RateLimiter };
const limiter = (globalForLimiter._oauthRegisterLimiter ??= new RateLimiter());
const REGISTER_LIMITS = { perMinute: 10, perDay: 100 };

const registrationSchema = z.object({
  redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
  client_name: z.string().max(200).optional(),
  client_uri: z.string().max(2000).optional(),
  // RFC 7591 §2: the default is client_secret_basic.
  token_endpoint_auth_method: z.enum(TOKEN_ENDPOINT_AUTH_METHODS).default("client_secret_basic"),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  scope: z.string().optional(),
});

const GRANT_TYPES = ["authorization_code", "refresh_token"];

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: Request): Promise<Response> {
  const limit = limiter.check(clientIp(request), REGISTER_LIMITS);
  if (!limit.ok) {
    return oauthError("slow_down", "Too many client registrations.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "The request body is not valid JSON.");
  }
  // Clients send plenty of other metadata (logo_uri, contacts…); unknown fields are ignored.
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return oauthError(
      "invalid_client_metadata",
      parsed.error.issues[0]?.message ?? "Invalid metadata.",
    );
  }
  const meta = parsed.data;

  const badUri = meta.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (badUri !== undefined) {
    return oauthError(
      "invalid_redirect_uri",
      `Redirect URIs must be https, http on localhost, or an app scheme: ${badUri}`,
    );
  }
  if (meta.grant_types && !meta.grant_types.every((g) => GRANT_TYPES.includes(g))) {
    return oauthError(
      "invalid_client_metadata",
      `Supported grant_types: ${GRANT_TYPES.join(", ")}.`,
    );
  }
  if (meta.response_types && !meta.response_types.every((r) => r === "code")) {
    return oauthError("invalid_client_metadata", "The only supported response_type is code.");
  }

  const { client, clientSecret } = await registerOAuthClient({
    clientName: meta.client_name ?? null,
    clientUri: meta.client_uri ?? null,
    redirectUris: meta.redirect_uris,
    tokenEndpointAuthMethod: meta.token_endpoint_auth_method,
  });

  return oauthJson(
    {
      client_id: client.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(clientSecret !== null && { client_secret: clientSecret, client_secret_expires_at: 0 }),
      ...(client.clientName !== null && { client_name: client.clientName }),
      ...(client.clientUri !== null && { client_uri: client.clientUri }),
      redirect_uris: client.redirectUris,
      grant_types: GRANT_TYPES,
      response_types: ["code"],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    },
    201,
  );
}

export const OPTIONS = corsPreflight;
