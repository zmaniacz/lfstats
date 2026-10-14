// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { OAUTH_SCOPES } from "@lfstats/db";
import { CORS_HEADERS, corsPreflight, mcpResourceUrl, siteOrigin } from "@/lib/oauth/server";

// RFC 9728 protected resource metadata for /mcp. MCP clients find it through the
// `resource_metadata` parameter of the 401's WWW-Authenticate header; it names the
// authorization server to use. Served at both the path-suffixed URL (…/mcp, the spec's
// form) and the bare one, which older clients probe.
export async function GET(): Promise<Response> {
  const origin = await siteOrigin();
  return Response.json(
    {
      resource: mcpResourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "LFstats",
    },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" } },
  );
}

export const OPTIONS = corsPreflight;
