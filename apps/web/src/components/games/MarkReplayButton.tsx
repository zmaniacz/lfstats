// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type Props = {
  gameId: string
  isReplay: boolean
  action: (gameId: string) => Promise<void>
}

export function MarkReplayButton({ gameId, isReplay, action }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [open, setOpen] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const router = useRouter()
  const isPending = isSubmitting || isRefreshing

  if (isReplay) {
    return (
      <Button variant="default" size="sm" disabled>
        Replay
      </Button>
    )
  }

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      await action(gameId)
      setOpen(false)
    } finally {
      setIsSubmitting(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          Mark as Replay
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this game as a replay?</AlertDialogTitle>
          <AlertDialogDescription>
            This sets the game outcome to "Replay" and excludes it from all
            aggregates and leaderboards. This cannot be undone from this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} disabled={isPending}>
            {isPending ? "Saving…" : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
