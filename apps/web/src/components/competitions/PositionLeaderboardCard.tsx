// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatMVP, formatScore } from "@/lib/format"
import Link from "next/link"
import { useMemo, useState } from "react"
import type { CompetitionPositionScorecard } from "@lfstats/db"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

const PAGE_SIZE = 5

type SortCol = "score" | "mvpPoints"
type SortDir = "asc" | "desc"

function SortableHead({
  col,
  sort,
  onSort,
  children,
}: {
  col: SortCol
  sort: { col: SortCol; dir: SortDir }
  onSort: (col: SortCol) => void
  children: React.ReactNode
}) {
  const active = sort.col === col
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className="text-right">
      <button
        className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
        onClick={() => onSort(col)}
      >
        {children}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  )
}

export function PositionLeaderboardCard({
  title,
  scorecards,
}: {
  title: string
  scorecards: CompetitionPositionScorecard[]
}) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "mvpPoints", dir: "desc" })
  const [page, setPage] = useState(1)

  function handleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    )
    setPage(1)
  }

  const sorted = useMemo(() => {
    return [...scorecards].sort((a, b) => {
      const diff = a[sort.col] - b[sort.col]
      return sort.dir === "asc" ? diff : -diff
    })
  }, [scorecards, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Card className="min-w-0 w-full overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Callsign</TableHead>
              <SortableHead col="score" sort={sort} onSort={handleSort}>Score</SortableHead>
              <SortableHead col="mvpPoints" sort={sort} onSort={handleSort}>MVP</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((s) => {
              const iplIdForUrl = s.iplId.startsWith("#") ? s.iplId.slice(1) : s.iplId
              return (
                <TableRow key={s.scorecardId}>
                  <TableCell className="font-medium">
                    <Link href={`/players/${iplIdForUrl}`} className="hover:underline">
                      {s.callsign}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    <Link href={`/games/${s.gameSlug}`} className="hover:underline">
                      {formatScore(s.score)}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    <Link href={`/games/${s.gameSlug}`} className="hover:underline">
                      {formatMVP(s.mvpPoints)}
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                  No data for this competition.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
