// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../client";
import { safeEqual, sha256Hex, type OAuthScope, type TokenEndpointAuthMethod } from "../lib/oauth";
import { authUser, oauthAuthorizationCode, oauthClient, oauthToken } from "../schema";

// Storage for the MCP OAuth authorization server (docs/Query_API_Spec.md "OAuth").
// Like apiKeys.ts, every secret is generated here and stored only as a SHA-256 hash;
// callers pass plaintext in and never see a hash.

// Prefixes make a leaked token recognisable, and let /mcp tell an OAuth access token
// from an `lfs_` API key without a database lookup.
export const OAUTH_ACCESS_TOKEN_PREFIX = "lfo_at_";
const REFRESH_TOKEN_PREFIX = "lfo_rt_";
const CODE_PREFIX = "lfo_ac_";
const CLIENT_SECRET_PREFIX = "lfo_cs_";

export const OAUTH_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 86_400_000;
const CODE_TTL_MS = 10 * 60_000;

function newSecret(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OAuthClient = {
  id: string;
  clientName: string | null;
  clientUri: string | null;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
};

export async function registerOAuthClient(input: {
  clientName: string | null;
  clientUri: string | null;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
}): Promise<{ client: OAuthClient; clientSecret: string | null }> {
  const clientSecret =
    input.tokenEndpointAuthMethod === "none" ? null : newSecret(CLIENT_SECRET_PREFIX);
  const [row] = await db
    .insert(oauthClient)
    .values({ ...input, clientSecretHash: clientSecret ? sha256Hex(clientSecret) : null })
    .returning({ id: oauthClient.id });
  return { client: { ...input, id: row!.id }, clientSecret };
}

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  // client_id comes straight off the wire; a non-UUID would be a Postgres cast error.
  if (!UUID_RE.test(clientId)) return null;
  const [row] = await db
    .select({
      id: oauthClient.id,
      clientName: oauthClient.clientName,
      clientUri: oauthClient.clientUri,
      redirectUris: oauthClient.redirectUris,
      tokenEndpointAuthMethod: oauthClient.tokenEndpointAuthMethod,
    })
    .from(oauthClient)
    .where(eq(oauthClient.id, clientId));
  return row
    ? { ...row, tokenEndpointAuthMethod: row.tokenEndpointAuthMethod as TokenEndpointAuthMethod }
    : null;
}

/**
 * Authenticates a client at the token and revocation endpoints. Public clients (`none`)
 * must not send a secret; confidential clients must send the right one.
 */
