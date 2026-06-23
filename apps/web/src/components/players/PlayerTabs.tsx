// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { type ReactNode, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const VALID_TABS = new Set(["charts", "games", "head-to-head"]);

export function PlayerTabs({
  chartsContent,
  gamesContent,
  headToHeadContent,
}: {
  chartsContent: ReactNode;
  gamesContent: ReactNode;
  headToHeadContent?: ReactNode;
}) {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const defaultTab = rawTab && VALID_TABS.has(rawTab) ? rawTab : "charts";

  const handleTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value === "charts") {
      params.delete("tab");
    } else {
      params.set("tab", value);
    }
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, []);

  return (
    <Tabs defaultValue={defaultTab} onValueChange={handleTabChange}>
      <TabsList>
        <TabsTrigger value="charts" className="data-active:text-primary">
          Charts
        </TabsTrigger>
        <TabsTrigger value="games" className="data-active:text-primary">
          Games
        </TabsTrigger>
        {headToHeadContent && (
          <TabsTrigger value="head-to-head" className="data-active:text-primary">
            Head to Head
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="charts" className="mt-6">
        {chartsContent}
      </TabsContent>
      <TabsContent value="games" className="mt-6">
        {gamesContent}
      </TabsContent>
      {headToHeadContent && (
        <TabsContent value="head-to-head" className="mt-6">
          {headToHeadContent}
        </TabsContent>
      )}
    </Tabs>
  );
}
