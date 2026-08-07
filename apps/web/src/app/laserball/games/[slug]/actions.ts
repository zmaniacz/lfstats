// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { parseYoutubeLink } from "@/lib/youtube";
import {
  addGameVideo,
  addLbMatchOvertimeGame,
  getGameCenterId,
  getGameSlugById,
  getGameVideoById,
  getLbMatchDetail,
  getLbMatchIdForGame,
  linkLbMatch,
  removeGameVideo,
  removeLbMatchOvertimeGame,
  setGameExcluded,
  unlinkLbMatch,
  updateGameVideo,
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
  const link = parseYoutubeLink(youtubeUrl);
  if (!link) throw new Error("Invalid YouTube URL");

  // overwrite: re-adding a video already on this game means correcting it (a
  // fixed start offset or label), not asking for a second copy of the same link.
  await addGameVideo(
    {
      gameId,
      playerId: (formData.get("playerId") as string) || null,
      youtubeUrl,
      youtubeVideoId: link.videoId,
      startSeconds: link.startSeconds,
      label: (formData.get("label") as string) || null,
      source: "admin",
      createdByUserId: session.user.id,
    },
    { overwrite: true },
  );
  await revalidateLbGameAndMatch(gameId);
}

/**
 * Video edits report failure instead of throwing: a thrown server action is
 * redacted in production, and the caller needs to show which field was wrong.
 */
export type GameVideoActionResult = { ok: true } | { ok: false; error: string };

/**
 * Authorization is against the video's own game, not the `gameId` the caller
 * passes: those are independent inputs, so checking the caller-supplied one
 * would let a center admin edit another center's video by naming a game of
 * their own. On a match view they also legitimately differ — a video on half 1
 * is editable from half 2's URL — so this must not simply compare the two.
 */
async function requireVideoAdmin(videoId: string) {
  const video = await getGameVideoById(videoId);
  if (!video) throw new Error("Video not found");
  await requireCenterAdmin(video.gameId);
  return video;
}

export async function removeLbGameVideoAction(gameId: string, videoId: string): Promise<void> {
  await requireVideoAdmin(videoId);
  await removeGameVideo(videoId);
  await revalidateLbGameAndMatch(gameId);
}

export async function updateLbGameVideoAction(
  gameId: string,
  videoId: string,
  formData: FormData,
): Promise<GameVideoActionResult> {
  await requireVideoAdmin(videoId);

  const youtubeUrl = ((formData.get("youtubeUrl") as string) || "").trim();
  const link = parseYoutubeLink(youtubeUrl);
  if (!link) return { ok: false, error: "That doesn't look like a YouTube video URL." };

  const result = await updateGameVideo(videoId, {
    youtubeUrl,
    youtubeVideoId: link.videoId,
    startSeconds: link.startSeconds,
    label: ((formData.get("label") as string) || "").trim() || null,
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "duplicate"
          ? "That video is already linked here. Edit that entry instead."
          : "That video no longer exists.",
    };
  }

  await revalidateLbGameAndMatch(gameId);
  return { ok: true };
}
