// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Where an OAuth client sends the user back to, in words. A client's name is self-asserted;
 * its redirect URI isn't, so this is what identifies the client to the user.
 */
export function describeRedirect(redirectUri: string): string {
  const url = new URL(redirectUri);
  if (url.protocol === "https:") return url.hostname;
  if (url.protocol === "http:") return "an app on this computer";
  return `the ${url.protocol.slice(0, -1)} app`;
}

/** The distinct destinations across a client's registered redirect URIs. */
export function describeRedirects(redirectUris: string[]): string {
  return [...new Set(redirectUris.map(describeRedirect))].join(", ");
}
