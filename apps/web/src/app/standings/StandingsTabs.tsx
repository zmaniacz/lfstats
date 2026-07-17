// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function StandingsTabs({
  defaultTab,
  hasFinals,
  standingsContent,
  finalsContent,
}: {
  defaultTab: "standings" | "finals";
  hasFinals: boolean;
  standingsContent: React.ReactNode;
  finalsContent: React.ReactNode;
}) {
  const [tab, setTab] = useState(defaultTab);

  function handleChange(next: string) {
    setTab(next as "standings" | "finals");
    const url = new URL(window.location.href);
    if (next === "standings") {
      url.searchParams.delete("tab");
    } else {
      url.searchParams.set("tab", next);
    }
    window.history.replaceState(null, "", url);
  }

  return (
    <Tabs value={tab} onValueChange={handleChange}>
      <TabsList>
        <TabsTrigger value="standings">Standings</TabsTrigger>
        {hasFinals && <TabsTrigger value="finals">Finals</TabsTrigger>}
      </TabsList>
      <TabsContent value="standings" className="space-y-6">
        {standingsContent}
      </TabsContent>
      {hasFinals && (
        <TabsContent value="finals" className="space-y-6">
          {finalsContent}
        </TabsContent>
      )}
    </Tabs>
  );
}
