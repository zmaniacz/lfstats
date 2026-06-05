// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { revalidatePath } from "next/cache"
import {
  createCompetitionTeam,
  deleteCompetitionTeam,
  addPlayerToCompetitionTeam,
  removePlayerFromCompetitionTeam,
  searchPlayersForRoster,
  type PlayerSearchResult,
} from "@lfstats/db"
import { auth } from "@/auth"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const ok = roles.some((r) => r.role === "superAdmin" || r.role === "admin")
  if (!ok) throw new Error("Forbidden")
}

export async function createCompetitionTeamAction(
  competitionId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  const name = formData.get("name") as string
  const shortName = (formData.get("shortName") as string) || null
  await createCompetitionTeam({ competitionId, name, shortName })
  revalidatePath(`/admin/competitions/${competitionId}/teams`)
}

export async function deleteCompetitionTeamAction(
  competitionId: string,
  teamId: string,
): Promise<void> {
  await requireAdmin()
  await deleteCompetitionTeam(teamId)
  revalidatePath(`/admin/competitions/${competitionId}/teams`)
}

export async function addPlayerToTeamAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin()
  await addPlayerToCompetitionTeam(teamId, playerId)
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function removePlayerFromTeamAction(
  competitionId: string,
  teamId: string,
  entryId: string,
): Promise<void> {
  await requireAdmin()
  await removePlayerFromCompetitionTeam(entryId)
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function searchPlayersAction(
  query: string,
): Promise<PlayerSearchResult[]> {
  if (!query.trim()) return []
  return searchPlayersForRoster(query.trim())
}
