// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import {
  canReceiveUnassignedGames,
  disableUnassignedGames,
  enableUnassignedGames,
  enqueueTestNotification,
  getUserRoles,
  isAllowedPushEndpoint,
  isUnassignedGamesEnabled,
  type PushSubscriptionKeys,
} from "@lfstats/db";
import { auth } from "@/auth";

export type NotificationActionResult = { ok: true } | { ok: false; error: string };

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

  const { endpoint, p256dh, auth: authKey } = subscription;
  if (!isAllowedPushEndpoint(endpoint) || !p256dh || !authKey) {
    return { ok: false, error: "This browser's push service isn't supported." };
  }
  await enableUnassignedGames({ endpoint, p256dh, auth: authKey }, userId);
  return { ok: true };
}

export async function disableUnassignedGamesAction(endpoint: string): Promise<void> {
  await disableUnassignedGames(endpoint, await requireUserId());
}

export async function sendTestNotificationAction(
  endpoint: string,
): Promise<NotificationActionResult> {
  const queued = await enqueueTestNotification(endpoint, await requireUserId());
  if (!queued) return { ok: false, error: "This device isn't subscribed any more." };
  return { ok: true };
}
