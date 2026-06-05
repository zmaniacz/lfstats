// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  team1Name: string
  team2Name: string
  gameNumber: number
  action: (forfeitingTeam: "team1" | "team2", gameNumber: number) => Promise<void>
}

export function ForfeitButtons({ team1Name, team2Name, gameNumber, action }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleForfeit(team: "team1" | "team2") {
    startTransition(async () => {
      await action(team, gameNumber)
    })
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => handleForfeit("team1")}
      >
        {team1Name} forfeits
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => handleForfeit("team2")}
      >
        {team2Name} forfeits
      </Button>
    </div>
  )
}
