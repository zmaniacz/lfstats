"use server"

import { auth } from "@/auth"
import {
  deleteGame,
  getGameCenterId,
  getGameSlugById,
  setGameExcluded,
  assignTagToGame,
  removeTagFromGame,
  addFavorite,
  removeFavorite,
} from "@lfstats/db"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

async function requireCenterAdmin(gameId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const centerId = await getGameCenterId(gameId)
  if (!centerId) throw new Error("Game not found")

  const roles = session.user.roles ?? []
  const allowed = roles.some(
    (r) =>
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === centerId),
  )
  if (!allowed) throw new Error("Forbidden")
  return { session, centerId }
}

async function revalidateGame(gameId: string) {
  const slug = await getGameSlugById(gameId)
  if (slug) revalidatePath(`/games/${slug}`)
}

export async function deleteGameAction(gameId: string) {
  await requireCenterAdmin(gameId)
  await deleteGame(gameId)
  redirect("/games")
}

export async function toggleExcludeAction(gameId: string, exclude: boolean) {
  await requireCenterAdmin(gameId)
  await setGameExcluded(gameId, exclude)
  await revalidateGame(gameId)
}

export async function assignTagAction(gameId: string, tagId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Unauthorized")

  const centerId = await getGameCenterId(gameId)
  if (!centerId) throw new Error("Game not found")

  const roles = session.user.roles ?? []
  const allowed = roles.some(
    (r) =>
      r.role === "admin" ||
      (r.role === "centerAdmin" && r.centerId === centerId),
  )
  if (!allowed) throw new Error("Forbidden")

  await assignTagToGame(gameId, tagId, session.user.email ?? undefined)
  await revalidateGame(gameId)
}

export async function removeTagAction(gameId: string, tagId: string) {
  await requireCenterAdmin(gameId)
  await removeTagFromGame(gameId, tagId)
  await revalidateGame(gameId)
}

export async function addFavoriteAction(gameId: string, note?: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  await addFavorite(session.user.id, gameId, note)
  await revalidateGame(gameId)
}

export async function removeFavoriteAction(gameId: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  await removeFavorite(session.user.id, gameId)
  await revalidateGame(gameId)
}