export async function authenticateOAuthClient(
  clientId: string,
  clientSecret: string | null,
): Promise<OAuthClient | null> {
  if (!UUID_RE.test(clientId)) return null;
  const [row] = await db.select().from(oauthClient).where(eq(oauthClient.id, clientId));
  if (!row) return null;
  if (row.clientSecretHash === null) {
    if (clientSecret !== null) return null;
  } else if (clientSecret === null || !safeEqual(sha256Hex(clientSecret), row.clientSecretHash)) {
    return null;
  }
  return {
    id: row.id,
    clientName: row.clientName,
    clientUri: row.clientUri,
    redirectUris: row.redirectUris,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod as TokenEndpointAuthMethod,
  };
}

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: OAuthScope[];
  resource: string;
}): Promise<string> {
  const code = newSecret(CODE_PREFIX);
  await db.insert(oauthAuthorizationCode).values({
    ...input,
    codeHash: sha256Hex(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  // Opportunistic cleanup; codes are short-lived and there is no scheduler.
  await db.delete(oauthAuthorizationCode).where(lt(oauthAuthorizationCode.expiresAt, new Date()));
  return code;
}

export type RedeemedAuthorizationCode = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: OAuthScope[];
  resource: string;
};

/**
 * Consumes a code. The DELETE … RETURNING makes redemption atomic, so a code can be
 * exchanged at most once even under concurrent requests. Expired codes return null.
 */
export async function redeemAuthorizationCode(
  code: string,
): Promise<RedeemedAuthorizationCode | null> {
  const [row] = await db
    .delete(oauthAuthorizationCode)
    .where(eq(oauthAuthorizationCode.codeHash, sha256Hex(code)))
    .returning();
  if (!row || row.expiresAt < new Date()) return null;
  return {
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    scopes: row.scopes as OAuthScope[],
    resource: row.resource,
  };
}

export type IssuedOAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: OAuthScope[];
};

export async function issueOAuthTokens(input: {
  clientId: string;
  userId: string;
  scopes: OAuthScope[];
  resource: string;
  familyId?: string;
}): Promise<IssuedOAuthTokens> {
  const accessToken = newSecret(OAUTH_ACCESS_TOKEN_PREFIX);
  const refreshToken = newSecret(REFRESH_TOKEN_PREFIX);
  const now = Date.now();
  await db.insert(oauthToken).values({
    familyId: input.familyId ?? randomUUID(),
    clientId: input.clientId,
    userId: input.userId,
    accessTokenHash: sha256Hex(accessToken),
    refreshTokenHash: sha256Hex(refreshToken),
    scopes: input.scopes,
    resource: input.resource,
    accessExpiresAt: new Date(now + OAUTH_ACCESS_TOKEN_TTL_SECONDS * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: OAUTH_ACCESS_TOKEN_TTL_SECONDS,
    scopes: input.scopes,
  };
}

/**
 * Exchanges a refresh token for a new access + refresh token pair (rotation). The old pair
 * is revoked. Reusing a refresh token that was already rotated revokes the whole family,
 * because only a stolen copy would still be presenting it.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
  requestedScopes: OAuthScope[] | null,
): Promise<IssuedOAuthTokens | "invalid_grant" | "invalid_scope"> {
  const [row] = await db
    .select()
    .from(oauthToken)
    .where(eq(oauthToken.refreshTokenHash, sha256Hex(refreshToken)));
  if (!row || row.clientId !== clientId) return "invalid_grant";

  if (row.revokedAt !== null) {
    await revokeTokenFamily(row.familyId);
    return "invalid_grant";
  }
  if (row.refreshExpiresAt < new Date()) return "invalid_grant";

  const granted = row.scopes as OAuthScope[];
  if (requestedScopes && !requestedScopes.every((s) => granted.includes(s))) {
    return "invalid_scope";
  }

  // Conditional on revoked_at IS NULL so two concurrent refreshes cannot both succeed.
  const revoked = await db
    .update(oauthToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthToken.id, row.id), isNull(oauthToken.revokedAt)))
    .returning({ id: oauthToken.id });
  if (revoked.length === 0) return "invalid_grant";

  return issueOAuthTokens({
    clientId,
    userId: row.userId,
    scopes: requestedScopes ?? granted,
    resource: row.resource,
    familyId: row.familyId,
  });
}

async function revokeTokenFamily(familyId: string): Promise<void> {
  await db
    .update(oauthToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthToken.familyId, familyId), isNull(oauthToken.revokedAt)));
}

/**
 * RFC 7009 revocation. Accepts an access or a refresh token; either revokes the pair.
 * Tokens belonging to another client are left alone, and the caller answers 200 anyway.
 */
export async function revokeOAuthToken(token: string, clientId: string): Promise<void> {
  const hash = sha256Hex(token);
  await db
    .update(oauthToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(oauthToken.clientId, clientId),
        isNull(oauthToken.revokedAt),
        or(eq(oauthToken.accessTokenHash, hash), eq(oauthToken.refreshTokenHash, hash)),
      ),
    );
}

export type AuthenticatedOAuthToken = {
  tokenId: string;
  userId: string;
  userEmail: string;
  clientId: string;
  scopes: OAuthScope[];
  resource: string;
};

/**
 * Resolves an access token, rejecting revoked and expired ones. Does not check scope or
 * resource — the caller knows what its endpoint needs.
 */
export async function authenticateOAuthAccessToken(
  accessToken: string,
): Promise<AuthenticatedOAuthToken | null> {
  const [row] = await db
    .select({
      tokenId: oauthToken.id,
      userId: oauthToken.userId,
      userEmail: authUser.email,
      clientId: oauthToken.clientId,
      scopes: oauthToken.scopes,
      resource: oauthToken.resource,
      accessExpiresAt: oauthToken.accessExpiresAt,
    })
    .from(oauthToken)
    .innerJoin(authUser, eq(authUser.id, oauthToken.userId))
    .where(
      and(eq(oauthToken.accessTokenHash, sha256Hex(accessToken)), isNull(oauthToken.revokedAt)),
    );
  if (!row || row.accessExpiresAt < new Date()) return null;

  await db.update(oauthToken).set({ lastUsedAt: new Date() }).where(eq(oauthToken.id, row.tokenId));
  const { accessExpiresAt: _expires, ...token } = row;
  return { ...token, scopes: token.scopes as OAuthScope[] };
}
