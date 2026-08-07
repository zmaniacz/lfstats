// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { createApiKey, revokeApiKey } from "@lfstats/db";
import { refresh, revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth-guards";

// API keys grant write access across every center, so both actions below are
// superAdmin-only. These checks are the real boundary: a Server Action is an
// independently invocable POST endpoint, reachable whether or not the caller
// can render the page that normally triggers it.

/**
 * Reports validation failure instead of throwing: a thrown server action is
 * redacted to a bare digest in production, so the dialog would close with no
 * key and no explanation.
 */
export type CreateApiKeyResult = { ok: true; plaintext: string } | { ok: false; error: string };

export async function createApiKeyAction(formData: FormData): Promise<CreateApiKeyResult> {
  const session = await requireSuperAdmin();

  const name = ((formData.get("name") as string) || "").trim();
  if (!name) return { ok: false, error: "Name is required" };

  const { plaintext } = await createApiKey(name, session.user.id);
  revalidatePath("/admin/api-keys");
  refresh();
  return { ok: true, plaintext };
}

export async function revokeApiKeyAction(id: string): Promise<void> {
  await requireSuperAdmin();
  await revokeApiKey(id);
  revalidatePath("/admin/api-keys");
  refresh();
}
