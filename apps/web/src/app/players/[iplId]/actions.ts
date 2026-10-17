// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import {
  addFavoritePlayer,
  mergeSyntheticPlayer,
  removeFavoritePlayer,
  searchPlayersForRoster,
  type MergeSyntheticPlayerResult,
  type PlayerSearchResult,
} from "@lfstats/db";
import { revalidatePath } from "next/cache";

export async function addFavoritePlayerAction(iplId: string, playerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await addFavoritePlayer(session.user.id, playerId);
  revalidatePath(`/players/${iplId}`);
}

export async function removeFavoritePlayerAction(iplId: string, playerId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await removeFavoritePlayer(session.user.id, playerId);
  revalidatePath(`/players/${iplId}`);
}

// Merging a synthetic legacy player is admin/superAdmin only (docs/Role_Spec.md): it
// rewrites player identity across every center, so centerAdmin does not qualify.
async function requireAdmin() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin")) {
    throw new Error("Forbidden");
  }
}

/** Real (non-synthetic) players matching a callsign, as merge targets. */
export async function searchMergeTargetsAction(query: string): Promise<PlayerSearchResult[]> {
  await requireAdmin();
  if (!query.trim()) return [];
  return searchPlayersForRoster(query.trim());
}

export async function mergeSyntheticPlayerAction(
  sourceIplId: string,
  sourceId: string,
  targetId: string,
): Promise<MergeSyntheticPlayerResult> {
  await requireAdmin();
  const result = await mergeSyntheticPlayer(sourceId, targetId);
  if (!result.ok) return result;
  // The source page is gone after this, so the client navigates to the target rather
  // than refreshing in place (a refresh would only render the source's 404).
  revalidatePath(`/players/${sourceIplId}`);
  revalidatePath(`/players/${result.targetIplId.replace(/^#/, "")}`);
  return result;
}
