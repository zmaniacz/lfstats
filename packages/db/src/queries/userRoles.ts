// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { eq, inArray } from "drizzle-orm";
import { db } from "../client";
import { authUser, center, userRole } from "../schema";

export type UserRoleRow = typeof userRole.$inferSelect;

export type UserRoleWithCenter = {
  id: string;
  role: "admin" | "centerAdmin" | "uploader" | "superAdmin";
  centerId: string | null;
  centerName: string | null;
  centerShortName: string | null;
};

export type UserWithRoles = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  roles: UserRoleWithCenter[];
};

export async function getUserRoles(userId: string): Promise<UserRoleRow[]> {
  return db.select().from(userRole).where(eq(userRole.userId, userId));
}

export async function listAllUsers(): Promise<
  Pick<UserWithRoles, "id" | "name" | "email">[]
> {
  return db
    .select({ id: authUser.id, name: authUser.name, email: authUser.email })
    .from(authUser)
    .orderBy(authUser.email);
}

export async function listAllUsersWithRoles(): Promise<UserWithRoles[]> {
  const rows = await db
    .select({
      userId: authUser.id,
      name: authUser.name,
      email: authUser.email,
      image: authUser.image,
      roleId: userRole.id,
      role: userRole.role,
      centerId: userRole.centerId,
      centerName: center.name,
      centerShortName: center.shortName,
    })
    .from(authUser)
    .leftJoin(userRole, eq(userRole.userId, authUser.id))
    .leftJoin(center, eq(center.id, userRole.centerId))
    .orderBy(authUser.email);

  return aggregateUserRows(rows);
}

export async function listUsersWithRolesByCenter(
  centerId: string,
): Promise<UserWithRoles[]> {
  const userIds = await db
    .selectDistinct({ userId: userRole.userId })
    .from(userRole)
    .where(eq(userRole.centerId, centerId));

  if (userIds.length === 0) return [];

  const ids = userIds.map((r) => r.userId);

  const rows = await db
    .select({
      userId: authUser.id,
      name: authUser.name,
      email: authUser.email,
      image: authUser.image,
      roleId: userRole.id,
      role: userRole.role,
      centerId: userRole.centerId,
      centerName: center.name,
      centerShortName: center.shortName,
    })
    .from(authUser)
    .innerJoin(userRole, eq(userRole.userId, authUser.id))
    .leftJoin(center, eq(center.id, userRole.centerId))
    .where(inArray(authUser.id, ids))
    .orderBy(authUser.email);

  return aggregateUserRows(rows);
}

type RoleRow = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  roleId: string | null;
  role: "admin" | "centerAdmin" | "uploader" | "superAdmin" | null;
  centerId: string | null;
  centerName: string | null;
  centerShortName: string | null;
};

function aggregateUserRows(rows: RoleRow[]): UserWithRoles[] {
  const map = new Map<string, UserWithRoles>();

  for (const row of rows) {
    if (!map.has(row.userId)) {
      map.set(row.userId, {
        id: row.userId,
        name: row.name,
        email: row.email,
        image: row.image,
        roles: [],
      });
    }
    if (row.roleId && row.role) {
      map.get(row.userId)!.roles.push({
        id: row.roleId,
        role: row.role,
        centerId: row.centerId,
        centerName: row.centerName,
        centerShortName: row.centerShortName,
      });
    }
  }

  return Array.from(map.values());
}

export async function getRoleById(roleId: string): Promise<UserRoleRow | null> {
  const [row] = await db.select().from(userRole).where(eq(userRole.id, roleId));
  return row ?? null;
}

export async function grantRole(
  userId: string,
  role: "admin" | "centerAdmin" | "uploader" | "superAdmin",
  centerId?: string | null,
): Promise<void> {
  await db
    .insert(userRole)
    .values({ userId, role, centerId: centerId ?? null })
    .onConflictDoNothing();
}

export async function revokeRole(roleId: string): Promise<void> {
  await db.delete(userRole).where(eq(userRole.id, roleId));
}
