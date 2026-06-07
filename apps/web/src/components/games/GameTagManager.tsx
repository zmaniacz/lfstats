// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { GameTagSummary, GameTagListItem } from "@lfstats/db"

type Props = {
  gameId: string
  tags: GameTagSummary[]
  availableTags: GameTagListItem[]
  assignAction: (gameId: string, tagId: string) => Promise<void>
  removeAction: (gameId: string, tagId: string) => Promise<void>
}

export function GameTagManager({
  gameId,
  tags,
  availableTags,
  assignAction,
  removeAction,
}: Props) {
  const [isPending, setIsPending] = useState(false)
  const [, startRefreshTransition] = useTransition()
  const router = useRouter()

  const assignedIds = new Set(tags.map((t) => t.id))
  const unassigned = availableTags.filter((t) => !assignedIds.has(t.id) && !t.archived)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={async () => {
            setIsPending(true)
            try {
              await removeAction(gameId, tag.id)
            } finally {
              setIsPending(false)
            }
            startRefreshTransition(() => {
              router.refresh()
            })
          }}
          disabled={isPending}
          title="Click to remove tag"
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border hover:opacity-80 transition-opacity disabled:opacity-50"
          style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
        >
          {tag.name}
          <span className="text-[10px]">×</span>
        </button>
      ))}
      {unassigned.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isPending}>
              + Add Tag
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {unassigned.map((tag) => (
              <DropdownMenuItem
                key={tag.id}
                onClick={async () => {
                  setIsPending(true)
                  try {
                    await assignAction(gameId, tag.id)
                  } finally {
                    setIsPending(false)
                  }
                  startRefreshTransition(() => {
                    router.refresh()
                  })
                }}
              >
                <span
                  className="mr-2 inline-block w-2 h-2 rounded-full"
                  style={tag.color ? { backgroundColor: tag.color } : undefined}
                />
                {tag.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
