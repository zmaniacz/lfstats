// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { revalidatePath } from "next/cache";
import {
  assignGameToMatch,
  removeGameFromMatch,
  getCompetitionMatchById,
  createForfeitGame,
  getCompetitionHostCenterId,
  getCompetitionById,
} from "@lfstats/db";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden");
}

async function competitionSlug(competitionId: string): Promise<string | null> {
  const comp = await getCompetitionById(competitionId);
  return comp?.slug ?? null;
}

export async function assignGameAction(
  competitionId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const gameNumber = parseInt(formData.get("gameNumber") as string, 10);
  const gameId = formData.get("gameId") as string;
  const team1GameTeamId = formData.get("team1GameTeamId") as string;
  const team2GameTeamId = formData.get("team2GameTeamId") as string;
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId);
  const slug = await competitionSlug(competitionId);
  if (slug) revalidatePath(`/admin/competitions/${slug}/rounds`);
}

export async function removeGameAction(
  competitionId: string,
  matchId: string,
  matchGameId: string,
): Promise<void> {
  await requireAdmin();
  await removeGameFromMatch(matchGameId);
  const slug = await competitionSlug(competitionId);
  if (slug) revalidatePath(`/admin/competitions/${slug}/rounds`);
}

export async function createForfeitAction(
  competitionId: string,
  matchId: string,
  forfeitingTeam: "team1" | "team2",
  gameNumber: number,
): Promise<void> {
  await requireAdmin();

  const [centerId, match] = await Promise.all([
    getCompetitionHostCenterId(competitionId),
    getCompetitionMatchById(matchId),
  ]);

  if (!centerId || !match) throw new Error("Competition or match not found");
  if (!centerId) throw new Error("Competition has no host center");

  await createForfeitGame({
    matchId,
    competitionId,
    centerId,
    gameNumber,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    forfeitingTeam,
  });

  const slug = await competitionSlug(competitionId);
  if (slug) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds`);
  }
}
