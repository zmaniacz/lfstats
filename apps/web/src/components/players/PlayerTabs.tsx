// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function PlayerTabs({
  chartsContent,
  gamesContent,
}: {
  chartsContent: ReactNode
  gamesContent: ReactNode
}) {
  return (
    <Tabs defaultValue="charts">
      <TabsList>
        <TabsTrigger value="charts">Charts</TabsTrigger>
        <TabsTrigger value="games">Games</TabsTrigger>
      </TabsList>
      <TabsContent value="charts" className="mt-6">
        {chartsContent}
      </TabsContent>
      <TabsContent value="games" className="mt-6">
        {gamesContent}
      </TabsContent>
    </Tabs>
  )
}
