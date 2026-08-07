// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { refresh, revalidatePath } from "next/cache";
import {
  assignGameToMatch,
  removeGameFromMatch,
  getCompetitionMatchById,
  createForfeitGame,
  getCompetitionById,
  updateCompetitionMatchTeams,
  updateCompetitionMatchSchedule,
} from "@lfstats/db";
import { auth } from "@/auth";
import { fromDateTimeInputValue } from "@/lib/format";

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

/**
 * Assignment and forfeit refusals come back as a value instead of a throw: a
 * thrown server action is redacted to a bare digest in production, so the
 * admin would see the button simply do nothing.
 */
export type MatchActionResult = { ok: true } | { ok: false; error: string };

export async function assignGameAction(
  competitionId: string,
  matchId: string,
  formData: FormData,
): Promise<MatchActionResult> {
  await requireAdmin();
  const competition = await getCompetitionById(competitionId);
  if (!competition) throw new Error("Competition not found");
  if (competition.state !== "active") {
    return { ok: false, error: "Games can only be assigned while the competition is active." };
  }
  const gameNumber = parseInt(formData.get("gameNumber") as string, 10);
  const gameId = formData.get("gameId") as string;
  const team1GameTeamId = formData.get("team1GameTeamId") as string;
  const team2GameTeamId = formData.get("team2GameTeamId") as string;
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId);
  const match = await getCompetitionMatchById(matchId);
  const slug = await competitionSlug(competitionId);
  if (slug && match) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}`);
  }
  refresh();
  return { ok: true };
}

export async function removeGameAction(
  competitionId: string,
  matchId: string,
  matchGameId: string,
): Promise<void> {
  await requireAdmin();
  await removeGameFromMatch(matchGameId);
  const match = await getCompetitionMatchById(matchId);
  const slug = await competitionSlug(competitionId);
  if (slug && match) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}`);
  }
  refresh();
}

export async function updateMatchTeamsAction(
  competitionId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const team1Id = (formData.get("team1Id") as string) || null;
  const team2Id = (formData.get("team2Id") as string) || null;
  await updateCompetitionMatchTeams(matchId, { team1Id, team2Id });

  const match = await getCompetitionMatchById(matchId);
  const slug = await competitionSlug(competitionId);
  if (slug && match) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}`);
  }
  refresh();
}

export async function updateMatchScheduleAction(
  competitionId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const rawG1 = (formData.get("game1ScheduledTime") as string) || null;
  const game1ScheduledStartTime = rawG1 ? fromDateTimeInputValue(rawG1) : null;

  const game2Mode = (formData.get("game2Mode") as string) || "custom";
  let game2ScheduledStartTime: Date | null = null;
  if (game1ScheduledStartTime && game2Mode !== "custom") {
    const offsetMin = parseInt(game2Mode, 10);
    game2ScheduledStartTime = new Date(game1ScheduledStartTime.getTime() + offsetMin * 60000);
  } else {
    const rawG2 = (formData.get("game2ScheduledTime") as string) || null;
    game2ScheduledStartTime = rawG2 ? fromDateTimeInputValue(rawG2) : null;
  }

  await updateCompetitionMatchSchedule(matchId, {
    game1ScheduledStartTime,
    game2ScheduledStartTime,
  });

  const match = await getCompetitionMatchById(matchId);
  const slug = await competitionSlug(competitionId);
  if (slug && match) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}`);
  }
  refresh();
}

export async function createForfeitAction(
  competitionId: string,
  matchId: string,
  forfeitingTeam: "team1" | "team2",
  gameNumber: number,
): Promise<MatchActionResult> {
  await requireAdmin();

  const [competition, match] = await Promise.all([
    getCompetitionById(competitionId),
    getCompetitionMatchById(matchId),
  ]);

  if (!competition || !match) throw new Error("Competition or match not found");
  if (!competition.hostCenterId) {
    return { ok: false, error: "This competition has no host center, so it cannot record games." };
  }
  if (competition.state !== "active") {
    return { ok: false, error: "Games can only be assigned while the competition is active." };
  }
  if (!match.team1Id || !match.team2Id) {
    return { ok: false, error: "Cannot record a forfeit until both teams are determined." };
  }

  await createForfeitGame({
    matchId,
    competitionId,
    centerId: competition.hostCenterId,
    gameNumber,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    forfeitingTeam,
  });

  const slug = await competitionSlug(competitionId);
  if (slug) {
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}/matches/${matchId}`);
    revalidatePath(`/admin/competitions/${slug}/rounds/${match.roundId}`);
  }
  refresh();
  return { ok: true };
}
