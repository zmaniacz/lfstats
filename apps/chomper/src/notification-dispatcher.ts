// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Drains notification_outbox and sends Web Push messages. It runs beside the SQS loop in the
 * worker, never in the Lambda, because that loop blocks on its long poll and on each file. See
 * docs/Notifications_Spec.md.
 */

import { setTimeout as sleep } from "node:timers/promises";
import {
  TEST_NOTIFICATION_MESSAGE,
  claimDueNotifications,
  deletePushSubscriptions,
  getCompetitionById,
  getCompetitionMatchResults,
  getCompetitionUnassignedGamesForAdmin,
  getLbCompetitionMatchResults,
  getMatchGameRecipients,
  getPushRecipient,
  getUnassignedGameRecipients,
  lbMatchGameMessage,
  markPushDelivered,
  matchGameMessage,
  pruneNotificationOutbox,
  pushFailureAction,
  recordNotificationDelivery,
  skipNotifications,
  unassignedGamesMessage,
  type NotificationMessage,
  type PushRecipient,
} from "@lfstats/db";
import webpush, { WebPushError } from "web-push";

const POLL_MS = 5_000;
const PRUNE_MS = 3_600_000;
const SEND_CONCURRENCY = 10;
const SEND_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;
// The alert is about work waiting now, so it isn't worth delivering much later than this.
const UNASSIGNED_TTL_SECONDS = 6 * 3_600;
const MATCH_TTL_SECONDS = 3_600;

type SendResult = "sent" | "gone" | "failed";

function statusOf(err: unknown): number | undefined {
  return err instanceof WebPushError ? err.statusCode : undefined;
}

async function sendOne(
  recipient: PushRecipient,
  message: NotificationMessage,
  ttl: number,
  retried = false,
): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: recipient.endpoint, keys: { p256dh: recipient.p256dh, auth: recipient.auth } },
      JSON.stringify(message),
      { TTL: ttl, urgency: "high", timeout: SEND_TIMEOUT_MS },
    );
    return "sent";
  } catch (err) {
    const status = statusOf(err);
    const action = pushFailureAction(status);
    if (action === "delete") return "gone";
    if (action === "retry" && !retried) {
      await sleep(RETRY_DELAY_MS);
      return sendOne(recipient, message, ttl, true);
    }
    // The endpoint is a bearer secret, and WebPushError carries it, so log the status alone.
    console.error(`Push to subscription ${recipient.id} failed with status ${status}`);
    return "failed";
  }
}

async function deliver(
  outboxIds: string[],
  recipients: PushRecipient[],
  message: NotificationMessage,
  ttl: number,
): Promise<void> {
  const sent: string[] = [];
  const gone: string[] = [];
  let failed = 0;

  for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
    const batch = recipients.slice(i, i + SEND_CONCURRENCY);
    const results = await Promise.all(batch.map((r) => sendOne(r, message, ttl)));
    results.forEach((result, index) => {
      if (result === "sent") sent.push(batch[index].id);
      else if (result === "gone") gone.push(batch[index].id);
      else failed += 1;
    });
  }

  await markPushDelivered(sent);
  await deletePushSubscriptions(gone);
  await recordNotificationDelivery(outboxIds, recipients.length, failed);
  console.log(
    `Notification ${message.tag}: ${sent.length} sent, ${gone.length} expired, ${failed} failed`,
  );
}

async function dispatchUnassignedGames(competitionId: string, outboxIds: string[]): Promise<void> {
  const competition = await getCompetitionById(competitionId);
  if (competition?.state !== "active") {
    await skipNotifications(outboxIds, "competition not active");
    return;
  }

  const unassigned = await getCompetitionUnassignedGamesForAdmin(competitionId);
  if (unassigned.length === 0) {
    await skipNotifications(outboxIds, "already assigned");
    return;
  }

  await deliver(
    outboxIds,
    await getUnassignedGameRecipients(competition.hostCenterId),
    unassignedGamesMessage({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      count: unassigned.length,
    }),
    UNASSIGNED_TTL_SECONDS,
  );
}

type OutboxRow = Awaited<ReturnType<typeof claimDueNotifications>>[number];

