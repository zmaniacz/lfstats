// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listUserOAuthGrants } from "@lfstats/db";
import { McpSetupGuide } from "@/components/account/McpSetupGuide";
import { OAuthGrantsTable } from "@/components/account/OAuthGrantsTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mcpResourceUrl, siteOrigin } from "@/lib/oauth/server";
import { revokeMyOAuthGrantAction } from "./actions";

export const metadata: Metadata = { title: "Connected apps" };

export default async function ConnectedAppsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const [grants, origin] = await Promise.all([listUserOAuthGrants(session.user.id), siteOrigin()]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Connected apps</h1>
      <McpSetupGuide mcpUrl={mcpResourceUrl(origin)} />
      <Card>
        <CardHeader>
          <CardTitle>MCP clients</CardTitle>
          <CardDescription>
            Apps you&apos;ve allowed to read LFstats stats for you through the MCP server. Revoke
            any you no longer use or don&apos;t recognise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connected apps. When you approve an MCP client such as Claude or Cursor, it shows
              up here.
            </p>
          ) : (
            <OAuthGrantsTable grants={grants} revokeAction={revokeMyOAuthGrantAction} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
