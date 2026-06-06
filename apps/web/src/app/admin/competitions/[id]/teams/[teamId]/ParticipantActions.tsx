// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Props = {
  playerId: string
  isMercenary: boolean
  addAction: (playerId: string) => Promise<void>
  mercAction: (playerId: string, isMercenary: boolean) => Promise<void>
}

export function ParticipantActions({ playerId, isMercenary, addAction, mercAction }: Props) {
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleAddToRoster() {
    setIsPending(true)
    try {
      await addAction(playerId)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  async function handleMercAction() {
    setIsPending(true)
    try {
      await mercAction(playerId, !isMercenary)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex gap-1 justify-end">
      {!isMercenary && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={handleAddToRoster}
        >
          Add to Roster
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={isPending}
        onClick={handleMercAction}
      >
        {isMercenary ? "Unmark Merc" : "Mark as Merc"}
      </Button>
    </div>
  )
}
