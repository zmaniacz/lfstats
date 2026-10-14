// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { revokeOAuthToken } from "@lfstats/db";
import { authenticateClient, readOAuthForm } from "@/lib/oauth/client-auth";
import { corsPreflight, oauthError, oauthJson } from "@/lib/oauth/server";

// RFC 7009 token revocation. Revoking either token of a pair revokes both. Unknown tokens
// still get a 200, so the endpoint cannot be used to probe which tokens exist.
export async function POST(request: Request): Promise<Response> {
  const form = await readOAuthForm(request);
  const client = await authenticateClient(request, form);
  if (client instanceof Response) return client;

  const token = form.get("token");
  if (!token) return oauthError("invalid_request", "token is required.");
  await revokeOAuthToken(token, client.id);
  return oauthJson({});
}

export const OPTIONS = corsPreflight;
