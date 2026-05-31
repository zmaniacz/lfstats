"use client"

import type { ReactNode } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ReplayTab } from "./ReplayTab"

export function GameTabs({
  scoreboardContent,
  gameId,
  duration,
}: {
  scoreboardContent: ReactNode
  gameId: string
  duration: number
}) {
  return (
    <Tabs defaultValue="scoreboard">
      <TabsList>
        <TabsTrigger value="scoreboard">Scoreboard</TabsTrigger>
        <TabsTrigger value="replay">Replay</TabsTrigger>
      </TabsList>
      <TabsContent value="scoreboard" className="mt-6">
        {scoreboardContent}
      </TabsContent>
      <TabsContent value="replay" className="mt-6">
        <ReplayTab gameId={gameId} duration={duration} />
      </TabsContent>
    </Tabs>
  )
}
