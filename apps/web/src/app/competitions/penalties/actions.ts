// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { updatePenalty, deletePenalty } from "@lfstats/db"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const allowed = roles.some(
    (r) =>
      r.role === "superAdmin" ||
      r.role === "admin" ||
      r.role === "centerAdmin",
  )
  if (!allowed) throw new Error("Forbidden")
}

export async function updateCompetitionPenaltyAction(
  competitionId: string,
  penaltyId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin()
  await updatePenalty(penaltyId, {
    type: formData.get("type") as string,
    description: formData.get("description") as string,
    scoreValue: parseInt((formData.get("scoreValue") as string) || "0", 10),
    mvpValue: parseFloat((formData.get("mvpValue") as string) || "0"),
  })
  revalidatePath(`/competitions/penalties?competition=${competitionId}`)
}

export async function rescindCompetitionPenaltyAction(
  competitionId: string,
  penaltyId: string,
  rescinded: boolean,
): Promise<void> {
  await requireAdmin()
  await updatePenalty(penaltyId, { rescinded })
  revalidatePath(`/competitions/penalties?competition=${competitionId}`)
}

export async function deleteCompetitionPenaltyAction(
  competitionId: string,
  penaltyId: string,
): Promise<void> {
  await requireAdmin()
  await deletePenalty(penaltyId)
  revalidatePath(`/competitions/penalties?competition=${competitionId}`)
}
