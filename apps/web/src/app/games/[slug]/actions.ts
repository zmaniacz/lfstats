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
  removeGameFromCompetition,
  setGameCompetition,
  assignGameToMatch,
  removeGameFromMatch,
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
  await requireCenterAdmin(gameId)
  await setGameCompetition(gameId, competitionId)
  await revalidateGame(gameId)
}

export async function removeGameFromCompetitionAction(gameId: string): Promise<void> {
  await requireCenterAdmin(gameId)
  await removeGameFromCompetition(gameId)
  await revalidateGame(gameId)
}

export async function assignGameToMatchAction(
  gameId: string,
  matchId: string,
  gameNumber: number,
  team1GameTeamId: string,
  team2GameTeamId: string,
): Promise<void> {
  await requireCenterAdmin(gameId)
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId)
  await revalidateGame(gameId)
}

export async function removeGameFromMatchAction(
  gameId: string,
  matchGameId: string,
): Promise<void> {
  await requireCenterAdmin(gameId)
  await removeGameFromMatch(matchGameId)
  await revalidateGame(gameId)
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
