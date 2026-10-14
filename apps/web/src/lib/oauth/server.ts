// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { headers } from "next/headers";
import {
  getOAuthClient,
  isValidCodeChallenge,
  OAUTH_SCOPES,
  parseScopes,
  sameResource,
  type OAuthClient,
  type OAuthScope,
} from "@lfstats/db";

// The LFstats OAuth 2.1 authorization server for /mcp (docs/Query_API_Spec.md "OAuth").
// LFstats issues its own tokens; Google is only how the user proves who they are, through
// the site's existing Auth.js sign-in. Anyone with an LFstats account gets query:read.

/**
 * The public origin: the issuer, and the base of every metadata URL. AUTH_URL is set in
 * production (the app runs behind a reverse proxy); dev falls back to the Host header.
 */
export async function siteOrigin(): Promise<string> {
  if (process.env.AUTH_URL) return new URL(process.env.AUTH_URL).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

/** The RFC 8707 resource identifier tokens are bound to. */
export function mcpResourceUrl(origin: string): string {
  return `${origin}/mcp`;
}

export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

// Metadata, registration, token and revocation are called from browser-based MCP clients
// too, so they answer cross-origin requests. None of them use cookies.
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** JSON response for the OAuth endpoints: CORS, and never cached (RFC 6749 §5.1). */
export function oauthJson(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store", Pragma: "no-cache", ...extraHeaders },
  });
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
): Response {
  return oauthJson({ error, error_description: description }, status, extraHeaders);
}

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  scopes: OAuthScope[];
  resource: string;
  state: string | null;
};

export type AuthorizeValidation =
  | { kind: "ok"; request: AuthorizeRequest }
  // The client or redirect URI cannot be trusted, so the error is shown here rather than
  // sent anywhere (RFC 6749 §4.1.2.1).
  | { kind: "fatal"; message: string }
  // Everything else goes back to the client's redirect URI.
  | { kind: "redirect"; url: string };

export function authorizationRedirect(
  redirectUri: string,
  params: Record<string, string | null>,
  issuer: string,
): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  // RFC 9207: lets the client confirm which server answered.
  url.searchParams.set("iss", issuer);
  return url.toString();
}

/**
 * Validates an authorization request. Used by both the consent page and the decision
 * endpoint, since the decision POST is independently callable and must not trust the page.
 */
export async function validateAuthorizeRequest(
  params: URLSearchParams,
  origin: string,
): Promise<AuthorizeValidation> {
  const clientId = params.get("client_id");
  if (!clientId) return { kind: "fatal", message: "The request is missing client_id." };
  const client = await getOAuthClient(clientId);
  if (!client) {
    return {
      kind: "fatal",
      message: "This app is not registered with LFstats. Try reconnecting it from the app.",
    };
  }

  let redirectUri = params.get("redirect_uri");
  if (!redirectUri && client.redirectUris.length === 1) redirectUri = client.redirectUris[0]!;
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { kind: "fatal", message: "The app sent a redirect URI it did not register." };
  }

  const state = params.get("state");
  const fail = (error: string, description: string): AuthorizeValidation => ({
    kind: "redirect",
    url: authorizationRedirect(
      redirectUri,
      { error, error_description: description, state },
      origin,
    ),
  });

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge || params.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  if (!isValidCodeChallenge(codeChallenge)) {
    return fail("invalid_request", "code_challenge is not a valid S256 challenge.");
  }
  const scopes = parseScopes(params.get("scope"));
  if (!scopes) {
    return fail("invalid_scope", `Supported scopes: ${OAUTH_SCOPES.join(" ")}.`);
  }
  const resource = mcpResourceUrl(origin);
  const requestedResource = params.get("resource");
  if (requestedResource !== null && !sameResource(requestedResource, resource)) {
    return fail("invalid_target", `The only resource is ${resource}.`);
  }

  return { kind: "ok", request: { client, redirectUri, codeChallenge, scopes, resource, state } };
}
