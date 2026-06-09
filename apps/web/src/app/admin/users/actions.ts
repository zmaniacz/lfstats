// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { grantRole, revokeRole, getRoleById } from "@lfstats/db";
import { revalidatePath } from "next/cache";

type GrantableRole = "superAdmin" | "admin" | "centerAdmin" | "uploader";

type ActorRole = { role: string; centerId: string | null };

function isSuperAdmin(roles: ActorRole[]) {
  return roles.some((r) => r.role === "superAdmin");
}

function isAdminOrAbove(roles: ActorRole[]) {
  return roles.some((r) => r.role === "superAdmin" || r.role === "admin");
}

function getCenterAdminCenterIds(roles: ActorRole[]) {
  return roles
    .filter((r) => r.role === "centerAdmin" && r.centerId != null)
    .map((r) => r.centerId!);
}

export async function grantRoleAction(
  userId: string,
  role: GrantableRole,
  centerId: string | null,
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const actorRoles = session.user.roles ?? [];

  if (role === "superAdmin" || role === "admin") {
    if (!isSuperAdmin(actorRoles)) throw new Error("Forbidden");
  } else if (role === "centerAdmin") {
    if (!isAdminOrAbove(actorRoles)) throw new Error("Forbidden");
  } else if (role === "uploader") {
    if (!isAdminOrAbove(actorRoles)) {
      const centerAdminIds = getCenterAdminCenterIds(actorRoles);
      if (centerAdminIds.length === 0) throw new Error("Forbidden");
      if (centerId == null || !centerAdminIds.includes(centerId)) {
        throw new Error("Forbidden");
      }
    }
  } else {
    throw new Error("Forbidden");
  }

  await grantRole(userId, role, centerId);
  revalidatePath("/admin/users");
}

export async function revokeRoleAction(roleId: string): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const actorRoles = session.user.roles ?? [];

  const target = await getRoleById(roleId);
  if (!target) throw new Error("Not found");

  const { role: targetRole, centerId: targetCenterId } = target;

  if (targetRole === "superAdmin" || targetRole === "admin") {
    if (!isSuperAdmin(actorRoles)) throw new Error("Forbidden");
  } else if (targetRole === "centerAdmin") {
    if (!isAdminOrAbove(actorRoles)) throw new Error("Forbidden");
  } else if (targetRole === "uploader") {
    if (!isAdminOrAbove(actorRoles)) {
      const centerAdminIds = getCenterAdminCenterIds(actorRoles);
      if (
        centerAdminIds.length === 0 ||
        targetCenterId == null ||
        !centerAdminIds.includes(targetCenterId)
      ) {
        throw new Error("Forbidden");
      }
    }
  } else {
    throw new Error("Forbidden");
  }

  await revokeRole(roleId);
  revalidatePath("/admin/users");
}
