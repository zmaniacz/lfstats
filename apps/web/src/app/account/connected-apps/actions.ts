// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { revokeOAuthGrant } from "@lfstats/db";
import { refresh, revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { RevokeGrantResult } from "@/components/account/OAuthGrantsTable";

/**
 * Revokes one of the caller's own grants. The revoke is scoped to the session's user, so a
 * family id belonging to someone else matches nothing.
 */
export async function revokeMyOAuthGrantAction(familyId: string): Promise<RevokeGrantResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const revoked = await revokeOAuthGrant(familyId, session.user.id);
  revalidatePath("/account/connected-apps");
  refresh();
  return revoked ? { ok: true } : { ok: false, error: "That app was already disconnected." };
}
