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
import { formatHitDiff, formatMVP, formatPct, formatWinRate } from "@/lib/format";
import type { CompetitionTopPlayer, PositionStats } from "@lfstats/db";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

const PAGE_SIZE = 10;

const POSITIONS = [
  { id: 1, label: "Commander" },
  { id: 2, label: "Heavy Weapons" },
  { id: 3, label: "Scout" },
  { id: 4, label: "Ammo Carrier" },
  { id: 5, label: "Medic" },
] as const;

const CSV_HEADERS = [
  "Callsign",
  "Avg MVP",
  "MVP / min",
  "Total MVP",
  "Avg Accuracy",
  "Avg Hit Diff",
  "Win Rate",
  "Wins",
  "Games",
  ...POSITIONS.flatMap((pos) => [
    `${pos.label} Avg MVP`,
    `${pos.label} Avg Accuracy`,
    `${pos.label} Win Rate`,
    `${pos.label} Wins`,
    `${pos.label} Games`,
  ]),
];

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(p: CompetitionTopPlayer): string {
  const positionFields = POSITIONS.flatMap((pos) => {
    const s: PositionStats | undefined = p.byPosition[pos.id];
    if (!s) return ["", "", "", "0", "0"];
    return [
      s.avgMvp !== null ? formatMVP(s.avgMvp) : "",
      s.avgAccuracy !== null ? formatPct(s.avgAccuracy) : "",
      formatWinRate(s.wins, s.totalGames),
      String(s.wins),
      String(s.totalGames),
    ];
  });

  return [
    p.callsign,
    formatMVP(p.avgMvp),
    formatMVP(p.mvpPerMinute),
    formatMVP(p.totalMvp),
    formatPct(p.avgAccuracy),
    formatHitDiff(p.avgHitDiff),
    formatWinRate(p.wins, p.totalGames),
    String(p.wins),
    String(p.totalGames),
    ...positionFields,
  ]
    .map(csvField)
    .join(",");
}

