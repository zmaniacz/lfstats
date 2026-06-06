// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Props = {
  playerId: string
  isMercenary: boolean
  addAction: (playerId: string) => Promise<void>
  mercAction: (playerId: string, isMercenary: boolean) => Promise<void>
}

export function ParticipantActions({ playerId, isMercenary, addAction, mercAction }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="flex gap-1 justify-end">
      {!isMercenary && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={() => startTransition(async () => {
            await addAction(playerId)
            router.refresh()
          })}
        >
          Add to Roster
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        disabled={isPending}
        onClick={() => startTransition(async () => {
          await mercAction(playerId, !isMercenary)
          router.refresh()
        })}
      >
        {isMercenary ? "Unmark Merc" : "Mark as Merc"}
      </Button>
    </div>
  )
}
