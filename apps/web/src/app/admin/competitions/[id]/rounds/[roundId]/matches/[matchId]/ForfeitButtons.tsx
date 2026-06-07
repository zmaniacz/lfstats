// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Props = {
  team1Name: string
  team2Name: string
  gameNumber: number
  action: (forfeitingTeam: "team1" | "team2", gameNumber: number) => Promise<void>
}

export function ForfeitButtons({ team1Name, team2Name, gameNumber, action }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const router = useRouter()
  const isPending = isSubmitting || isRefreshing

  async function handleForfeit(team: "team1" | "team2") {
    setIsSubmitting(true)
    try {
      await action(team, gameNumber)
    } finally {
      setIsSubmitting(false)
    }
    startRefreshTransition(() => {
      router.refresh()
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
