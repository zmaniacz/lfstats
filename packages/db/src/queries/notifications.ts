// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, count, eq, inArray, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { db } from "../client";
import {
  competition,
  competitionMatch,
  notificationOutbox,
  notificationPreference,
  pushSubscription,
  userRole,
} from "../schema";
import { hasMatchStructure } from "./admin";

const STALE_AFTER = sql`interval '1 hour'`;
const OUTBOX_RETENTION = sql`interval '30 days'`;

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

/** A device can follow this many competitions. Keeps an anonymous caller from growing a row set. */
const MAX_FOLLOWS_PER_DEVICE = 50;

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

/** Deletes the subscription if nothing uses it any more, and says whether it did. */
async function deleteIfUnused(subscriptionId: string): Promise<boolean> {
  const deleted = await db
    .delete(pushSubscription)
    .where(
      and(
        eq(pushSubscription.id, subscriptionId),
        notExists(
          db
            .select({ id: notificationPreference.id })
            .from(notificationPreference)
            .where(eq(notificationPreference.subscriptionId, subscriptionId)),
        ),
      ),
    )
    .returning({ id: pushSubscription.id });
  return deleted.length > 0;
}

/**
 * Returns whether the subscription was deleted, in which case the browser should unsubscribe.
 * A device that still follows competitions keeps its subscription but stops belonging to the user.
 */
export async function disableUnassignedGames(endpoint: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(and(eq(pushSubscription.endpoint, endpoint), eq(pushSubscription.userId, userId)));
  if (!row) return false;

  await db
    .delete(notificationPreference)
    .where(
      and(
        eq(notificationPreference.subscriptionId, row.id),
        eq(notificationPreference.kind, "unassigned_game"),
      ),
    );
  if (await deleteIfUnused(row.id)) return true;
  await db.update(pushSubscription).set({ userId: null }).where(eq(pushSubscription.id, row.id));
  return false;
}

export type FollowCompetitionResult = "ok" | "unavailable" | "limit";

/** Following never touches user_id, so it can't take a device away from an admin. */
export async function followCompetition(
  subscription: PushSubscriptionKeys,
  competitionId: string,
): Promise<FollowCompetitionResult> {
  const [comp] = await db
    .select({ state: competition.state, format: competition.format })
    .from(competition)
    .where(eq(competition.id, competitionId));
  if (!comp || !hasMatchStructure(comp.format)) return "unavailable";
  if (comp.state !== "active" && comp.state !== "upcoming") return "unavailable";

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(pushSubscription)
      .values(subscription)
      .onConflictDoUpdate({
        target: pushSubscription.endpoint,
        set: { p256dh: subscription.p256dh, auth: subscription.auth },
      })
      .returning({ id: pushSubscription.id });

    const [{ follows }] = await tx
      .select({ follows: count() })
      .from(notificationPreference)
      .where(
        and(
          eq(notificationPreference.subscriptionId, row.id),
          eq(notificationPreference.kind, "match_game"),
        ),
      );
    if (follows >= MAX_FOLLOWS_PER_DEVICE) return "limit";

    await tx
      .insert(notificationPreference)
      .values({ subscriptionId: row.id, kind: "match_game", competitionId })
      .onConflictDoNothing();
    return "ok";
  });
}

/** Returns whether the subscription was deleted, in which case the browser should unsubscribe. */
export async function unfollowCompetition(
  endpoint: string,
  competitionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: pushSubscription.id })
    .from(pushSubscription)
    .where(eq(pushSubscription.endpoint, endpoint));
  if (!row) return false;

  await db
    .delete(notificationPreference)
    .where(
      and(
        eq(notificationPreference.subscriptionId, row.id),
        eq(notificationPreference.kind, "match_game"),
        eq(notificationPreference.competitionId, competitionId),
      ),
    );
  return deleteIfUnused(row.id);
}

export async function isFollowingCompetition(
  endpoint: string,
  competitionId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: notificationPreference.id })
    .from(notificationPreference)
    .innerJoin(pushSubscription, eq(pushSubscription.id, notificationPreference.subscriptionId))
    .where(
      and(
        eq(notificationPreference.kind, "match_game"),
        eq(notificationPreference.competitionId, competitionId),
        eq(pushSubscription.endpoint, endpoint),
      ),
    );
  return rows.length > 0;
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
    })
    .onConflictDoNothing();
}

/**
 * Queues the review alert for a game auto-assigned with players on neither roster. It goes to
 * the unassigned-games audience, who would otherwise have placed the game by hand. Never throws:
 * the assignment is already committed.
 */
export async function enqueueAutoAssignReview(
  gameId: string,
  competitionId: string,
): Promise<void> {
  try {
    await db
      .insert(notificationOutbox)
      .values({
        kind: "auto_assign_review",
        competitionId,
        dedupeKey: `auto_assign_review:${gameId}`,
        payload: { gameId },
      })
      .onConflictDoNothing();
  } catch (err) {
    console.warn(`Auto-assign review alert failed for ${gameId}: ${(err as Error).message}`);
  }
}

/**
 * Queues the alert for a game or Laserball match assigned to a competition match. Only an active
 * competition sends one, which also keeps the legacy migration scripts quiet. Never throws: the
 * assignment is already committed, so a notification problem must not look like it failed.
 */
export async function enqueueMatchGame(
  matchId: string,
  assigned: { gameId: string; forfeit?: boolean } | { lbMatchId: string },
): Promise<void> {
  try {
    const [row] = await db
      .select({ competitionId: competition.id, state: competition.state })
      .from(competitionMatch)
      .innerJoin(competition, eq(competition.id, competitionMatch.competitionId))
      .where(eq(competitionMatch.id, matchId));
    if (row?.state !== "active") return;

    const assignedId = "gameId" in assigned ? assigned.gameId : assigned.lbMatchId;
    await db
      .insert(notificationOutbox)
      .values({
        kind: "match_game",
        competitionId: row.competitionId,
        dedupeKey: `match_game:${matchId}:${assignedId}`,
        payload: { matchId, ...assigned },
      })
      .onConflictDoNothing();
  } catch (err) {
    console.warn(`Match notification failed for ${matchId}: ${(err as Error).message}`);
  }
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

export async function getMatchGameRecipients(competitionId: string): Promise<PushRecipient[]> {
  return db
    .select(subscriptionColumns)
    .from(notificationPreference)
    .innerJoin(pushSubscription, eq(pushSubscription.id, notificationPreference.subscriptionId))
    .where(
      and(
        eq(notificationPreference.kind, "match_game"),
        eq(notificationPreference.competitionId, competitionId),
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
