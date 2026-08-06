// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { auth } from "@/auth";
import type { Session } from "next-auth";

type Role = { role: string; centerId: string | null };

export function isSuperAdmin(roles: Role[] | undefined): boolean {
  return (roles ?? []).some((r) => r.role === "superAdmin");
}

/**
 * Throws unless the caller is a superAdmin.
 *
 * Use for anything stricter than the /admin route group as a whole. Both
 * `src/proxy.ts` (Next 16's middleware) and `app/admin/layout.tsx` gate /admin
 * to superAdmin + admin + centerAdmin, so neither distinguishes a superAdmin —
 * that has to happen per page and per action.
 *
 * Server Actions are independently invocable POST endpoints, so every action
 * needs its own call; gating only the page that renders the UI protects nothing.
 */
export async function requireSuperAdmin(): Promise<Session> {
  const session = await auth();
  if (!isSuperAdmin(session?.user?.roles)) throw new Error("Forbidden");
  return session!;
}
