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
import { formatScore, formatMsDuration, formatMs } from "@/lib/format"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { StatFormat } from "./StatLeaderboardCard"

const PAGE_SIZE = 5

type SortCol = "value1" | "value2"
type SortDir = "asc" | "desc"

function applyFormat(v: number, format: StatFormat): string {
  switch (format) {
    case "integer": return v.toLocaleString("en-US")
    case "score": return formatScore(v)
    case "duration": return formatMsDuration(v)
    case "decimal": return v.toFixed(2)
    case "ms": return formatMs(v)
  }
}

type Row = {
  playerId: string
  iplId: string
  callsign: string
  value1: number
  value2: number
}

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

export function DualStatLeaderboardCard({
  title,
  col1Label,
  col2Label,
  rows,
  format1,
  format2,
}: {
  title: string
  col1Label: string
  col2Label: string
  rows: Row[]
  format1: StatFormat
  format2: StatFormat
}) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "value1", dir: "desc" })
  const [page, setPage] = useState(1)

  function handleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "desc" }
    )
    setPage(1)
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => {
      const diff = a[sort.col] - b[sort.col]
      return sort.dir === "asc" ? diff : -diff
    }),
    [rows, sort],
  )

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
              <SortableHead col="value1" sort={sort} onSort={handleSort}>{col1Label}</SortableHead>
              <SortableHead col="value2" sort={sort} onSort={handleSort}>{col2Label}</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((r) => {
              const iplIdForUrl = r.iplId.startsWith("#") ? r.iplId.slice(1) : r.iplId
              return (
                <TableRow key={r.playerId}>
                  <TableCell className="font-medium">
                    <Link href={`/players/${iplIdForUrl}`} className="hover:underline">
                      {r.callsign}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {applyFormat(r.value1, format1)}
                  </TableCell>
                  <TableCell className="tabular-nums text-right">
                    {applyFormat(r.value2, format2)}
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
