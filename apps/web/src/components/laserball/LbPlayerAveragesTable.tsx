// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAvg, formatMs, formatWinRate } from "@/lib/format";
import { useMinGames } from "@/components/players/MinGamesContext";
import { STICKY_CALLSIGN_COL } from "@/lib/table-styles";
import type { LbPlayerAverages } from "@lfstats/db";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 10;

type SortColumn =
  | "callsign"
  | "gamesPlayed"
  | "winRate"
  | "totalGoals"
  | "avgGoals"
  | "avgAssists"
  | "avgSteals"
  | "avgBlocks"
  | "avgClears"
  | "avgPasses"
  | "avgPossessionMs";
type SortState = { column: SortColumn; dir: "asc" | "desc" };

const COLUMNS: { column: Exclude<SortColumn, "callsign">; label: string }[] = [
  { column: "gamesPlayed", label: "Games" },
  { column: "winRate", label: "Win Rate" },
  { column: "totalGoals", label: "Total Goals" },
  { column: "avgGoals", label: "Avg Goals" },
  { column: "avgAssists", label: "Avg Assists" },
  { column: "avgSteals", label: "Avg Steals" },
  { column: "avgBlocks", label: "Avg Blocks" },
  { column: "avgClears", label: "Avg Clears" },
  { column: "avgPasses", label: "Avg Passes" },
  { column: "avgPossessionMs", label: "Avg Possession" },
];

function getSortValue(p: LbPlayerAverages, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return p.callsign.toLowerCase();
    case "winRate":
      return p.gamesPlayed === 0 ? 0 : p.wins / p.gamesPlayed;
    default:
      return p[col];
  }
}

function formatCell(p: LbPlayerAverages, col: Exclude<SortColumn, "callsign">): string {
  switch (col) {
    case "gamesPlayed":
    case "totalGoals":
      return p[col].toLocaleString("en-US");
    case "winRate":
      return formatWinRate(p.wins, p.gamesPlayed);
    case "avgPossessionMs":
      return formatMs(p.avgPossessionMs);
    default:
      return formatAvg(p[col]);
  }
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(players: LbPlayerAverages[]) {
  const header = ["Callsign", "Wins", ...COLUMNS.map((c) => c.label)];
  const rows = [
    header.map(csvField).join(","),
    ...players.map((p) =>
      [p.callsign, String(p.wins), ...COLUMNS.map((c) => formatCell(p, c.column))]
        .map(csvField)
        .join(","),
    ),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `laserball-players-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
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

export function LbPlayerAveragesTable({ players }: { players: LbPlayerAverages[] }) {
  const minGames = useMinGames();
  const [sort, setSort] = useState<SortState>({ column: "avgGoals", dir: "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Back to page 1 when the min-games filter changes (adjust-during-render, not an effect)
  const [pageMinGames, setPageMinGames] = useState(minGames);
  if (pageMinGames !== minGames) {
    setPageMinGames(minGames);
    setPage(1);
  }

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "desc" },
    );
    setPage(1);
  }

  const gamesFiltered = useMemo(() => {
    if (minGames <= 0) return players;
    return players.filter((p) => p.gamesPlayed >= minGames);
  }, [players, minGames]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return gamesFiltered;
    return gamesFiltered.filter((p) => p.callsign.toLowerCase().includes(q));
  }, [gamesFiltered, search]);

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

  return (
    <Card className="min-w-0 w-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Player Averages</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(sorted)}
          disabled={sorted.length === 0}
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search players…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
        <Table>
          <TableHeader>
            <TableRow className="group">
              <TableHead className={STICKY_CALLSIGN_COL}>Callsign</TableHead>
              {COLUMNS.map((c) => (
                <SortableHead key={c.column} column={c.column} sort={sort} onSort={handleSort}>
                  {c.label}
                </SortableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((p) => {
              const iplIdForUrl = p.iplId.startsWith("#") ? p.iplId.slice(1) : p.iplId;
              return (
                <TableRow key={p.playerId} className="group">
                  <TableCell className={STICKY_CALLSIGN_COL}>
                    <Link
                      href={`/players/${iplIdForUrl}?game=lb`}
                      className="hover:underline font-medium"
                    >
                      {p.callsign}
                    </Link>
                  </TableCell>
                  {COLUMNS.map((c) => (
                    <TableCell key={c.column} className="tabular-nums">
                      {formatCell(p, c.column)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={1 + COLUMNS.length}
                  className="text-center text-muted-foreground py-8"
                >
                  {search
                    ? "No players match the search."
                    : players.length > 0
                      ? `No players with ${minGames}+ games. Lower Min. Games to see them.`
                      : "No Laserball players in this view."}
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
