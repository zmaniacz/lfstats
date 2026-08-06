// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { parseYoutubeVideoId } from "@/lib/youtube";
import {
  addGameVideo,
  addLbMatchOvertimeGame,
  getGameCenterId,
  getGameSlugById,
  getLbMatchDetail,
  getLbMatchIdForGame,
  linkLbMatch,
  removeGameVideo,
  removeLbMatchOvertimeGame,
  setGameExcluded,
  unlinkLbMatch,
  type LbMatchOvertimePairing,
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

async function revalidateLbMatchGames(matchId: string) {
  const matchDetail = await getLbMatchDetail(matchId);
  if (!matchDetail) return;
  await Promise.all(matchDetail.halves.map((h) => revalidateLbGame(h.gameId)));
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
  const matchDetail = await getLbMatchDetail(matchId);
  await unlinkLbMatch(matchId);
  if (matchDetail) {
    await Promise.all(matchDetail.halves.map((h) => revalidateLbGame(h.gameId)));
  } else {
    await revalidateLbGame(gameId);
    await revalidateLbGame(otherGameId);
  }
}

export async function addLbMatchOvertimeAction(
  gameId: string,
  matchId: string,
  otGameId: string,
  pairing: LbMatchOvertimePairing,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await addLbMatchOvertimeGame(matchId, otGameId, pairing);
  await revalidateLbMatchGames(matchId);
}

export async function removeLbMatchOvertimeAction(gameId: string, matchId: string): Promise<void> {
  await requireCenterAdmin(gameId);
  await removeLbMatchOvertimeGame(matchId);
  await revalidateLbMatchGames(matchId);
}

// The Videos tab unions videos across every game in a match, so a change to one
// game invalidates all the halves' pages, not just the one that was edited.
async function revalidateLbGameAndMatch(gameId: string) {
  const matchId = await getLbMatchIdForGame(gameId);
  if (matchId) {
    await revalidateLbMatchGames(matchId);
  } else {
    await revalidateLbGame(gameId);
  }
}

export async function addLbGameVideoAction(gameId: string, formData: FormData): Promise<void> {
  const { session } = await requireCenterAdmin(gameId);

  const youtubeUrl = ((formData.get("youtubeUrl") as string) || "").trim();
  const youtubeVideoId = parseYoutubeVideoId(youtubeUrl);
  if (!youtubeVideoId) throw new Error("Invalid YouTube URL");

  await addGameVideo({
    gameId,
    playerId: (formData.get("playerId") as string) || null,
    youtubeUrl,
    youtubeVideoId,
    label: (formData.get("label") as string) || null,
    source: "admin",
    createdByUserId: session.user.id,
  });
  await revalidateLbGameAndMatch(gameId);
}

export async function removeLbGameVideoAction(gameId: string, videoId: string): Promise<void> {
  await requireCenterAdmin(gameId);
  await removeGameVideo(videoId);
  await revalidateLbGameAndMatch(gameId);
}
