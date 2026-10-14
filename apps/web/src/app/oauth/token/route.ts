// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  issueOAuthTokens,
  parseScopes,
  redeemAuthorizationCode,
  rotateRefreshToken,
  sameResource,
  verifyPkceS256,
  type IssuedOAuthTokens,
} from "@lfstats/db";
import { authenticateClient, readOAuthForm } from "@/lib/oauth/client-auth";
import { corsPreflight, oauthError, oauthJson } from "@/lib/oauth/server";

// RFC 6749 token endpoint: authorization_code (with PKCE) and refresh_token grants.

function tokenResponse(tokens: IssuedOAuthTokens): Response {
  return oauthJson({
    access_token: tokens.accessToken,
    token_type: "Bearer",
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    scope: tokens.scopes.join(" "),
  });
}

export async function POST(request: Request): Promise<Response> {
  const form = await readOAuthForm(request);
  const client = await authenticateClient(request, form);
  if (client instanceof Response) return client;

  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code");
    const verifier = form.get("code_verifier");
    if (!code || !verifier) {
      return oauthError("invalid_request", "code and code_verifier are required.");
    }
    const grant = await redeemAuthorizationCode(code);
    const invalidGrant = oauthError(
      "invalid_grant",
      "The authorization code is invalid or expired.",
    );
    if (!grant || grant.clientId !== client.id) return invalidGrant;
    // redirect_uri is required when it was sent to /authorize, which our clients always do.
    if (form.get("redirect_uri") !== grant.redirectUri) return invalidGrant;
    if (!verifyPkceS256(verifier, grant.codeChallenge)) return invalidGrant;
    const resource = form.get("resource");
    if (resource !== null && !sameResource(resource, grant.resource)) {
      return oauthError("invalid_target", "resource does not match the authorization request.");
    }
    return tokenResponse(
      await issueOAuthTokens({
        clientId: client.id,
        userId: grant.userId,
        scopes: grant.scopes,
        resource: grant.resource,
      }),
    );
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token");
    if (!refreshToken) return oauthError("invalid_request", "refresh_token is required.");
    const scope = form.get("scope");
    const scopes = scope === null ? null : parseScopes(scope);
    if (scope !== null && !scopes) return oauthError("invalid_scope", "Unknown scope.");
    const result = await rotateRefreshToken(refreshToken, client.id, scopes);
    if (result === "invalid_grant") {
      return oauthError("invalid_grant", "The refresh token is invalid, expired or revoked.");
    }
    if (result === "invalid_scope") {
      return oauthError("invalid_scope", "A refresh cannot add scopes.");
    }
    return tokenResponse(result);
  }

  return oauthError(
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token.",
  );
}

export const OPTIONS = corsPreflight;
