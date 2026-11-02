// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canReceiveUnassignedGames, getUserRoles } from "@lfstats/db";
import { auth } from "@/auth";
import { UnassignedGamesToggle } from "@/components/notifications/UnassignedGamesToggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disableUnassignedGamesAction,
  enableUnassignedGamesAction,
  getUnassignedGamesEnabledAction,
  sendTestNotificationAction,
} from "./actions";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  if (!canReceiveUnassignedGames(await getUserRoles(session.user.id))) redirect("/");

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Notifications</h1>
      <Card>
        <CardHeader>
          <CardTitle>Unassigned games</CardTitle>
          <CardDescription>
            Get a notification on this device when a game uploaded to a competition is ready to
            assign to a match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vapidPublicKey ? (
            <UnassignedGamesToggle
              vapidPublicKey={vapidPublicKey}
              getEnabled={getUnassignedGamesEnabledAction}
              enable={enableUnassignedGamesAction}
              disable={disableUnassignedGamesAction}
              sendTest={sendTestNotificationAction}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Notifications aren&apos;t set up on this server yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
