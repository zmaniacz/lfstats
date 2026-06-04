"use server"

import { revalidatePath } from "next/cache"
import {
  createCompetitionRound,
  deleteCompetitionRound,
  createCompetitionMatch,
  deleteCompetitionMatch,
} from "@lfstats/db"
import { auth } from "@/auth"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  if (!roles.some((r) => r.role === "superAdmin" || r.role === "admin"))
    throw new Error("Forbidden")
}

export async function createRoundAction(
  competitionId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  const name = formData.get("name") as string
  const roundNumber = parseInt(formData.get("roundNumber") as string, 10)
  const type = formData.get("type") as "pool" | "finals"
  await createCompetitionRound({ competitionId, name, roundNumber, type })
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}

export async function deleteRoundAction(
  competitionId: string,
  roundId: string,
): Promise<void> {
  await requireAdmin()
  await deleteCompetitionRound(roundId)
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}

export async function createMatchAction(
  competitionId: string,
  roundId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  const team1Id = formData.get("team1Id") as string
  const team2Id = formData.get("team2Id") as string
  await createCompetitionMatch({ competitionId, roundId, team1Id, team2Id })
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}

export async function deleteMatchAction(
  competitionId: string,
  matchId: string,
): Promise<void> {
  await requireAdmin()
  await deleteCompetitionMatch(matchId)
  revalidatePath(`/admin/competitions/${competitionId}/rounds`)
}
