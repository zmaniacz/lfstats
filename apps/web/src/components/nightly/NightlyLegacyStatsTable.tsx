// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { PdfNightlyScorecard } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
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
import { LegacyMvpDialog } from "@/components/sm5-pdf/LegacyMvpDialog";
import { formatGameName, formatHitDiff, formatPct, formatScore } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import { getTeamColor } from "@/lib/team-colors";

type SortKey =
  | "callsign"
  | "gameStartTime"
  | "position"
  | "score"
  | "legacyMvpPoints"
  | "hitDiff"
  | "medicHits"
  | "accuracy"
  | "shotsHitTeam";

const PAGE_SIZE = 10;

function getSortValue(row: PdfNightlyScorecard, key: SortKey): string | number {
  switch (key) {
    case "callsign":
      return row.callsign.toLowerCase();
    case "gameStartTime":
      return row.gameStartTime.getTime();
    default:
      return row[key];
  }
}

function SortableHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  center = true,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (col: SortKey) => void;
  className?: string;
  center?: boolean;
}) {
  const isActive = sortKey === col;
  const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        className={`flex items-center gap-1 w-full hover:text-foreground transition-colors ${center ? "justify-center" : ""}`}
        onClick={() => onSort(col)}
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

/**
 * Every scorecard from a night's legacy PDF-era games. A plain list: the nightly summary
 * and lifetime comparisons are aggregates, which legacy games never feed.
 */
export function NightlyLegacyStatsTable({ rows }: { rows: PdfNightlyScorecard[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("legacyMvpPoints");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [nameFilter, setNameFilter] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  const filtered = useMemo(() => {
    const lowerName = nameFilter.toLowerCase();
    return lowerName ? rows.filter((r) => r.callsign.toLowerCase().includes(lowerName)) : rows;
  }, [rows, nameFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  // A game's winner colours its link, as in the modern table.
  const winnerByGame = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) if (r.teamResult === "win") map.set(r.gameSlug, r.teamColourEnum);
    return map;
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sortHeadProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Legacy scorecards
          <Badge variant="outline" className="text-xs px-1 py-0">
            Legacy
          </Badge>
        </CardTitle>
        <CardDescription>
          Games from printed scorecards: end-of-game totals only, and MVP* uses the legacy formula.
          They don&apos;t count toward the nightly summaries, career stats or the rating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search players…"
          value={nameFilter}
          onChange={(e) => {
            setNameFilter(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />

        <div className="overflow-x-auto">
          <Table className="table-fixed min-w-200 w-full">
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Callsign"
                  col="callsign"
                  className="w-[16%]"
                  center={false}
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Game"
                  col="gameStartTime"
                  className="w-[12%]"
                  {...sortHeadProps}
                />
                <SortableHead label="Pos" col="position" className="w-[6%]" {...sortHeadProps} />
                <SortableHead label="Score" col="score" className="w-[8%]" {...sortHeadProps} />
                <SortableHead
                  label="MVP*"
                  col="legacyMvpPoints"
                  className="w-[8%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Hit Diff"
                  col="hitDiff"
                  className="w-[8%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Medic Hits"
                  col="medicHits"
                  className="w-[8%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Accuracy"
                  col="accuracy"
                  className="w-[8%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Shot Team"
                  col="shotsHitTeam"
                  className="w-[8%]"
                  {...sortHeadProps}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No results match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((row) => {
                  const winner = winnerByGame.get(row.gameSlug);
                  const winnerColor = winner !== undefined ? getTeamColor(winner)?.text : undefined;
                  return (
                    <TableRow key={row.id} className={row.eliminated ? "opacity-60" : ""}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/players/${row.iplId.replace(/^#/, "")}`}
                          className="hover:underline"
                        >
                          {row.callsign}
                        </Link>{" "}
                        {row.eliminated && (
                          <Badge variant="destructive" className="text-xs px-1 py-0">
                            OUT
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Link
                          href={`/games/${row.gameSlug}`}
                          className={`hover:underline ${winnerColor ?? ""}`}
                        >
                          {formatGameName(row.gameDescription, row.gameStartTime)}
                        </Link>
                      </TableCell>
                      <TableCell
                        className={`text-center text-xs ${getTeamColor(row.teamColourEnum)?.text ?? "text-muted-foreground"}`}
                      >
                        {getPosition(row.position)?.abbr ?? row.position}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatScore(row.score)}
                      </TableCell>
                      <TableCell className="text-center">
                        <LegacyMvpDialog
                          callsign={row.callsign}
                          totalMvp={row.legacyMvpPoints}
                          components={row.legacyMvp}
                        />
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatHitDiff(row.hitDiff)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.medicHits}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatPct(row.accuracy)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.shotsHitTeam}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length === rows.length
              ? `${rows.length} entries`
              : `${filtered.length} of ${rows.length} entries`}{" "}
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
