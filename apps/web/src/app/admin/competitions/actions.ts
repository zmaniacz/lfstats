// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import {
  createCompetition,
  updateCompetition,
  deleteCompetition,
  bulkAssignGamesToCompetition,
  removeGameFromCompetition,
  removeGameFromMatch,
  getCompetitionById,
} from "@lfstats/db"
import { redirect } from "next/navigation"

async function requireCompetitionAccess(hostCenterId: string | null) {
  const session = await auth()
  const roles = session?.user?.roles ?? []

  const isSuperOrAdmin = roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin",
  )
  if (isSuperOrAdmin) return session!

  // centerAdmin may only manage competitions at their own center(s)
  const centerAdminCenterIds = roles
    .filter((r) => r.role === "centerAdmin" && r.centerId != null)
    .map((r) => r.centerId!)

  if (centerAdminCenterIds.length > 0 && hostCenterId != null && centerAdminCenterIds.includes(hostCenterId)) {
    return session!
  }

  throw new Error("Forbidden")
}

export async function createCompetitionAction(formData: FormData) {
  const hostCenterId = (formData.get("hostCenterId") as string) || null
  await requireCompetitionAccess(hostCenterId)

  const name = formData.get("name") as string
  const type = formData.get("type") as "competitive" | "social"
  const startDate = formData.get("startDate") as string
  const endDate = (formData.get("endDate") as string) || null
  const description = (formData.get("description") as string) || null

  const { slug } = await createCompetition({
    name,
    type,
    startDate,
    endDate,
    description,
    hostCenterId,
  })

  redirect(`/admin/competitions/${slug}`)
}

export async function updateCompetitionAction(id: string, formData: FormData) {
  const competition = await getCompetitionById(id)
  if (!competition) throw new Error("Not found")
  await requireCompetitionAccess(competition.hostCenterId ?? null)

  const name = formData.get("name") as string
  const type = formData.get("type") as "competitive" | "social"
  const startDate = formData.get("startDate") as string
  const endDate = (formData.get("endDate") as string) || null
  const description = (formData.get("description") as string) || null
  const hostCenterId = (formData.get("hostCenterId") as string) || null

  await updateCompetition(id, { name, type, startDate, endDate, description, hostCenterId })
  const updated = await getCompetitionById(id)
  redirect(`/admin/competitions/${updated!.slug}`)
}

export async function deleteCompetitionAction(id: string) {
  const competition = await getCompetitionById(id)
  if (!competition) throw new Error("Not found")
  await requireCompetitionAccess(competition.hostCenterId ?? null)
  await deleteCompetition(id)
  redirect("/admin/competitions")
}

export async function removeGameFromCompetitionAction(
  competitionId: string,
  gameId: string,
): Promise<void> {
  const competition = await getCompetitionById(competitionId)
  if (!competition) throw new Error("Not found")
  await requireCompetitionAccess(competition.hostCenterId ?? null)
  await removeGameFromCompetition(gameId)
  revalidatePath(`/admin/competitions/${competition.slug}`)
}

export async function unassignGameFromMatchAction(
  competitionId: string,
  matchGameId: string,
): Promise<void> {
  const competition = await getCompetitionById(competitionId)
  if (!competition) throw new Error("Not found")
  await requireCompetitionAccess(competition.hostCenterId ?? null)
  await removeGameFromMatch(matchGameId)
  revalidatePath(`/admin/competitions/${competition.slug}`)
}

export async function bulkAssignGamesAction(
  competitionId: string,
  formData: FormData,
) {
  const competition = await getCompetitionById(competitionId)
  if (!competition) throw new Error("Not found")
  await requireCompetitionAccess(competition.hostCenterId ?? null)

  const centerId = formData.get("centerId") as string
  const dateFrom = formData.get("dateFrom") as string
  const dateTo = formData.get("dateTo") as string

  const count = await bulkAssignGamesToCompetition(competitionId, centerId, dateFrom, dateTo)
  return count
}
