// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CompetitionPenaltyRecord } from "@lfstats/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDateTime, formatScore } from "@/lib/format"

type Actions = {
  updateAction: (competitionId: string, penaltyId: string, formData: FormData) => Promise<void>
  rescindAction: (competitionId: string, penaltyId: string, rescinded: boolean) => Promise<void>
  deleteAction: (competitionId: string, penaltyId: string) => Promise<void>
}

type Props = {
  competitionId: string
  penalties: CompetitionPenaltyRecord[]
  canEdit: boolean
  actions: Actions
}

export function CompetitionPenaltyList({ competitionId, penalties, canEdit, actions }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRefreshing, startRefreshTransition] = useTransition()
  const router = useRouter()
  const isPending = isSubmitting || isRefreshing

  async function handleUpdate(penaltyId: string, formData: FormData) {
    setIsSubmitting(true)
    try {
      await actions.updateAction(competitionId, penaltyId, formData)
      setEditingId(null)
    } finally {
      setIsSubmitting(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  async function handleRescind(penaltyId: string, rescinded: boolean) {
    setIsSubmitting(true)
    try {
      await actions.rescindAction(competitionId, penaltyId, rescinded)
    } finally {
      setIsSubmitting(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  async function handleDelete(penaltyId: string) {
    setIsSubmitting(true)
    try {
      await actions.deleteAction(competitionId, penaltyId)
    } finally {
      setIsSubmitting(false)
    }
    startRefreshTransition(() => {
      router.refresh()
    })
  }

  if (penalties.length === 0) {
    return <p className="text-sm text-muted-foreground">No penalties recorded for this competition.</p>
  }

  return (
    <div className="space-y-2">
      {penalties.map((p) => (
        <div
          key={p.id}
          className={`rounded border p-3 space-y-2 ${p.rescinded ? "opacity-50" : ""}`}
        >
          {editingId === p.id ? (
            <PenaltyEditForm
              penalty={p}
              onSubmit={(fd) => handleUpdate(p.id, fd)}
              onCancel={() => setEditingId(null)}
              isPending={isPending}
            />
          ) : (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-sm">
                  {p.playerId ? (
                    <Link
                      href={`/players/${p.iplId?.replace(/^#/, "")}`}
                      className="font-semibold hover:underline"
                    >
                      {p.callsign}
                    </Link>
                  ) : (
                    <span className="font-semibold">{p.callsign}</span>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <Link href={`/games/${p.gameSlug}`} className="text-muted-foreground hover:underline text-xs">
                    {p.centerName} · {formatDateTime(p.gameStartTime)}
                  </Link>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{p.type}</span>
                  {p.rescinded && <Badge variant="outline" className="text-xs">Rescinded</Badge>}
                  {!p.inGame && <Badge variant="secondary" className="text-xs">Post-game</Badge>}
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                )}
                <div className="flex gap-4 text-xs tabular-nums">
                  {p.scoreValue !== 0 && (
                    <span className={p.scoreValue < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                      Score: {p.scoreValue > 0 ? "+" : ""}{formatScore(p.scoreValue)}
                    </span>
                  )}
                  {p.mvpValue !== 0 && (
                    <span className={p.mvpValue < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                      MVP: {p.mvpValue > 0 ? "+" : ""}{p.mvpValue.toFixed(3)}
                    </span>
                  )}
                  {p.scoreValue === 0 && p.mvpValue === 0 && (
                    <span className="text-muted-foreground">No score impact</span>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditingId(p.id)}
                    disabled={isPending}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleRescind(p.id, !p.rescinded)}
                    disabled={isPending}
                  >
                    {p.rescinded ? "Restore" : "Rescind"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={() => handleDelete(p.id)}
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PenaltyEditForm({
  penalty,
  onSubmit,
  onCancel,
  isPending,
}: {
  penalty: CompetitionPenaltyRecord
  onSubmit: (fd: FormData) => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Input name="type" defaultValue={penalty.type} className="h-8 text-sm" disabled={isPending} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Input name="description" defaultValue={penalty.description} className="h-8 text-sm" disabled={isPending} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Score Value</Label>
          <Input name="scoreValue" type="number" defaultValue={penalty.scoreValue} className="h-8 text-sm" disabled={isPending} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">MVP Value</Label>
          <Input name="mvpValue" type="number" step="0.001" defaultValue={penalty.mvpValue} className="h-8 text-sm" disabled={isPending} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  )
}
