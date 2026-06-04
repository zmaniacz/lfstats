"use server"

import { revalidatePath } from "next/cache"
import { assignGameToMatch, removeGameFromMatch } from "@lfstats/db"
import { auth } from "@/auth"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden")
}

export async function assignGameAction(
  competitionId: string,
  matchId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  const gameNumber = parseInt(formData.get("gameNumber") as string, 10)
  const gameId = formData.get("gameId") as string
  const team1GameTeamId = formData.get("team1GameTeamId") as string
  const team2GameTeamId = formData.get("team2GameTeamId") as string
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId)
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}

export async function removeGameAction(
  competitionId: string,
  matchId: string,
  matchGameId: string,
): Promise<void> {
  await requireAdmin()
  await removeGameFromMatch(matchGameId)
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}
