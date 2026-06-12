// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { revalidatePath } from "next/cache";
import {
  createCompetitionRound,
  updateCompetitionRound,
  deleteCompetitionRound,
  createCompetitionMatch,
  deleteCompetitionMatch,
  getCompetitionMatchesByRound,
  getCompetitionTeams,
  getCompetitionById,
  reorderCompetitionMatches,
  updateCompetitionMatchTeams,
} from "@lfstats/db";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden");
}

async function revalidateRoundsPage(competitionId: string): Promise<void> {
  const comp = await getCompetitionById(competitionId);
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/rounds`);
}

async function revalidateRoundPage(competitionId: string, roundId: string): Promise<void> {
  const comp = await getCompetitionById(competitionId);
  if (comp) {
    revalidatePath(`/admin/competitions/${comp.slug}/rounds`);
    revalidatePath(`/admin/competitions/${comp.slug}/rounds/${roundId}`);
  }
}

export async function createRoundAction(competitionId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const name = formData.get("name") as string;
  const roundNumber = parseInt(formData.get("roundNumber") as string, 10);
  const type = formData.get("type") as "pool" | "finals";
  await createCompetitionRound({ competitionId, name, roundNumber, type });
  await revalidateRoundsPage(competitionId);
}

export async function updateRoundAction(
  competitionId: string,
  roundId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const name = formData.get("name") as string;
  const roundNumber = parseInt(formData.get("roundNumber") as string, 10);
  const type = formData.get("type") as "pool" | "finals";
  await updateCompetitionRound(roundId, { name, roundNumber, type });
  await revalidateRoundPage(competitionId, roundId);
}

export async function deleteRoundAction(competitionId: string, roundId: string): Promise<void> {
  await requireAdmin();
  await deleteCompetitionRound(roundId);
  await revalidateRoundsPage(competitionId);
}

export async function createMatchAction(
  competitionId: string,
  roundId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const team1Id = (formData.get("team1Id") as string) || null;
  const team2Id = (formData.get("team2Id") as string) || null;
  // Auto-assign next match number within this round
  const existing = await getCompetitionMatchesByRound(roundId);
  const matchNumber = existing.length > 0 ? Math.max(...existing.map((m) => m.matchNumber)) + 1 : 1;
  await createCompetitionMatch({ competitionId, roundId, matchNumber, team1Id, team2Id });
  await revalidateRoundPage(competitionId, roundId);
}

export async function deleteMatchAction(
  competitionId: string,
  roundId: string,
  matchId: string,
): Promise<void> {
  await requireAdmin();
  await deleteCompetitionMatch(matchId);
  await revalidateRoundPage(competitionId, roundId);
}

export async function generatePoolMatchesAction(
  competitionId: string,
  roundId: string,
): Promise<void> {
  await requireAdmin();
  const [teams, existing] = await Promise.all([
    getCompetitionTeams(competitionId),
    getCompetitionMatchesByRound(roundId),
  ]);
  let matchNumber = existing.length > 0 ? Math.max(...existing.map((m) => m.matchNumber)) + 1 : 1;
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      await createCompetitionMatch({
        competitionId,
        roundId,
        matchNumber: matchNumber++,
        team1Id: teams[i].id,
        team2Id: teams[j].id,
      });
    }
  }
  await revalidateRoundPage(competitionId, roundId);
}

export async function updateMatchTeamsAction(
  competitionId: string,
  roundId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const team1Id = (formData.get("team1Id") as string) || null;
  const team2Id = (formData.get("team2Id") as string) || null;
  await updateCompetitionMatchTeams(matchId, { team1Id, team2Id });
  await revalidateRoundPage(competitionId, roundId);
}

export async function reorderMatchesAction(
  competitionId: string,
  roundId: string,
  reorders: { id: string; matchNumber: number }[],
): Promise<void> {
  await requireAdmin();
  await reorderCompetitionMatches(reorders);
  await revalidateRoundPage(competitionId, roundId);
}
