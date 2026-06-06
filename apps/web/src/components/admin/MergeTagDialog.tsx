// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GameTagListItem } from "@lfstats/db"

type Props = {
  sourceTag: GameTagListItem
  availableTags: GameTagListItem[]
  centerId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  action: (sourceId: string, targetId: string, centerId: string) => Promise<void>
}

export function MergeTagDialog({
  sourceTag,
  availableTags,
  centerId,
  open,
  onOpenChange,
  action,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const [targetId, setTargetId] = useState("")

  const targets = availableTags.filter((t) => t.id !== sourceTag.id)

  function handleConfirm() {
    if (!targetId) return
    startTransition(async () => {
      await action(sourceTag.id, targetId, centerId)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge &ldquo;{sourceTag.name}&rdquo;</DialogTitle>
          <DialogDescription>
            All game assignments from &ldquo;{sourceTag.name}&rdquo; will be moved to the
            target tag, then &ldquo;{sourceTag.name}&rdquo; will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Merge into</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger>
              <SelectValue placeholder="Select target tag" />
            </SelectTrigger>
            <SelectContent>
              {targets.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!targetId || isPending}
            onClick={handleConfirm}
          >
            {isPending ? "Merging…" : "Merge & Delete Source"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
