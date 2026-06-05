// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { auth } from "@/auth"
import {
  listAllUsersWithRoles,
  listUsersWithRolesByCenter,
  listAllUsers,
  type UserWithRoles,
} from "@lfstats/db"
import { getCenterList } from "@lfstats/db"
import { redirect } from "next/navigation"
import { UsersTableClient } from "./_components/UsersTableClient"
import type { GrantableRole } from "./_components/GrantRoleDialog"

function dedupeUsers(users: UserWithRoles[]): UserWithRoles[] {
  const map = new Map<string, UserWithRoles>()
  for (const u of users) {
    if (!map.has(u.id)) map.set(u.id, u)
  }
  return Array.from(map.values())
}

export default async function UsersPage() {
  const session = await auth()
  if (!session) redirect("/")

  const actorRoles = session.user.roles ?? []
  const isSuperAdmin = actorRoles.some((r) => r.role === "superAdmin")
  const isAdminOrAbove = actorRoles.some(
    (r) => r.role === "superAdmin" || r.role === "admin",
  )
  const centerAdminCenterIds = actorRoles
    .filter((r) => r.role === "centerAdmin" && r.centerId != null)
    .map((r) => r.centerId!)

  let users: UserWithRoles[]
  if (isAdminOrAbove) {
    users = await listAllUsersWithRoles()
  } else if (centerAdminCenterIds.length > 0) {
    const results = await Promise.all(
      centerAdminCenterIds.map((id) => listUsersWithRolesByCenter(id)),
    )
    users = dedupeUsers(results.flat())
  } else {
    redirect("/")
  }

  const [allUsers, allCenters] = await Promise.all([
    listAllUsers(),
    getCenterList(),
  ])

  const actorCanGrant: GrantableRole[] = []
  if (isSuperAdmin) {
    actorCanGrant.push("superAdmin", "admin", "centerAdmin", "uploader")
  } else if (isAdminOrAbove) {
    actorCanGrant.push("centerAdmin", "uploader")
  } else {
    actorCanGrant.push("uploader")
  }

  const centers = allCenters.map((c) => ({ id: c.id, name: c.name }))
  const actorCenterIds = isAdminOrAbove ? null : centerAdminCenterIds

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Users</h2>
      <UsersTableClient
        users={users}
        allUsers={allUsers}
        centers={centers}
        actorCanGrant={actorCanGrant}
        actorCenterIds={actorCenterIds}
        actorRoles={actorRoles}
      />
    </div>
  )
}