function downloadCsv(players: CompetitionTopPlayer[]) {
  const rows = [CSV_HEADERS.map(csvField).join(","), ...players.map(toCsvRow)];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `players-overall-${date}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

type PositionSortMetric = "avgMvp" | "avgAccuracy" | "winRate";
type PositionSortColumn = `p${1 | 2 | 3 | 4 | 5}_${PositionSortMetric}`;
type SortColumn =
  | "callsign"
  | "avgMvp"
  | "mvpPerMinute"
  | "totalMvp"
  | "avgAccuracy"
  | "avgHitDiff"
  | "winRate"
  | PositionSortColumn;
type SortState = { column: SortColumn; dir: "asc" | "desc" };

function getSortValue(item: CompetitionTopPlayer, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return item.callsign.toLowerCase();
    case "avgMvp":
      return item.avgMvp;
    case "mvpPerMinute":
      return item.mvpPerMinute;
    case "totalMvp":
      return item.totalMvp;
    case "avgAccuracy":
      return item.avgAccuracy;
    case "avgHitDiff":
      return item.avgHitDiff;
    case "winRate":
      return item.totalGames === 0 ? 0 : item.wins / item.totalGames;
  }
  // Position columns: "p1_avgMvp", "p2_winRate", etc.
  const match = col.match(/^p(\d)_(avgMvp|avgAccuracy|winRate)$/);
  if (match) {
    const s = item.byPosition[Number(match[1]) as 1 | 2 | 3 | 4 | 5];
    if (!s) return -Infinity;
    if (match[2] === "avgMvp") return s.avgMvp ?? -Infinity;
    if (match[2] === "avgAccuracy") return s.avgAccuracy ?? -Infinity;
    return s.totalGames === 0 ? -Infinity : s.wins / s.totalGames;
  }
  return 0;
}

function SortableHead({
  column,
  sort,
  onSort,
  children,
  rowSpan,
}: {
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  children: React.ReactNode;
  rowSpan?: number;
}) {
  const isActive = sort.column === column;
  const Icon = isActive ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead rowSpan={rowSpan}>
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

export function TopPlayersAveragesTable({ players }: { players: CompetitionTopPlayer[] }) {
  const [sort, setSort] = useState<SortState>({
    column: "avgMvp",
    dir: "desc",
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "desc" },
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

  return (
    <Card className="min-w-0 w-full overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Average Averages</CardTitle>
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom sticky left-0 bg-background z-10">
                  Callsign
                </TableHead>
                <SortableHead column="avgMvp" sort={sort} onSort={handleSort} rowSpan={2}>
                  Avg MVP
                </SortableHead>
                <SortableHead column="mvpPerMinute" sort={sort} onSort={handleSort} rowSpan={2}>
                  MVP / min
                </SortableHead>
                <SortableHead column="totalMvp" sort={sort} onSort={handleSort} rowSpan={2}>
                  Total MVP
                </SortableHead>
                <SortableHead column="avgAccuracy" sort={sort} onSort={handleSort} rowSpan={2}>
                  Avg Accuracy
                </SortableHead>
                <SortableHead column="avgHitDiff" sort={sort} onSort={handleSort} rowSpan={2}>
                  Avg Hit Diff
                </SortableHead>
                <SortableHead column="winRate" sort={sort} onSort={handleSort} rowSpan={2}>
                  Win Rate
                </SortableHead>
                {POSITIONS.map((pos) => (
                  <TableHead key={pos.id} colSpan={3} className="text-center">
                    {pos.label}
                  </TableHead>
                ))}
              </TableRow>
              <TableRow>
                {/* overall cols handled by rowSpan above + SortableHead rows */}
                {POSITIONS.map((pos) => (
                  <Fragment key={pos.id}>
                    <SortableHead column={`p${pos.id}_avgMvp`} sort={sort} onSort={handleSort}>
                      <span className="pl-1 text-xs">Avg MVP</span>
                    </SortableHead>
                    <SortableHead column={`p${pos.id}_avgAccuracy`} sort={sort} onSort={handleSort}>
                      <span className="text-xs">Accuracy</span>
                    </SortableHead>
                    <SortableHead column={`p${pos.id}_winRate`} sort={sort} onSort={handleSort}>
                      <span className="text-xs">Win Rate</span>
                    </SortableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((p) => {
                const iplIdForUrl = p.iplId.startsWith("#") ? p.iplId.slice(1) : p.iplId;
                return (
                  <TableRow key={p.playerId}>
                    <TableCell className="sticky left-0 bg-background z-10">
                      <Link
                        href={`/players/${iplIdForUrl}`}
                        className="hover:underline font-medium"
                      >
                        {p.callsign}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.mvpPerMinute)}</TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.totalMvp)}</TableCell>
                    <TableCell className="tabular-nums">{formatPct(p.avgAccuracy)}</TableCell>
                    <TableCell className="tabular-nums">{formatHitDiff(p.avgHitDiff)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatWinRate(p.wins, p.totalGames)}
                    </TableCell>
                    {POSITIONS.map((pos) => {
                      const s: PositionStats | undefined = p.byPosition[pos.id];
                      return s ? (
                        <Fragment key={pos.id}>
                          <TableCell className="tabular-nums text-center border-l">
                            {s.avgMvp !== null ? formatMVP(s.avgMvp) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-center">
                            {s.avgAccuracy !== null ? formatPct(s.avgAccuracy) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-center">
                            {formatWinRate(s.wins, s.totalGames)}
                          </TableCell>
                        </Fragment>
                      ) : (
                        <Fragment key={pos.id}>
                          <TableCell className="text-center text-muted-foreground border-l">
                            —
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">—</TableCell>
                          <TableCell className="text-center text-muted-foreground">—</TableCell>
                        </Fragment>
                      );
                    })}
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7 + POSITIONS.length * 3}
                    className="text-center text-muted-foreground py-8"
                  >
                    {search
                      ? "No players match the search."
                      : "No player data for this competition."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
