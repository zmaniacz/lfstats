// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listApiKeys } from "@lfstats/db";
import { isSuperAdmin } from "@/lib/auth-guards";
import { ApiKeysClient } from "./_components/ApiKeysClient";
import { createApiKeyAction, revokeApiKeyAction } from "./actions";

export const metadata: Metadata = { title: "Admin: API Keys" };

export default async function ApiKeysPage() {
  // Also enforced by layout.tsx; repeated here so the key listing can never be
  // fetched by a non-superAdmin even if the layout is refactored away.
  const session = await auth();
  if (!isSuperAdmin(session?.user?.roles)) redirect("/admin");

  const keys = await listApiKeys();

  return (
    <ApiKeysClient
      keys={keys}
      createAction={createApiKeyAction}
      revokeAction={revokeApiKeyAction}
    />
  );
}
