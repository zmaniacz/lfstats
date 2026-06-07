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
  getCompetitionById,
  getCompetitionTeamById,
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
  const comp = await getCompetitionById(competitionId)
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/teams`)
}

export async function deleteCompetitionTeamAction(
  competitionId: string,
  teamId: string,
): Promise<void> {
  await requireAdmin()
  await deleteCompetitionTeam(teamId)
  const comp = await getCompetitionById(competitionId)
  if (comp) revalidatePath(`/admin/competitions/${comp.slug}/teams`)
}

export async function addPlayerToTeamAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin()
  await addPlayerToCompetitionTeam(teamId, playerId)
  const [comp, team] = await Promise.all([getCompetitionById(competitionId), getCompetitionTeamById(teamId)])
  if (comp && team) revalidatePath(`/admin/competitions/${comp.slug}/teams/${team.slug}`)
}

export async function removePlayerFromTeamAction(
  competitionId: string,
  teamId: string,
  entryId: string,
): Promise<void> {
  await requireAdmin()
  await removePlayerFromCompetitionTeam(entryId)
  const [comp, team] = await Promise.all([getCompetitionById(competitionId), getCompetitionTeamById(teamId)])
  if (comp && team) revalidatePath(`/admin/competitions/${comp.slug}/teams/${team.slug}`)
}

export async function searchPlayersAction(
  query: string,
): Promise<PlayerSearchResult[]> {
  if (!query.trim()) return []
  return searchPlayersForRoster(query.trim())
}
