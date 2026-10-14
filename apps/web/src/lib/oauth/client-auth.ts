// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { authenticateOAuthClient, type OAuthClient } from "@lfstats/db";
import { oauthError } from "@/lib/oauth/server";

// Shared by the token and revocation endpoints: form-body parsing and client
// authentication (RFC 6749 §2.3.1).

/** The request body as form fields. JSON is accepted too, since some clients send it. */
export async function readOAuthForm(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (type.includes("application/json")) {
    try {
      const json: unknown = JSON.parse(text);
      if (json && typeof json === "object") {
        return new URLSearchParams(
          Object.entries(json).filter((e): e is [string, string] => typeof e[1] === "string"),
        );
      }
    } catch {
      // Falls through to an empty form; the endpoint reports the missing fields.
    }
    return new URLSearchParams();
  }
  return new URLSearchParams(text);
}

function basicCredentials(request: Request): { id: string; secret: string } | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return null;
  try {
    // RFC 6749 §2.3.1: both halves are form-urlencoded before being joined.
    return {
      id: decodeURIComponent(decoded.slice(0, colon).replace(/\+/g, " ")),
      secret: decodeURIComponent(decoded.slice(colon + 1).replace(/\+/g, " ")),
    };
  } catch {
    return null;
  }
}

/** Returns the authenticated client, or the `invalid_client` error response. */
export async function authenticateClient(
  request: Request,
  form: URLSearchParams,
): Promise<OAuthClient | Response> {
  const basic = basicCredentials(request);
  const clientId = basic?.id ?? form.get("client_id");
  const secret = basic?.secret ?? form.get("client_secret");
  const invalid = oauthError("invalid_client", "Client authentication failed.", 401, {
    "WWW-Authenticate": 'Basic realm="lfstats"',
  });
  if (!clientId) return invalid;
  if (basic && form.get("client_id") !== null && form.get("client_id") !== basic.id) return invalid;
  return (await authenticateOAuthClient(clientId, secret || null)) ?? invalid;
}
