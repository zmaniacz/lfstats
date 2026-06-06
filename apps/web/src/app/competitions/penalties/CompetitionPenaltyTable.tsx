// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { CompetitionPenaltyRecord } from "@lfstats/db"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatScore } from "@/lib/format"
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react"

type Actions = {
  updateAction: (competitionId: string, penaltyId: string, formData: FormData) => Promise<void>
  rescindAction: (competitionId: string, penaltyId: string, rescinded: boolean) => Promise<void>
  deleteAction: (competitionId: string, penaltyId: string) => Promise<void>
}

type SortKey = "game" | "callsign" | "startTime" | "type" | "scoreValue" | "mvpValue"

type Props = {
  competitionId: string
  penalties: CompetitionPenaltyRecord[]
  canEdit: boolean
  actions: Actions
}

function gameLabel(p: CompetitionPenaltyRecord): string {
  if (p.roundNumber == null || p.matchNumber == null || p.gameNumber == null) {
    return `${p.centerName} · ${formatDateTime(p.gameStartTime)}`
  }
  const t1 = p.team1ShortName ?? "T1"
  const t2 = p.team2ShortName ?? "T2"
  return `R${p.roundNumber} M${p.matchNumber} G${p.gameNumber} - ${t1} v ${t2}`
}

function gameSortKey(p: CompetitionPenaltyRecord): string {
  if (p.roundNumber == null) return "z" // unassigned games sort last
  return `${String(p.roundNumber).padStart(3, "0")}-${String(p.matchNumber).padStart(3, "0")}-${String(p.gameNumber).padStart(3, "0")}`
}

export function CompetitionPenaltyTable({ competitionId, penalties, canEdit, actions }: Props) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("game")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return penalties.filter(
      (p) =>
        !q ||
        gameLabel(p).toLowerCase().includes(q) ||
        p.callsign.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q),
    )
  }, [penalties, search])

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "game":    return gameSortKey(a).localeCompare(gameSortKey(b)) * dir
        case "callsign": return a.callsign.localeCompare(b.callsign) * dir
        case "startTime": return (a.gameStartTime.getTime() - b.gameStartTime.getTime()) * dir
        case "type":    return a.type.localeCompare(b.type) * dir
        case "scoreValue": return (a.scoreValue - b.scoreValue) * dir
        case "mvpValue":   return (a.mvpValue - b.mvpValue) * dir
      }
    })
  }, [filtered, sortKey, sortDir])

  async function handleUpdate(penaltyId: string, formData: FormData) {
    setIsPending(true)
    try {
      await actions.updateAction(competitionId, penaltyId, formData)
      setEditingId(null)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  async function handleRescind(penaltyId: string, rescinded: boolean) {
    setIsPending(true)
    try {
      await actions.rescindAction(competitionId, penaltyId, rescinded)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  async function handleDelete(penaltyId: string) {
    setIsPending(true)
    try {
      await actions.deleteAction(competitionId, penaltyId)
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="size-3 ml-1 opacity-40" />
    return sortDir === "asc"
      ? <ArrowUp className="size-3 ml-1" />
      : <ArrowDown className="size-3 ml-1" />
  }

  function SortHead({ col, children }: { col: SortKey; children: React.ReactNode }) {
    return (
      <TableHead
        className="cursor-pointer select-none whitespace-nowrap"
        onClick={() => toggleSort(col)}
      >
        <span className="inline-flex items-center">
          {children}
          <SortIcon col={col} />
        </span>
      </TableHead>
    )
  }

  if (penalties.length === 0) {
    return <p className="text-sm text-muted-foreground">No penalties recorded for this competition.</p>
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search game, player or type…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead col="game">Game</SortHead>
              <SortHead col="callsign">Player</SortHead>
              <SortHead col="startTime">Started</SortHead>
              <SortHead col="type">Type</SortHead>
              <SortHead col="scoreValue">Score</SortHead>
              <SortHead col="mvpValue">MVP</SortHead>
              {canEdit && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground text-sm py-8">
                  No results for &ldquo;{search}&rdquo;
                </TableCell>
              </TableRow>
            ) : sorted.map((p) => (
              editingId === p.id ? (
                <TableRow key={p.id}>
                  <TableCell colSpan={canEdit ? 7 : 6} className="py-2">
                    <PenaltyEditForm
                      penalty={p}
                      onSubmit={(fd) => handleUpdate(p.id, fd)}
                      onCancel={() => setEditingId(null)}
                      isPending={isPending}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={p.id} className={p.rescinded ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    <Link href={`/games/${p.gameSlug}`} className="hover:underline">
                      {gameLabel(p)}
                    </Link>
                    {p.rescinded && <Badge variant="outline" className="ml-2 text-xs">Rescinded</Badge>}
                    {!p.inGame && <Badge variant="secondary" className="ml-2 text-xs">Post-game</Badge>}
                  </TableCell>
                  <TableCell>
                    {p.playerId ? (
                      <Link
                        href={`/players/${p.iplId?.replace(/^#/, "")}`}
                        className="hover:underline"
                      >
                        {p.callsign}
                      </Link>
                    ) : (
                      p.callsign
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-sm text-muted-foreground whitespace-nowrap">
                    {formatDateTime(p.gameStartTime)}
                  </TableCell>
                  <TableCell>{p.type}</TableCell>
                  <TableCell className="tabular-nums text-right">
                    {p.scoreValue !== 0 ? (
                      <span className={p.scoreValue < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                        {p.scoreValue > 0 ? "+" : ""}{formatScore(p.scoreValue)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {p.mvpValue !== 0 ? (
                      <span className={p.mvpValue < 0 ? "text-destructive" : "text-green-600 dark:text-green-400"}>
                        {p.mvpValue > 0 ? "+" : ""}{p.mvpValue.toFixed(3)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setEditingId(p.id)} disabled={isPending}>Edit</Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => handleRescind(p.id, !p.rescinded)} disabled={isPending}>
                          {p.rescinded ? "Restore" : "Rescind"}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)} disabled={isPending}>Delete</Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              )
            ))}
          </TableBody>
        </Table>
      </div>
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
    <form action={onSubmit} className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Type</Label>
        <Input name="type" defaultValue={penalty.type} className="h-8 text-sm w-36" disabled={isPending} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Description</Label>
        <Input name="description" defaultValue={penalty.description} className="h-8 text-sm w-48" disabled={isPending} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Score Value</Label>
        <Input name="scoreValue" type="number" defaultValue={penalty.scoreValue} className="h-8 text-sm w-28" disabled={isPending} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">MVP Value</Label>
        <Input name="mvpValue" type="number" step="0.001" defaultValue={penalty.mvpValue} className="h-8 text-sm w-28" disabled={isPending} />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  )
}
