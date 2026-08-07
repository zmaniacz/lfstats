// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { refresh, revalidatePath } from "next/cache";
import { createCompetitionTeam, deleteCompetitionTeam, getCompetitionById } from "@lfstats/db";
import { auth } from "@/auth";

async function requireAdmin() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const ok = roles.some((r) => r.role === "superAdmin" || r.role === "admin");
  if (!ok) throw new Error("Forbidden");
}

export async function createCompetitionTeamAction(
  competitionId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const name = formData.get("name") as string;
  const shortName = (formData.get("shortName") as string) || null;
  await createCompetitionTeam({ competitionId, name, shortName });
  const comp = await getCompetitionById(competitionId);
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/teams`);
  refresh();
}

export async function deleteCompetitionTeamAction(
  competitionId: string,
  teamId: string,
): Promise<void> {
  await requireAdmin();
  await deleteCompetitionTeam(teamId);
  const comp = await getCompetitionById(competitionId);
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/teams`);
  refresh();
}

// Roster mutation and player search live on the per-team route
// (`[teamSlug]/actions.ts`), which is where the roster UI moved to. Duplicates
// here were left behind unused; they were removed because an exported
// "use server" function stays a live POST endpoint whether or not a page calls
// it, and these dropped the RosterMutationResult they got back, so a roster
// conflict would have failed silently.
