// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  competition,
  notificationOutbox,
  notificationPreference,
  pushSubscription,
  userRole,
} from "../schema";
import { hasMatchStructure } from "./admin";

/** A game waits this long, so a quick assignment or a burst of uploads sends one alert or none. */
const SEND_DELAY = sql`now() + interval '60 seconds'`;
const STALE_AFTER = sql`interval '1 hour'`;
const OUTBOX_RETENTION = sql`interval '30 days'`;

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

/** Opting in claims the device for this user, so a shared device follows whoever opted in last. */
export async function enableUnassignedGames(
  subscription: PushSubscriptionKeys,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pushSubscription)
      .values({ ...subscription, userId })
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { p256dh: subscription.p256dh, auth: subscription.auth, userId },
      })
      .returning({ id: pushSubscription.id });
    await tx
      .insert(notificationPreference)
      .values({ subscriptionId: row.id, kind: "unassigned_game" })
      .onConflictDoNothing();
  });
}

/** Unassigned games is the only preference so far, so the subscription goes with it. */
export async function disableUnassignedGames(endpoint: string, userId: string): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)));
}

export async function isUnassignedGamesEnabled(endpoint: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: notificationPreference.id })
    .from(notificationPreference)
    .innerJoin(pushSubscription, eq(pushSubscription.id, notificationPreference.subscriptionId))
    .where(
      and(
        eq(notificationPreference.kind, "unassigned_game"),
        eq(pushSubscription.endpoint, endpoint),
        eq(pushSubscription.userId, userId),
      ),
    );
  return rows.length > 0;
}

/**
 * Queues the alert for a game ingested into a competition. A competition that isn't active, or
 * that has no matches to assign games to, sends nothing.
 */
export async function enqueueUnassignedGame(gameId: string, competitionId: string): Promise<void> {
  const [comp] = await db
    .select({ state: competition.state, format: competition.format })
    .from(competition)
    .where(eq(competition.id, competitionId));
  if (comp?.state !== "active" || !hasMatchStructure(comp.format)) return;

  await db
    .insert(notificationOutbox)
    .values({
      kind: "unassigned_game",
      competitionId,
      dedupeKey: `unassigned_game:${gameId}`,
      payload: { gameId },
      sendAfter: SEND_DELAY,
    })
    .onConflictDoNothing();
}

/** Returns false when the device is not subscribed for this user. */
export async function enqueueTestNotification(endpoint: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)));
  if (!row) return false;

  await db.insert(notificationOutbox).values({
    kind: "test",
    dedupeKey: `test:${crypto.randomUUID()}`,
    payload: { subscriptionId: row.id },
  });
  return true;
}

/**
 * Claims every due row in one statement. Claiming before sending makes delivery at most once: a
 * crash mid-send loses that alert rather than repeating it to everyone.
 */
export async function claimDueNotifications() {
  return db
    .update(notificationOutbox)
    .set({ sentAt: sql`now()` })
    .where(and(isNull(notificationOutbox.sentAt), lte(notificationOutbox.sendAfter, sql`now()`)))
    .returning({
      id: notificationOutbox.id,
      kind: notificationOutbox.kind,
      competitionId: notificationOutbox.competitionId,
      payload: notificationOutbox.payload,
      stale: sql<boolean>`${notificationOutbox.createdAt} < now() - ${STALE_AFTER}`,
    });
}

export async function skipNotifications(ids: string[], reason: string): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(notificationOutbox)
    .set({ skipReason: reason })
    .where(inArray(notificationOutbox.id, ids));
}

export async function recordNotificationDelivery(
  ids: string[],
  recipientCount: number,
  failureCount: number,
): Promise<void> {
  await db
    .update(notificationOutbox)
    .set({ recipientCount, failureCount })
    .where(inArray(notificationOutbox.id, ids));
}

const subscriptionColumns = {
  id: pushSubscription.id,
  endpoint: pushSubscription.endpoint,
  p256dh: pushSubscription.p256dh,
  auth: pushSubscription.auth,
};

export type PushRecipient = { id: string } & PushSubscriptionKeys;

/**
 * Who hears about a competition's unassigned games. Reads user_roles rather than a session,
 * because the roles in a JWT are only set at sign-in.
 */
export async function getUnassignedGameRecipients(
  hostCenterId: string | null,
): Promise<PushRecipient[]> {
  return db
    .selectDistinct(subscriptionColumns)
    .from(notificationPreference)
    .innerJoin(pushSubscription, eq(pushSubscription.id, notificationPreference.subscriptionId))
    .innerJoin(userRole, eq(userRole.userId, pushSubscription.userId))
    .where(
      and(
        eq(notificationPreference.kind, "unassigned_game"),
        or(
          inArray(userRole.role, ["superAdmin", "admin"]),
          hostCenterId
            ? and(eq(userRole.role, "centerAdmin"), eq(userRole.centerId, hostCenterId))
            : undefined,
        ),
      ),
    );
}

export async function getPushRecipient(subscriptionId: string): Promise<PushRecipient | null> {
  const [row] = await db
    .select(subscriptionColumns)
    .from(pushSubscription)
    .where(eq(pushSubscription.id, subscriptionId));
  return row ?? null;
}

export async function deletePushSubscriptions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(pushSubscription).where(inArray(pushSubscription.id, ids));
}

export async function markPushDelivered(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(pushSubscription)
    .set({ lastSuccessAt: sql`now()` })
    .where(inArray(pushSubscription.id, ids));
}

export async function pruneNotificationOutbox(): Promise<void> {
  await db
    .delete(notificationOutbox)
    .where(lte(notificationOutbox.createdAt, sql`now() - ${OUTBOX_RETENTION}`));
}
