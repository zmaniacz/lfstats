// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { revalidatePath } from "next/cache"
import {
  addPlayerToCompetitionTeam,
  removePlayerFromCompetitionTeam,
  searchPlayersForRoster,
  updateCompetitionTeam,
  setPlayerMercenary,
  type PlayerSearchResult,
} from "@lfstats/db"
import { auth } from "@/auth"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden")
}

export async function updateTeamAction(
  competitionId: string,
  teamId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  const name = (formData.get("name") as string).trim()
  const shortName = (formData.get("shortName") as string).trim() || null
  if (!name) throw new Error("Team name is required")
  await updateCompetitionTeam(teamId, { name, shortName })
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
  revalidatePath(`/admin/competitions/${competitionId}/teams`)
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

export async function setMercenaryAction(
  competitionId: string,
  teamId: string,
  playerId: string,
  isMercenary: boolean,
): Promise<void> {
  await requireAdmin()
  await setPlayerMercenary(teamId, playerId, isMercenary)
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function addParticipantToRosterAction(
  competitionId: string,
  teamId: string,
  playerId: string,
): Promise<void> {
  await requireAdmin()
  await addPlayerToCompetitionTeam(teamId, playerId)
  revalidatePath(`/admin/competitions/${competitionId}/teams/${teamId}`)
}

export async function searchPlayersAction(
  query: string,
): Promise<PlayerSearchResult[]> {
  if (!query.trim()) return []
  return searchPlayersForRoster(query.trim())
}
