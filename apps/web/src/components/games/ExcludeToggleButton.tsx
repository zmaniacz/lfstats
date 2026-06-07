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
  excluded: boolean
  action: (gameId: string, exclude: boolean) => Promise<void>
}

export function ExcludeToggleButton({ gameId, excluded, action }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [open, setOpen] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const router = useRouter()
  const isPending = isSubmitting || isRefreshing

  async function handleConfirm() {
    setIsSubmitting(true)
    try {
      await action(gameId, !excluded)
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
        <Button variant={excluded ? "default" : "outline"} size="sm" disabled={isPending}>
          {excluded ? "Unexclude from Stats" : "Exclude from Stats"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {excluded ? "Include this game in stats?" : "Exclude this game from stats?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {excluded
              ? "This game will appear in all aggregates and leaderboards."
              : "This game will be removed from all aggregates and leaderboards. It will still be visible in the archive view."}
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
