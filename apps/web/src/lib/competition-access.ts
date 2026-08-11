// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { auth } from "@/auth";

/**
 * Competition management access: superAdmin and admin always pass; a centerAdmin passes
 * only for competitions hosted at one of their own centers.
 *
 * This lives outside any "use server" file on purpose — every export of such a file
 * becomes a callable Server Action endpoint, so a shared guard cannot be exported from
 * one. Sub-resource actions that must match the standings page's admin visibility (which
 * includes centerAdmin) should use this rather than a local admin-only requireAdmin().
 */
export async function requireCompetitionAccess(hostCenterId: string | null) {
  const session = await auth();
  const roles = session?.user?.roles ?? [];

  const isSuperOrAdmin = roles.some((r) => r.role === "superAdmin" || r.role === "admin");
  if (isSuperOrAdmin) return session!;

  // centerAdmin may only manage competitions at their own center(s)
  const centerAdminCenterIds = roles
    .filter((r) => r.role === "centerAdmin" && r.centerId != null)
    .map((r) => r.centerId!);

  if (
    centerAdminCenterIds.length > 0 &&
    hostCenterId != null &&
    centerAdminCenterIds.includes(hostCenterId)
  ) {
    return session!;
  }

  throw new Error("Forbidden");
}
