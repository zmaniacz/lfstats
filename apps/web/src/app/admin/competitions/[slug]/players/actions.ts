// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { refresh, revalidatePath } from "next/cache";
import {
  enrollAllUnenrolledInSoloCompetition,
  enrollPlayerInSoloCompetition,
  getCompetitionById,
  removePlayerFromSoloCompetition,
  searchPlayersForRoster,
  setSoloCompetitionHandicap,
  type BulkEnrollResult,
  type PlayerSearchResult,
  type RosterMutationResult,
} from "@lfstats/db";
import { requireCompetitionAccess } from "@/lib/competition-access";

/**
 * A handicap is a whole number of MVP points added to each of a player's counted games.
 * Negatives are meaningful (handicapping a strong player down), so there is no lower
 * clamp; anything the browser lets through that isn't a number falls back to 0.
 */
function parseHandicap(value: FormDataEntryValue | string | number | null): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Uses requireCompetitionAccess rather than an admin-only requireAdmin(): the standings
 * page shows the unenrolled-players block to centerAdmins too, so they must be able to
 * act on it for their own center's competitions.
 */
async function revalidateSoloPaths(competitionId: string): Promise<void> {
  const comp = await getCompetitionById(competitionId);
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/players`);
  revalidatePath("/standings");
}

async function guard(competitionId: string): Promise<void> {
  const comp = await getCompetitionById(competitionId);
  if (!comp) throw new Error("Not found");
  await requireCompetitionAccess(comp.hostCenterId ?? null);
}

export async function enrollSoloPlayerAction(
  competitionId: string,
  playerId: string,
  handicap: number | string,
): Promise<RosterMutationResult> {
  await guard(competitionId);
  const result = await enrollPlayerInSoloCompetition(
    competitionId,
    playerId,
    parseHandicap(handicap),
  );
  if (!result.ok) return result;
  await revalidateSoloPaths(competitionId);
  refresh();
  return result;
}

export async function enrollAllSoloPlayersAction(competitionId: string): Promise<BulkEnrollResult> {
  await guard(competitionId);
  const result = await enrollAllUnenrolledInSoloCompetition(competitionId);
  if (!result.ok) return result;
  await revalidateSoloPaths(competitionId);
  refresh();
  return result;
}

export async function setSoloHandicapAction(
  competitionId: string,
  entryId: string,
  handicap: number | string,
): Promise<RosterMutationResult> {
  await guard(competitionId);
  const result = await setSoloCompetitionHandicap(entryId, parseHandicap(handicap));
  if (!result.ok) return result;
  await revalidateSoloPaths(competitionId);
  refresh();
  return result;
}

export async function removeSoloPlayerAction(
  competitionId: string,
  entryId: string,
): Promise<RosterMutationResult> {
  await guard(competitionId);
  const result = await removePlayerFromSoloCompetition(entryId);
  if (!result.ok) return result;
  await revalidateSoloPaths(competitionId);
  refresh();
  return result;
}

export async function searchPlayersAction(query: string): Promise<PlayerSearchResult[]> {
  if (!query.trim()) return [];
  return searchPlayersForRoster(query.trim());
}
