// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHitDiff, formatMVP, formatPct, formatScore, formatWinRate } from "@/lib/format";
import { useMinGames } from "@/components/players/MinGamesContext";
import { STICKY_CALLSIGN_COL } from "@/lib/table-styles";
import type { LegacyCompetitionTopPlayer } from "@lfstats/db";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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

type PositionSortMetric = "avgLegacyMvp" | "avgAccuracy" | "winRate";
type PositionSortColumn = `p${1 | 2 | 3 | 4 | 5}_${PositionSortMetric}`;
type SortColumn =
  | "callsign"
  | "totalGames"
  | "avgLegacyMvp"
  | "totalLegacyMvp"
  | "avgMvp"
  | "avgScore"
  | "avgAccuracy"
  | "avgHitDiff"
  | "survivalRate"
  | "winRate"
  | PositionSortColumn;
type SortState = { column: SortColumn; dir: "asc" | "desc" };

function getSortValue(item: LegacyCompetitionTopPlayer, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return item.callsign.toLowerCase();
    case "totalGames":
      return item.totalGames;
    case "avgLegacyMvp":
      return item.avgLegacyMvp ?? -Infinity;
    case "totalLegacyMvp":
      return item.totalLegacyMvp ?? -Infinity;
    case "avgMvp":
      return item.avgMvp ?? -Infinity;
    case "avgScore":
      return item.avgScore;
    case "avgAccuracy":
      return item.avgAccuracy;
    case "avgHitDiff":
      return item.avgHitDiff;
    case "survivalRate":
      return item.survivalRate;
    case "winRate":
      return item.totalGames === 0 ? 0 : item.wins / item.totalGames;
  }
  const match = col.match(/^p(\d)_(avgLegacyMvp|avgAccuracy|winRate)$/);
  if (match) {
    const s = item.byPosition[Number(match[1])];
    if (!s) return -Infinity;
    if (match[2] === "avgLegacyMvp") return s.avgLegacyMvp ?? -Infinity;
    if (match[2] === "avgAccuracy") return s.avgAccuracy;
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

/**
 * The player averages for a competition with PDF-era games. Printed scorecards record only
 * end-of-game totals, so this shows what they share with TDF scorecards and ranks by the
 * legacy MVP (MVP*). A modern MVP column appears only when some games are TDF, and is never
 * averaged together with MVP*.
 */
export function LegacyTopPlayersTable({ players }: { players: LegacyCompetitionTopPlayer[] }) {
  const minGames = useMinGames();
  const [sort, setSort] = useState<SortState>({ column: "avgLegacyMvp", dir: "desc" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const showModernMvp = players.some((p) => p.tdfGames > 0);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter(
      (p) =>
        (minGames <= 0 || p.totalGames >= minGames) && (!q || p.callsign.toLowerCase().includes(q)),
    );
  }, [players, minGames, search]);

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
  const overallColumns = showModernMvp ? 10 : 9;

  return (
    <Card className="min-w-0 w-full overflow-hidden">
      <CardHeader>
        <CardTitle>Average Averages</CardTitle>
        <CardDescription>
          Legacy scorecards: only end-of-game totals exist. MVP* is the legacy formula and is not
          comparable with modern MVP
          {showModernMvp ? ", which covers this competition's TDF games only" : ""}. The
          per-position detail tables read the event stream and are left out; the position columns
          here cover each role.
        </CardDescription>
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
              <TableHead rowSpan={2} className={`align-bottom ${STICKY_CALLSIGN_COL}`}>
                Callsign
              </TableHead>
              <SortableHead column="totalGames" sort={sort} onSort={handleSort} rowSpan={2}>
                Games
              </SortableHead>
              <SortableHead column="avgLegacyMvp" sort={sort} onSort={handleSort} rowSpan={2}>
                Avg MVP*
              </SortableHead>
              <SortableHead column="totalLegacyMvp" sort={sort} onSort={handleSort} rowSpan={2}>
                Total MVP*
              </SortableHead>
              {showModernMvp && (
                <SortableHead column="avgMvp" sort={sort} onSort={handleSort} rowSpan={2}>
                  Avg MVP (TDF)
                </SortableHead>
              )}
              <SortableHead column="avgScore" sort={sort} onSort={handleSort} rowSpan={2}>
                Avg Score
              </SortableHead>
              <SortableHead column="avgAccuracy" sort={sort} onSort={handleSort} rowSpan={2}>
                Avg Accuracy
              </SortableHead>
              <SortableHead column="avgHitDiff" sort={sort} onSort={handleSort} rowSpan={2}>
                Avg Hit Diff
              </SortableHead>
              <SortableHead column="survivalRate" sort={sort} onSort={handleSort} rowSpan={2}>
                Survival
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
              {POSITIONS.map((pos) => (
                <Fragment key={pos.id}>
                  <SortableHead column={`p${pos.id}_avgLegacyMvp`} sort={sort} onSort={handleSort}>
                    <span className="pl-1 text-xs">Avg MVP*</span>
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
                <TableRow key={p.playerId} className="group">
                  <TableCell className={STICKY_CALLSIGN_COL}>
                    <Link href={`/players/${iplIdForUrl}`} className="hover:underline font-medium">
                      {p.callsign}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{p.totalGames}</TableCell>
                  <TableCell className="tabular-nums">{formatMVP(p.avgLegacyMvp)}</TableCell>
                  <TableCell className="tabular-nums">{formatMVP(p.totalLegacyMvp)}</TableCell>
                  {showModernMvp && (
                    <TableCell className="tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                  )}
                  <TableCell className="tabular-nums">
                    {formatScore(Math.round(p.avgScore))}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatPct(p.avgAccuracy)}</TableCell>
                  <TableCell className="tabular-nums">{formatHitDiff(p.avgHitDiff)}</TableCell>
                  <TableCell className="tabular-nums">{formatPct(p.survivalRate)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatWinRate(p.wins, p.totalGames)}
                  </TableCell>
                  {POSITIONS.map((pos) => {
                    const s = p.byPosition[pos.id];
                    return s ? (
                      <Fragment key={pos.id}>
                        <TableCell className="tabular-nums text-center border-l">
                          {formatMVP(s.avgLegacyMvp)}
                        </TableCell>
                        <TableCell className="tabular-nums text-center">
                          {formatPct(s.avgAccuracy)}
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
                  colSpan={overallColumns + POSITIONS.length * 3}
                  className="text-center text-muted-foreground py-8"
                >
                  {search ? "No players match the search." : "No player data for this competition."}
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
