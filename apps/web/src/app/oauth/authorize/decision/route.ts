// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { createAuthorizationCode } from "@lfstats/db";
import { auth } from "@/auth";
import { authorizationRedirect, siteOrigin, validateAuthorizeRequest } from "@/lib/oauth/server";

// The consent form's target. A plain route handler rather than a Server Action because it
// ends in a redirect to the client's redirect URI, which may be a native app scheme.

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: Request): Promise<Response> {
  const origin = await siteOrigin();

  // CSRF: only our own consent page may submit a decision. The session cookie is
  // SameSite=Lax, which already keeps it off cross-site POSTs; this is the second lock.
  const requestOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOrigin =
    requestOrigin !== null ? requestOrigin === origin : fetchSite === "same-origin";
  if (!sameOrigin) return new Response("Forbidden", { status: 403 });

  const form = new URLSearchParams(await request.text());
  const decision = form.get("decision");
  form.delete("decision");

  const session = await auth();
  if (!session?.user?.id) return seeOther(`${origin}/oauth/authorize?${form.toString()}`);

  const validation = await validateAuthorizeRequest(form, origin);
  if (validation.kind === "fatal") return new Response(validation.message, { status: 400 });
  if (validation.kind === "redirect") return seeOther(validation.url);
  const req = validation.request;

  if (decision !== "allow") {
    return seeOther(
      authorizationRedirect(
        req.redirectUri,
        { error: "access_denied", error_description: "The user denied access.", state: req.state },
        origin,
      ),
    );
  }

  const code = await createAuthorizationCode({
    clientId: req.client.id,
    userId: session.user.id,
    redirectUri: req.redirectUri,
    codeChallenge: req.codeChallenge,
    scopes: req.scopes,
    resource: req.resource,
  });
  return seeOther(authorizationRedirect(req.redirectUri, { code, state: req.state }, origin));
}
