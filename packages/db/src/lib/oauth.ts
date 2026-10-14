// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { createHash, timingSafeEqual } from "node:crypto";

// Pure OAuth helpers for the MCP authorization server (docs/Query_API_Spec.md "OAuth").
// No database access, so they are unit-tested directly.

/** The only scope an OAuth token can carry. Read access is all a signed-in user gets. */
export const OAUTH_SCOPES = ["query:read"] as const;
export type OAuthScope = (typeof OAUTH_SCOPES)[number];

export const TOKEN_ENDPOINT_AUTH_METHODS = [
  "none",
  "client_secret_post",
  "client_secret_basic",
] as const;
export type TokenEndpointAuthMethod = (typeof TOKEN_ENDPOINT_AUTH_METHODS)[number];

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

// RFC 7636 §4.1: 43–128 characters from the unreserved set.
const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
// base64url of a SHA-256 digest is always 43 characters.
const S256_CHALLENGE_RE = /^[A-Za-z0-9\-_]{43}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return S256_CHALLENGE_RE.test(challenge);
}

/** RFC 7636 S256: BASE64URL(SHA256(code_verifier)) must equal the stored challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!CODE_VERIFIER_RE.test(codeVerifier)) return false;
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  return safeEqual(computed, codeChallenge);
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Schemes that would run code or read local data if a browser followed them.
// "localhost:" is what `new URL("localhost:3000/cb")` parses a scheme-less URI as.
const FORBIDDEN_SCHEMES = new Set([
  "javascript:",
  "data:",
  "file:",
  "vbscript:",
  "about:",
  "blob:",
  "localhost:",
]);

/**
 * Whether a client may register this redirect URI. Allowed: https, http on a loopback
 * host (native apps, RFC 8252 §7.3), and private-use schemes such as `cursor://…`
 * (RFC 8252 §7.1). Never a fragment, never plain http to a remote host.
 */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash !== "" || uri.includes("#")) return false;
  if (url.protocol === "https:") return url.hostname !== "";
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  if (FORBIDDEN_SCHEMES.has(url.protocol)) return false;
  // Private-use scheme. A single letter is a Windows drive ("c:\…"), not a scheme.
  return /^[a-z][a-z0-9+.-]+:$/.test(url.protocol);
}

/**
 * Parses a space-delimited `scope` parameter. Absent or empty → every supported scope.
 * Returns null if any requested scope is unknown (the `invalid_scope` error).
 */
export function parseScopes(scope: string | null | undefined): OAuthScope[] | null {
  const requested = (scope ?? "").split(" ").filter((s) => s !== "");
  if (requested.length === 0) return [...OAUTH_SCOPES];
  const known = new Set<string>(OAUTH_SCOPES);
  if (!requested.every((s) => known.has(s))) return null;
  return [...new Set(requested)] as OAuthScope[];
}

/**
 * RFC 8707 resource indicators are compared after dropping a trailing slash, so
 * `https://lfstats.com/mcp/` and `https://lfstats.com/mcp` name the same resource.
 */
export function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, "") === b.replace(/\/+$/, "");
}
