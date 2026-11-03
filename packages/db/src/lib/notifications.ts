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

/**
 * Whether a browser's keys have the shape web-push needs: a 65-byte P-256 point and a 16-byte
 * secret, base64url encoded. Bad keys throw before any request is made, so they would otherwise
 * sit in the table failing forever without a 410 to clear them.
 */
export function isValidPushKeys(p256dh: string, auth: string): boolean {
  return /^[A-Za-z0-9_-]{87}=?$/.test(p256dh) && /^[A-Za-z0-9_-]{22}(==)?$/.test(auth);
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

/** The result of a match, shaped from the same query the standings' match cards use. */
export type MatchGameResult = {
  competitionName: string;
  competitionSlug: string;
  roundName: string;
  matchId: string;
  gameId: string;
  gameNumber: number;
  gameSlug: string;
  forfeit: boolean;
  team1Name: string;
  team2Name: string;
  team1Score: number | null;
  team2Score: number | null;
  team1Result: string | null;
  team2Result: string | null;
  team1Points: number;
  team2Points: number;
  matchWinner: "team1" | "team2" | "draw" | "incomplete";
};

function formatScore(score: number | null): string {
  return score === null ? "—" : score.toLocaleString("en-US");
}

function gameLine(r: MatchGameResult): string {
  const label = `Game ${r.gameNumber}`;
  // The winner comes from the result, never the scores: an eliminated team can outscore it.
  const team1Won = r.team1Result === "win";
  const team2Won = r.team2Result === "win";
  if (r.forfeit) {
    return team1Won
      ? `${label}: ${r.team2Name} forfeited to ${r.team1Name}`
      : `${label}: ${r.team1Name} forfeited to ${r.team2Name}`;
  }
  const team1 = `${r.team1Name} ${formatScore(r.team1Score)}`;
  const team2 = `${r.team2Name} ${formatScore(r.team2Score)}`;
  if (team1Won) return `${label}: ${team1} def. ${team2}`;
  if (team2Won) return `${label}: ${team2} def. ${team1}`;
  return `${label}: ${team1} drew with ${team2}`;
}

function matchOutcomeLine(
  winner: "team1" | "team2" | "draw" | "incomplete",
  team1Name: string,
  team2Name: string,
  drawText: string,
): string[] {
  if (winner === "team1") return [`${team1Name} won the match`];
  if (winner === "team2") return [`${team2Name} won the match`];
  return winner === "draw" ? [drawText] : [];
}

export function matchGameMessage(r: MatchGameResult): NotificationMessage {
  return {
    title: `${r.competitionName}: ${r.roundName}`,
    body: [
      gameLine(r),
      `Match: ${r.team1Name} ${r.team1Points}–${r.team2Points} ${r.team2Name}`,
      ...matchOutcomeLine(r.matchWinner, r.team1Name, r.team2Name, "Match drawn"),
    ].join("\n"),
    // There's no game page behind a forfeit worth opening, so that goes to the standings.
    url: r.forfeit ? `/standings?competition=${r.competitionSlug}` : `/games/${r.gameSlug}`,
    // One tag per game, so the next game alerts rather than quietly replacing this one.
    tag: `match:${r.matchId}:${r.gameId}`,
  };
}

export type LbMatchGameResult = {
  competitionName: string;
  roundName: string;
  matchId: string;
  lbMatchId: string;
  team1Name: string;
  team2Name: string;
  // Ordered by half, without excluded halves. Half 3 onward is overtime.
  halves: { half: number; gameSlug: string; team1Goals: number; team2Goals: number }[];
  team1Goals: number;
  team2Goals: number;
  winner: 1 | 2 | "tie" | null;
};

/** A Laserball match is assigned whole, so one notification covers every half. */
export function lbMatchGameMessage(r: LbMatchGameResult): NotificationMessage {
  const halfLabel = (half: number) => (half > 2 ? `OT ${half - 2}` : `Half ${half}`);
  const winner =
    r.winner === 1
      ? "team1"
      : r.winner === 2
        ? "team2"
        : r.winner === "tie"
          ? "draw"
          : "incomplete";
  return {
    title: `${r.competitionName}: ${r.roundName}`,
    body: [
      ...r.halves.map(
        (h) =>
          `${halfLabel(h.half)}: ${r.team1Name} ${h.team1Goals}–${h.team2Goals} ${r.team2Name}`,
      ),
      `Match: ${r.team1Name} ${r.team1Goals}–${r.team2Goals} ${r.team2Name}`,
      ...matchOutcomeLine(winner, r.team1Name, r.team2Name, "Match tied"),
    ].join("\n"),
    url: `/laserball/games/${r.halves[0].gameSlug}`,
    tag: `match:${r.matchId}:${r.lbMatchId}`,
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
