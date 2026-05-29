"use server"

import { auth } from "@/auth"
import {
  createCompetition,
  updateCompetition,
  deleteCompetition,
  bulkAssignGamesToCompetition,
} from "@lfstats/db"
import { redirect } from "next/navigation"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const ok = roles.some((r) => r.role === "admin" || r.role === "centerAdmin")
  if (!ok) throw new Error("Forbidden")
  return session!
}

export async function createCompetitionAction(formData: FormData) {
  await requireAdmin()

  const name = formData.get("name") as string
  const type = formData.get("type") as "competitive" | "social"
  const startDate = formData.get("startDate") as string
  const endDate = (formData.get("endDate") as string) || null
  const description = (formData.get("description") as string) || null
  const hostCenterId = (formData.get("hostCenterId") as string) || null

  const id = await createCompetition({
    name,
    type,
    startDate,
    endDate,
    description,
    hostCenterId,
  })

  redirect(`/admin/competitions/${id}`)
}

export async function updateCompetitionAction(id: string, formData: FormData) {
  await requireAdmin()

  const name = formData.get("name") as string
  const type = formData.get("type") as "competitive" | "social"
  const startDate = formData.get("startDate") as string
  const endDate = (formData.get("endDate") as string) || null
  const description = (formData.get("description") as string) || null
  const hostCenterId = (formData.get("hostCenterId") as string) || null

  await updateCompetition(id, { name, type, startDate, endDate, description, hostCenterId })
  redirect(`/admin/competitions/${id}`)
}

export async function deleteCompetitionAction(id: string) {
  await requireAdmin()
  await deleteCompetition(id)
  redirect("/admin/competitions")
}

export async function bulkAssignGamesAction(
  competitionId: string,
  formData: FormData,
) {
  await requireAdmin()

  const centerId = formData.get("centerId") as string
  const dateFrom = formData.get("dateFrom") as string
  const dateTo = formData.get("dateTo") as string

  const count = await bulkAssignGamesToCompetition(competitionId, centerId, dateFrom, dateTo)
  return count
}
