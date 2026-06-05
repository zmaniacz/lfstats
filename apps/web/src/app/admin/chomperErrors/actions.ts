// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server"

import { auth } from "@/auth"
import { archiveChomperJob, archiveAllChomperJobs } from "@lfstats/db"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const ok = roles.some((r) => r.role === "superAdmin" || r.role === "admin")
  if (!ok) throw new Error("Forbidden")
}

export async function archiveChomperJobAction(id: string) {
  await requireAdmin()
  await archiveChomperJob(id)
  revalidatePath("/admin/chomperErrors")
}

export async function archiveAllChomperJobsAction() {
  await requireAdmin()
  await archiveAllChomperJobs()
  revalidatePath("/admin/chomperErrors")
}
