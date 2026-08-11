// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { revalidatePath } from "next/cache";
import { requireCompetitionAccess } from "@/lib/competition-access";
import {
  createCompetition,
  updateCompetition,
  deleteCompetition,
  bulkAssignGamesToCompetition,
  removeGameFromCompetition,
  removeGameFromMatch,
  getCompetitionById,
} from "@lfstats/db";
import { redirect } from "next/navigation";

export async function createCompetitionAction(formData: FormData) {
  const hostCenterId = (formData.get("hostCenterId") as string) || null;
  await requireCompetitionAccess(hostCenterId);

  const name = formData.get("name") as string;
  const type = formData.get("type") as "competitive" | "social";
  // Coerced rather than cast: anything other than an explicit "solo" is a team competition.
  const format = formData.get("format") === "solo" ? "solo" : "team";
  const state = formData.get("state") as "preshow" | "upcoming" | "active" | "completed";
  const startDate = formData.get("startDate") as string;
  const endDate = (formData.get("endDate") as string) || null;
  const description = (formData.get("description") as string) || null;
  const challongeLink = (formData.get("challongeLink") as string) || null;
  const challongeBracketHeightRaw = formData.get("challongeBracketHeight") as string;
  const challongeBracketHeight = challongeBracketHeightRaw
    ? parseInt(challongeBracketHeightRaw, 10)
    : null;

  const { slug } = await createCompetition({
    name,
    type,
    format,
    state,
    startDate,
    endDate,
    description,
    challongeLink,
    challongeBracketHeight,
    hostCenterId,
  });

  redirect(`/admin/competitions/${slug}`);
}

export async function updateCompetitionAction(id: string, formData: FormData) {
  const competition = await getCompetitionById(id);
  if (!competition) throw new Error("Not found");
  await requireCompetitionAccess(competition.hostCenterId ?? null);

  const name = formData.get("name") as string;
  const type = formData.get("type") as "competitive" | "social";
  // Coerced rather than cast: anything other than an explicit "solo" is a team competition.
  const format = formData.get("format") === "solo" ? "solo" : "team";
  const state = formData.get("state") as "preshow" | "upcoming" | "active" | "completed";
  const startDate = formData.get("startDate") as string;
  const endDate = (formData.get("endDate") as string) || null;
  const description = (formData.get("description") as string) || null;
  const challongeLink = (formData.get("challongeLink") as string) || null;
  const challongeBracketHeightRaw = formData.get("challongeBracketHeight") as string;
  const challongeBracketHeight = challongeBracketHeightRaw
    ? parseInt(challongeBracketHeightRaw, 10)
    : null;
  const hostCenterId = (formData.get("hostCenterId") as string) || null;

  await updateCompetition(id, {
    name,
    type,
    format,
    state,
    startDate,
    endDate,
    description,
    challongeLink,
    challongeBracketHeight,
    hostCenterId,
  });
  const updated = await getCompetitionById(id);
  redirect(`/admin/competitions/${updated!.slug}`);
}

export async function deleteCompetitionAction(id: string) {
  const competition = await getCompetitionById(id);
  if (!competition) throw new Error("Not found");
  await requireCompetitionAccess(competition.hostCenterId ?? null);
  await deleteCompetition(id);
  redirect("/admin/competitions");
}

export async function removeGameFromCompetitionAction(
  competitionId: string,
  gameId: string,
): Promise<void> {
  const competition = await getCompetitionById(competitionId);
  if (!competition) throw new Error("Not found");
  await requireCompetitionAccess(competition.hostCenterId ?? null);
  await removeGameFromCompetition(gameId);
  revalidatePath(`/admin/competitions/${competition.slug}`);
}

export async function unassignGameFromMatchAction(
  competitionId: string,
  matchGameId: string,
): Promise<void> {
  const competition = await getCompetitionById(competitionId);
  if (!competition) throw new Error("Not found");
  await requireCompetitionAccess(competition.hostCenterId ?? null);
  await removeGameFromMatch(matchGameId);
  revalidatePath(`/admin/competitions/${competition.slug}`);
}

/**
 * Reports the competition-state refusal instead of throwing: a thrown server
 * action is redacted to a bare digest in production, so the admin would see
 * nothing at all explaining why the assign did nothing.
 */
export type BulkAssignResult = { ok: true; count: number } | { ok: false; error: string };

export async function bulkAssignGamesAction(
  competitionId: string,
  formData: FormData,
): Promise<BulkAssignResult> {
  const competition = await getCompetitionById(competitionId);
  if (!competition) throw new Error("Not found");
  await requireCompetitionAccess(competition.hostCenterId ?? null);

  if (competition.state !== "active") {
    return { ok: false, error: "Games can only be assigned while the competition is active." };
  }

  const centerId = formData.get("centerId") as string;
  const dateFrom = formData.get("dateFrom") as string;
  const dateTo = formData.get("dateTo") as string;

  const count = await bulkAssignGamesToCompetition(competitionId, centerId, dateFrom, dateTo);
  return { ok: true, count };
}
