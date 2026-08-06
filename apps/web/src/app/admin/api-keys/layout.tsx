// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperAdmin } from "@/lib/auth-guards";

/**
 * Gates the whole /admin/api-keys subtree to superAdmin. Both src/proxy.ts and
 * the parent app/admin/layout.tsx admit admin and centerAdmin as well, which is
 * too broad for issuing credentials that can write to every center.
 *
 * This exists so any page added under /admin/api-keys inherits the restriction
 * instead of relying on whoever adds it to remember. It does NOT protect the
 * Server Actions — those guard themselves in actions.ts.
 */
export default async function ApiKeysLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!isSuperAdmin(session?.user?.roles)) redirect("/admin");

  return <>{children}</>;
}