async function sm5MatchMessage(
  competition: { id: string; name: string; slug: string },
  row: OutboxRow,
): Promise<NotificationMessage | null> {
  const results = await getCompetitionMatchResults(competition.id, undefined, "all");
  const match = results.find((m) => m.matchId === row.payload.matchId);
  const game = match?.games.find((g) => g.gameId === row.payload.gameId);
  // Gone means an admin undid the assignment, or excluded the game, inside the delay.
  if (!match || !game) return null;

  const sideName = (name: string, partners: { name: string }[]) =>
    [name, ...partners.map((p) => p.name)].join(" & ");
  return matchGameMessage({
    competitionName: competition.name,
    competitionSlug: competition.slug,
    roundName: match.roundName,
    matchId: match.matchId,
    gameId: game.gameId,
    gameNumber: game.gameNumber,
    gameSlug: game.gameSlug,
    forfeit: row.payload.forfeit === true,
    team1Name: sideName(match.team1Name, match.team1Partners),
    team2Name: sideName(match.team2Name, match.team2Partners),
    team1Score: game.team1Score,
    team2Score: game.team2Score,
    team1Result: game.team1Result,
    team2Result: game.team2Result,
    team1Points: match.team1TotalPoints,
    team2Points: match.team2TotalPoints,
    matchWinner: match.matchWinner,
  });
}

async function lbMatchMessage(
  competition: { id: string; name: string },
  row: OutboxRow,
): Promise<NotificationMessage | null> {
  const [match] = await getLbCompetitionMatchResults(competition.id, {
    matchId: row.payload.matchId,
  });
  const halves = match?.halves.filter((h) => !h.excluded) ?? [];
  if (!match || match.lbMatchId !== row.payload.lbMatchId || halves.length === 0) return null;

  return lbMatchGameMessage({
    competitionName: competition.name,
    roundName: match.roundName,
    matchId: match.matchId,
    lbMatchId: match.lbMatchId,
    team1Name: match.team1?.name ?? "TBD",
    team2Name: match.team2?.name ?? "TBD",
    halves,
    team1Goals: match.outcome.team1Goals,
    team2Goals: match.outcome.team2Goals,
    winner: match.outcome.winner,
  });
}

async function dispatchMatchGame(row: OutboxRow): Promise<void> {
  const competition = row.competitionId ? await getCompetitionById(row.competitionId) : null;
  if (competition?.state !== "active") {
    await skipNotifications([row.id], "competition not active");
    return;
  }

  const message = row.payload.lbMatchId
    ? await lbMatchMessage(competition, row)
    : await sm5MatchMessage(competition, row);
  if (!message) {
    await skipNotifications([row.id], "no longer assigned");
    return;
  }

  await deliver([row.id], await getMatchGameRecipients(competition.id), message, MATCH_TTL_SECONDS);
}

async function dispatchDue(): Promise<void> {
  const due = await claimDueNotifications();

  const stale = due.filter((row) => row.stale);
  await skipNotifications(
    stale.map((row) => row.id),
    "stale",
  );

  // Rows for one competition collapse into a single alert.
  const unassignedByCompetition = new Map<string, string[]>();
  for (const row of due) {
    if (row.stale) continue;
    if (row.kind === "test") {
      const recipient = await getPushRecipient(row.payload.subscriptionId ?? "");
      if (recipient) await deliver([row.id], [recipient], TEST_NOTIFICATION_MESSAGE, 60);
      else await skipNotifications([row.id], "subscription gone");
    } else if (row.kind === "match_game") {
      await dispatchMatchGame(row);
    } else if (row.competitionId) {
      const ids = unassignedByCompetition.get(row.competitionId) ?? [];
      unassignedByCompetition.set(row.competitionId, [...ids, row.id]);
    }
  }

  for (const [competitionId, ids] of unassignedByCompetition) {
    await dispatchUnassignedGames(competitionId, ids);
  }
}

/** Runs until `signal` aborts. Without VAPID keys it stops at once and the outbox just waits. */
export async function runNotificationDispatcher(signal: AbortSignal): Promise<void> {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    console.log("Notification dispatcher disabled: VAPID keys are not set");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("Notification dispatcher started");

  let lastPrune = 0;
  while (!signal.aborted) {
    try {
      await dispatchDue();
      if (Date.now() - lastPrune >= PRUNE_MS) {
        await pruneNotificationOutbox();
        lastPrune = Date.now();
      }
    } catch (err) {
      console.error(`Notification dispatch failed: ${(err as Error).message}`);
    }
    await sleep(POLL_MS, undefined, { signal }).catch(() => {});
  }
}
