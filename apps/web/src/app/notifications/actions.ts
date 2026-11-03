// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import {
  canReceiveUnassignedGames,
  disableUnassignedGames,
  enableUnassignedGames,
  enqueueTestNotification,
  followCompetition,
  getUserRoles,
  isAllowedPushEndpoint,
  isFollowingCompetition,
  isUnassignedGamesEnabled,
  isValidPushKeys,
  unfollowCompetition,
  type PushSubscriptionKeys,
} from "@lfstats/db";
import { RateLimiter } from "@lfstats/db/analytics";
import { headers } from "next/headers";
import { auth } from "@/auth";

export type NotificationActionResult = { ok: true } | { ok: false; error: string };

// Survives dev reloads, like the query API's limiter.
const globalForLimiter = globalThis as typeof globalThis & { _followRateLimiter?: RateLimiter };
const followLimiter = (globalForLimiter._followRateLimiter ??= new RateLimiter());
const FOLLOW_LIMITS = { perMinute: 10, perDay: 100 };

/** Traefik appends the address it saw, so the last entry is the one a caller can't forge. */
async function clientAddress(): Promise<string> {
  const forwarded = (await headers()).get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || "unknown";
}

function isValidSubscription({ endpoint, p256dh, auth: authKey }: PushSubscriptionKeys): boolean {
  return isAllowedPushEndpoint(endpoint) && isValidPushKeys(p256dh, authKey);
}

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function getUnassignedGamesEnabledAction(endpoint: string): Promise<boolean> {
  return isUnassignedGamesEnabled(endpoint, await requireUserId());
}

export async function enableUnassignedGamesAction(
  subscription: PushSubscriptionKeys,
): Promise<NotificationActionResult> {
  const userId = await requireUserId();
  // Roles from the database, not the session: a JWT's roles are only set at sign-in.
  if (!canReceiveUnassignedGames(await getUserRoles(userId))) throw new Error("Forbidden");

  if (!isValidSubscription(subscription)) {
    return { ok: false, error: "This browser's push service isn't supported." };
  }
  const { endpoint, p256dh, auth: authKey } = subscription;
  await enableUnassignedGames({ endpoint, p256dh, auth: authKey }, userId);
  return { ok: true };
}

/** Resolves true when the subscription was deleted, so the browser should drop it too. */
export async function disableUnassignedGamesAction(endpoint: string): Promise<boolean> {
  return disableUnassignedGames(endpoint, await requireUserId());
}

// Following needs no account. The anonymous actions below are bound to a competition id by the
// standings page, and proof of a device is knowing its endpoint.

export async function getFollowingAction(
  competitionId: string,
  endpoint: string,
): Promise<boolean> {
  return isFollowingCompetition(endpoint, competitionId);
}

export async function followCompetitionAction(
  competitionId: string,
  subscription: PushSubscriptionKeys,
): Promise<NotificationActionResult> {
  const limit = followLimiter.check(await clientAddress(), FOLLOW_LIMITS);
  if (!limit.ok) return { ok: false, error: "Too many requests. Please try again later." };

  if (!isValidSubscription(subscription)) {
    return { ok: false, error: "This browser's push service isn't supported." };
  }
  const { endpoint, p256dh, auth: authKey } = subscription;
  const result = await followCompetition({ endpoint, p256dh, auth: authKey }, competitionId);
  if (result === "unavailable") {
    return { ok: false, error: "This competition can't be followed." };
  }
  if (result === "limit") {
    return { ok: false, error: "This device already follows too many competitions." };
  }
  return { ok: true };
}

/** Resolves true when the subscription was deleted, so the browser should drop it too. */
export async function unfollowCompetitionAction(
  competitionId: string,
  endpoint: string,
): Promise<boolean> {
  return unfollowCompetition(endpoint, competitionId);
}

export async function sendTestNotificationAction(
  endpoint: string,
): Promise<NotificationActionResult> {
  const queued = await enqueueTestNotification(endpoint, await requireUserId());
  if (!queued) return { ok: false, error: "This device isn't subscribed any more." };
  return { ok: true };
}
