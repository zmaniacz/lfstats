// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listAllOAuthGrants, listApiKeys } from "@lfstats/db";
import { OAuthGrantsTable } from "@/components/account/OAuthGrantsTable";
import { isSuperAdmin } from "@/lib/auth-guards";
import { ApiKeysClient } from "./_components/ApiKeysClient";
import { createApiKeyAction, revokeApiKeyAction, revokeOAuthGrantAction } from "./actions";

export const metadata: Metadata = { title: "Admin: API Keys" };

export default async function ApiKeysPage() {
  // Also enforced by layout.tsx; repeated here so the key listing can never be
  // fetched by a non-superAdmin even if the layout is refactored away.
  const session = await auth();
  if (!isSuperAdmin(session?.user?.roles)) redirect("/admin");

  const [keys, grants] = await Promise.all([listApiKeys(), listAllOAuthGrants()]);

  return (
    <div className="space-y-8">
      <ApiKeysClient
        keys={keys}
        createAction={createApiKeyAction}
        revokeAction={revokeApiKeyAction}
      />
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">OAuth Grants</h2>
        <p className="text-sm text-muted-foreground">
          MCP clients that users have connected by signing in. Each grant reads stats as that user;
          revoking it signs the client out immediately. Users can revoke their own from Connected
          apps.
        </p>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active OAuth grants.</p>
        ) : (
          <OAuthGrantsTable grants={grants} revokeAction={revokeOAuthGrantAction} showUser />
        )}
      </section>
    </div>
  );
}
