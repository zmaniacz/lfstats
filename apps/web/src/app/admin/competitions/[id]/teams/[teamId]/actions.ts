"use server"

import { revalidatePath } from "next/cache"
import {
  addPlayerToCompetitionTeam,
  removePlayerFromCompetitionTeam,
  searchPlayersForRoster,
  type PlayerSearchResult,
} from "@lfstats/db"
import { auth } from "@/auth"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden")
}

export async function addPlayerAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin()
  await addPlayerToCompetitionTeam(teamId, playerId)
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function removePlayerAction(
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
