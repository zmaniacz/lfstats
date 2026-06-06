// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { revalidatePath } from "next/cache"
import {
  assignGameToMatch,
  removeGameFromMatch,
  getCompetitionMatchById,
  createForfeitGame,
  getCompetitionHostCenterId,
} from "@lfstats/db"
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
  const tAuth = Date.now()
  await requireAdmin()
  process.stderr.write(`[assignGameAction] auth: ${Date.now() - tAuth}ms\n`)

  const gameNumber = parseInt(formData.get("gameNumber") as string, 10)
  const gameId = formData.get("gameId") as string
  const team1GameTeamId = formData.get("team1GameTeamId") as string
  const team2GameTeamId = formData.get("team2GameTeamId") as string

  const t0 = Date.now()
  await assignGameToMatch(matchId, gameId, gameNumber, team1GameTeamId, team2GameTeamId)
  process.stderr.write(`[assignGameAction] db write: ${Date.now() - t0}ms\n`)

  const t1 = Date.now()
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
  process.stderr.write(`[assignGameAction] revalidatePath: ${Date.now() - t1}ms\n`)
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

export async function createForfeitAction(
  competitionId: string,
  matchId: string,
  forfeitingTeam: "team1" | "team2",
  gameNumber: number,
): Promise<void> {
  await requireAdmin()

  const [centerId, match] = await Promise.all([
    getCompetitionHostCenterId(competitionId),
    getCompetitionMatchById(matchId),
  ])

  if (!centerId || !match) throw new Error("Competition or match not found")
  if (!centerId) throw new Error("Competition has no host center")

  await createForfeitGame({
    matchId,
    competitionId,
    centerId,
    gameNumber,
    team1Id: match.team1Id,
    team2Id: match.team2Id,
    forfeitingTeam,
  })

  revalidatePath(`/admin/competitions/${competitionId}/rounds/${match.roundId}/matches/${matchId}`)
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}
