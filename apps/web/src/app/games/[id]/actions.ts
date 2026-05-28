"use server"

import { auth } from "@/auth"
import { deleteGame, getGameCenterId } from "@lfstats/db"
import { redirect } from "next/navigation"

export async function deleteGameAction(gameId: string) {
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

  await deleteGame(gameId)
  redirect("/games")
}
