// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import {
  getGameCenterId,
  getGameSlugById,
  linkLbMatch,
  setGameExcluded,
  unlinkLbMatch,
  type LbMatchTeamPairing,
} from "@lfstats/db";
import { revalidatePath } from "next/cache";

async function requireCenterAdmin(gameId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const centerId = await getGameCenterId(gameId);
  if (!centerId) throw new Error("Game not found");

  const roles = session.user.roles ?? [];
  const allowed = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === centerId),
  );
  if (!allowed) throw new Error("Forbidden");
  return { session, centerId };
}

async function revalidateLbGame(gameId: string) {
  const slug = await getGameSlugById(gameId);
  if (slug) revalidatePath(`/laserball/games/${slug}`);
}

export async function toggleExcludeAction(gameId: string, exclude: boolean) {
  await requireCenterAdmin(gameId);
  await setGameExcluded(gameId, exclude);
  await revalidateLbGame(gameId);
}

export async function linkLbMatchAction(
  gameId: string,
  otherGameId: string,
  pairing: LbMatchTeamPairing,
): Promise<void> {
  const { session } = await requireCenterAdmin(gameId);
  await linkLbMatch(gameId, otherGameId, pairing, session.user.email ?? undefined);
  await revalidateLbGame(gameId);
  await revalidateLbGame(otherGameId);
}

export async function unlinkLbMatchAction(
  gameId: string,
  matchId: string,
  otherGameId: string,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await unlinkLbMatch(matchId);
  await revalidateLbGame(gameId);
  await revalidateLbGame(otherGameId);
}
