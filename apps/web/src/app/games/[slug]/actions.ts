// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import {
  addFavorite,
  assignTagToGame,
  deleteGame,
  getGameCenterId,
  getGameSlugById,
  removeFavorite,
  removeTagFromGame,
  setGameExcluded,
  markGameAsReplay,
  markGameAsAborted,
  removeGameFromCompetition,
  setGameCompetition,
  assignGameToMatch,
  removeGameFromMatch,
  addPenalty,
  updatePenalty,
  deletePenalty,
  setScorecardMercenary,
} from "@lfstats/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

async function revalidateGame(gameId: string) {
  const slug = await getGameSlugById(gameId);
  if (slug) revalidatePath(`/games/${slug}`);
}

export async function deleteGameAction(gameId: string) {
  await requireCenterAdmin(gameId);
  await deleteGame(gameId);
  redirect("/games");
}

export async function toggleExcludeAction(gameId: string, exclude: boolean) {
  await requireCenterAdmin(gameId);
  await setGameExcluded(gameId, exclude);
  await revalidateGame(gameId);
}

export async function markGameAsReplayAction(gameId: string) {
  await requireCenterAdmin(gameId);
  await markGameAsReplay(gameId);
  await revalidateGame(gameId);
}

export async function markGameAsAbortedAction(gameId: string) {
  await requireCenterAdmin(gameId);
  await markGameAsAborted(gameId);
  await revalidateGame(gameId);
}

export async function assignTagAction(gameId: string, tagId: string) {
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

  await assignTagToGame(gameId, tagId, session.user.email ?? undefined);
  await revalidateGame(gameId);
}

export async function removeTagAction(gameId: string, tagId: string) {
  await requireCenterAdmin(gameId);
  await removeTagFromGame(gameId, tagId);
  await revalidateGame(gameId);
}

export async function addGameToCompetitionAction(
  gameId: string,
  competitionId: string,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await setGameCompetition(gameId, competitionId);
  await revalidateGame(gameId);
}

export async function removeGameFromCompetitionAction(gameId: string): Promise<void> {
  await requireCenterAdmin(gameId);
  await removeGameFromCompetition(gameId);
  await revalidateGame(gameId);
}

export async function assignGameToMatchAction(
  gameId: string,
  matchId: string,
  gameNumber: number,
  team1GameTeamId: string,
  team2GameTeamId: string,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId);
  await revalidateGame(gameId);
}

export async function removeGameFromMatchAction(
  gameId: string,
  matchGameId: string,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await removeGameFromMatch(matchGameId);
  await revalidateGame(gameId);
}

export async function addPenaltyAction(
  gameId: string,
  scorecardId: string,
  formData: FormData,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await addPenalty({
    scorecardId,
    gameId,
    type: (formData.get("type") as string) || "Common Foul",
    description: (formData.get("description") as string) || "",
    scoreValue: parseInt((formData.get("scoreValue") as string) || "0", 10),
    mvpValue: parseFloat((formData.get("mvpValue") as string) || "0"),
    inGame: false,
  });
  await revalidateGame(gameId);
}

export async function updatePenaltyAction(
  gameId: string,
  penaltyId: string,
  formData: FormData,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await updatePenalty(penaltyId, {
    type: formData.get("type") as string,
    description: formData.get("description") as string,
    scoreValue: parseInt((formData.get("scoreValue") as string) || "0", 10),
    mvpValue: parseFloat((formData.get("mvpValue") as string) || "0"),
  });
  await revalidateGame(gameId);
}

export async function rescindPenaltyAction(
  gameId: string,
  penaltyId: string,
  rescinded: boolean,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await updatePenalty(penaltyId, { rescinded });
  await revalidateGame(gameId);
}

export async function deletePenaltyAction(gameId: string, penaltyId: string): Promise<void> {
  await requireCenterAdmin(gameId);
  await deletePenalty(penaltyId);
  await revalidateGame(gameId);
}

export async function setScorecardMercenaryAction(
  gameId: string,
  scorecardId: string,
  isMercenary: boolean,
): Promise<void> {
  await requireCenterAdmin(gameId);
  await setScorecardMercenary(scorecardId, isMercenary);
  await revalidateGame(gameId);
}

export async function addFavoriteAction(gameId: string, note?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await addFavorite(session.user.id, gameId, note);
  await revalidateGame(gameId);
}

export async function removeFavoriteAction(gameId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await removeFavorite(session.user.id, gameId);
  await revalidateGame(gameId);
}
