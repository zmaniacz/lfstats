// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { PlayerLeaderboardItem } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMVP, formatPct, formatHitDiff, formatWinRate } from "@/lib/format";

const PAGE_SIZE = 10;

type SortColumn = "callsign" | "avgMvp" | "totalMvp" | "avgAccuracy" | "avgHitDiff" | "winRate";

type SortState = { column: SortColumn; dir: "asc" | "desc" };

function getSortValue(item: PlayerLeaderboardItem, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return item.callsign.toLowerCase();
    case "avgMvp":
      return item.avgMvp;
    case "totalMvp":
      return item.totalMvp;
    case "avgAccuracy":
      return item.avgAccuracy;
    case "avgHitDiff":
      return item.avgHitDiff;
    case "winRate":
      return item.totalGames === 0 ? 0 : item.wins / item.totalGames;
  }
}

function SortableHead({
  column,
  sort,
  onSort,
  children,
}: {
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  children: React.ReactNode;
}) {
  const isActive = sort.column === column;
  const Icon = isActive ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        <Icon className={`h-3 w-3 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

export function PlayersLeaderboardTable({
  players,
  title,
}: {
  players: PlayerLeaderboardItem[];
  title: string;
}) {
  const [sort, setSort] = useState<SortState>({ column: "avgMvp", dir: "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "asc" },
    );
    setPage(1);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.callsign.toLowerCase().includes(q));
  }, [players, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sort.column);
      const vb = getSortValue(b, sort.column);
      const cmp =
        typeof va === "number" ? va - (vb as number) : (va as string).localeCompare(vb as string);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search players…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-xs"
        />

        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead column="callsign" sort={sort} onSort={handleSort}>
                Callsign
              </SortableHead>
              <SortableHead column="avgMvp" sort={sort} onSort={handleSort}>
                Avg MVP
              </SortableHead>
              <SortableHead column="totalMvp" sort={sort} onSort={handleSort}>
                Total MVP
              </SortableHead>
              <SortableHead column="avgAccuracy" sort={sort} onSort={handleSort}>
                Avg Accuracy
              </SortableHead>
              <SortableHead column="avgHitDiff" sort={sort} onSort={handleSort}>
                Avg Hit Diff
              </SortableHead>
              <SortableHead column="winRate" sort={sort} onSort={handleSort}>
                Win Rate
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((p) => {
              const iplIdForUrl = p.iplId.startsWith("#") ? p.iplId.slice(1) : p.iplId;
              return (
                <TableRow key={p.iplId}>
                  <TableCell>
                    <Link href={`/players/${iplIdForUrl}`} className="hover:underline font-medium">
                      {p.callsign}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                  <TableCell className="tabular-nums">{formatMVP(p.totalMvp)}</TableCell>
                  <TableCell className="tabular-nums">{formatPct(p.avgAccuracy)}</TableCell>
                  <TableCell className="tabular-nums">{formatHitDiff(p.avgHitDiff)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatWinRate(p.wins, p.totalGames)}
                  </TableCell>
                </TableRow>
              );
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {search ? "No players match the search." : "No players found."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length === players.length
              ? `${players.length} players`
              : `${filtered.length} of ${players.length} players`}{" "}
            · page {page} of {totalPages}
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
      </CardContent>
    </Card>
  );
}
