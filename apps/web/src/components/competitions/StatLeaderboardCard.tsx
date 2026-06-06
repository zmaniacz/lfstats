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
import { formatScore, formatMsDuration } from "@/lib/format"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

export type StatFormat = "integer" | "score" | "duration"

function applyFormat(v: number, format: StatFormat): string {
  switch (format) {
    case "integer": return v.toLocaleString("en-US")
    case "score": return formatScore(v)
    case "duration": return formatMsDuration(v)
  }
}

const PAGE_SIZE = 5

type SortDir = "asc" | "desc"

type Row = {
  playerId: string
  iplId: string
  callsign: string
  value: number
}

function SortableHead({
  active,
  dir,
  onSort,
  children,
}: {
  active: boolean
  dir: SortDir
  onSort: () => void
  children: React.ReactNode
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className="text-right">
      <button
        className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors"
        onClick={onSort}
      >
        {children}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  )
}

export function StatLeaderboardCard({
  title,
  colLabel,
  rows,
  format,
}: {
  title: string
  colLabel: string
  rows: Row[]
  format: StatFormat
}) {
  const [sort, setSort] = useState<SortDir>("desc")
  const [page, setPage] = useState(1)

  function toggleSort() {
    setSort((prev) => (prev === "asc" ? "desc" : "asc"))
    setPage(1)
  }

  const sorted = useMemo(
    () => [...rows].sort((a, b) => sort === "desc" ? b.value - a.value : a.value - b.value),
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
              <SortableHead active dir={sort} onSort={toggleSort}>
                {colLabel}
              </SortableHead>
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
                    {applyFormat(r.value, format)}
                  </TableCell>
                </TableRow>
              )
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
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
