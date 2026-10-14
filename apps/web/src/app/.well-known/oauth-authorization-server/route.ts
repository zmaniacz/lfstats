// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { OAUTH_SCOPES, TOKEN_ENDPOINT_AUTH_METHODS } from "@lfstats/db";
import { CORS_HEADERS, corsPreflight, siteOrigin } from "@/lib/oauth/server";

// RFC 8414 authorization server metadata. See docs/Query_API_Spec.md "OAuth".
export async function GET(): Promise<Response> {
  const origin = await siteOrigin();
  return Response.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      revocation_endpoint_auth_methods_supported: TOKEN_ENDPOINT_AUTH_METHODS,
      scopes_supported: OAUTH_SCOPES,
      authorization_response_iss_parameter_supported: true,
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" } },
  );
}

export const OPTIONS = corsPreflight;
