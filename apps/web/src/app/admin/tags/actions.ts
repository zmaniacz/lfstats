"use server"

import { auth } from "@/auth"
import {
  createTag,
  updateTag,
  archiveTag,
  unarchiveTag,
  deleteTag,
  mergeTag,
} from "@lfstats/db"
import { revalidatePath } from "next/cache"

async function requireCenterAdmin(centerId: string) {
  const session = await auth()
  const roles = session?.user?.roles ?? []
  const ok = roles.some(
    (r) =>
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === centerId),
  )
  if (!ok) throw new Error("Forbidden")
}

export async function createTagAction(centerId: string, formData: FormData) {
  await requireCenterAdmin(centerId)

  const name = formData.get("name") as string
  const color = (formData.get("color") as string) || null
  const description = (formData.get("description") as string) || null

  await createTag({ centerId, name, color, description })
  revalidatePath("/admin/tags", "layout")
}

export async function updateTagAction(
  id: string,
  centerId: string,
  formData: FormData,
) {
  await requireCenterAdmin(centerId)

  const name = formData.get("name") as string
  const color = (formData.get("color") as string) || null
  const description = (formData.get("description") as string) || null

  await updateTag(id, { name, color, description })
  revalidatePath("/admin/tags", "layout")
}

export async function archiveTagAction(id: string, centerId: string) {
  await requireCenterAdmin(centerId)
  await archiveTag(id)
  revalidatePath("/admin/tags", "layout")
}

export async function unarchiveTagAction(id: string, centerId: string) {
  await requireCenterAdmin(centerId)
  await unarchiveTag(id)
  revalidatePath("/admin/tags", "layout")
}

export async function deleteTagAction(id: string, centerId: string) {
  await requireCenterAdmin(centerId)
  await deleteTag(id)
  revalidatePath("/admin/tags", "layout")
}

export async function mergeTagAction(
  sourceId: string,
  targetId: string,
  centerId: string,
) {
  await requireCenterAdmin(centerId)
  await mergeTag(sourceId, targetId)
  revalidatePath("/admin/tags", "layout")
}
