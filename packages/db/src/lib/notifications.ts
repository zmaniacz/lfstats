// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Pure rules for push notifications. Kept free of the db client so they can be unit-tested
 * directly; see docs/Notifications_Spec.md.
 */

/** What the service worker receives. Must stay under the push services' limit of about 3 KB. */
export type NotificationMessage = {
  title: string;
  body: string;
  url: string;
  // A newer notification with the same tag replaces the older one on the device.
  tag: string;
};

const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com"];
const PUSH_SERVICE_HOST_SUFFIXES = [
  ".push.apple.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
];

/**
 * Whether an endpoint belongs to a known push service. The worker sends a request to whatever
 * URL a browser hands us, so without this check a caller could aim it at the LAN.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "") return false;
  return (
    PUSH_SERVICE_HOSTS.includes(url.hostname) ||
    PUSH_SERVICE_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
  );
}

/** Whether these roles may opt in to the unassigned-games alert. Uploaders may not. */
export function canReceiveUnassignedGames(roles: { role: string }[]): boolean {
  return roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );
}

export function unassignedGamesMessage(competition: {
  id: string;
  name: string;
  slug: string;
  count: number;
}): NotificationMessage {
  const games = competition.count === 1 ? "1 game" : `${competition.count} games`;
  return {
    title: competition.name,
    body: `${games} ready to assign`,
    url: `/admin/competitions/${competition.slug}`,
    tag: `unassigned:${competition.id}`,
  };
}

export const TEST_NOTIFICATION_MESSAGE: NotificationMessage = {
  title: "LFstats",
  body: "Notifications are working on this device.",
  url: "/notifications",
  tag: "test",
};

/** What to do with a subscription after a failed send. */
export type PushFailureAction = "delete" | "retry" | "report";

export function pushFailureAction(statusCode: number | undefined): PushFailureAction {
  // No status means the request never got an answer, which is worth one more try.
  if (statusCode === undefined || statusCode === 429 || statusCode >= 500) return "retry";
  // The subscription is gone: the user revoked permission or the browser replaced it.
  if (statusCode === 404 || statusCode === 410) return "delete";
  // 401, 403 and 413 are our fault. The subscription is fine, so keep it.
  return "report";
}
