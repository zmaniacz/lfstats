// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMVP, formatScore } from "@/lib/format";
import type { SoloStandingsRow } from "@lfstats/db";

type SortColumn =
  "rank" | "callsign" | "totalMvp" | "handicap" | "avgMvp" | "avgScore" | "gamesCounted";
type SortDir = "asc" | "desc";

function getSortValue(row: SoloStandingsRow, column: SortColumn): string | number {
  switch (column) {
    case "callsign":
      return row.callsign.toLowerCase();
    case "totalMvp":
      return row.totalMvp;
    case "handicap":
      return row.handicap;
    // Nulls (a player with no games) sort to the bottom of a descending sort.
    case "avgMvp":
      return row.avgMvp ?? -Infinity;
    case "avgScore":
      return row.avgScore ?? -Infinity;
    case "gamesCounted":
      return row.gamesCounted;
    case "rank":
      return row.totalMvp;
  }
}

function SortableHead({
  column,
  sort,
  onSort,
  align = "right",
  children,
}: {
  column: SortColumn;
  sort: { column: SortColumn; dir: SortDir };
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = sort.column === column;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        className={`flex items-center gap-1 hover:text-foreground transition-colors ${
          align === "right" ? "ml-auto" : ""
        }`}
        onClick={() => onSort(column)}
      >
        {children}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

/**
 * Solo standings. Total MVP is a best-N total (top 5 games per position, 10 for Scout)
 * with the handicap added once per counted game; Avg MVP and Avg Score are true averages
 * over every game played and carry no handicap. The two therefore do not reconcile, which
 * is intentional.
 */
export function SoloStandingsTable({ standings }: { standings: SoloStandingsRow[] }) {
  const [sort, setSort] = useState<{ column: SortColumn; dir: SortDir }>({
    column: "rank",
    dir: "desc",
  });

  // Rank is assigned from the query's Total MVP ordering, so it stays stable when the
  // user sorts by another column.
  const ranked = useMemo(() => standings.map((row, i) => ({ row, rank: i + 1 })), [standings]);

  const sorted = useMemo(() => {
    const copy = [...ranked];
    copy.sort((a, b) => {
      const av = getSortValue(a.row, sort.column);
      const bv = getSortValue(b.row, sort.column);
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") cmp = av.localeCompare(bv);
      else cmp = (av as number) - (bv as number);
      if (cmp === 0) cmp = a.rank - b.rank;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [ranked, sort]);

  function handleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: column === "callsign" ? "asc" : "desc" },
    );
  }

  if (standings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No players have been enrolled in this competition yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 text-right">#</TableHead>
          <SortableHead column="callsign" sort={sort} onSort={handleSort} align="left">
            Player
          </SortableHead>
          <SortableHead column="totalMvp" sort={sort} onSort={handleSort}>
            Total MVP
          </SortableHead>
          <SortableHead column="handicap" sort={sort} onSort={handleSort}>
            Handicap
          </SortableHead>
          <SortableHead column="avgMvp" sort={sort} onSort={handleSort}>
            Avg MVP
          </SortableHead>
          <SortableHead column="avgScore" sort={sort} onSort={handleSort}>
            Avg Score
          </SortableHead>
          <SortableHead column="gamesCounted" sort={sort} onSort={handleSort}>
            Games Counted
          </SortableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map(({ row, rank }) => (
          <TableRow key={row.playerId}>
            <TableCell className="text-right tabular-nums text-muted-foreground">{rank}</TableCell>
            <TableCell className="font-medium">
              {row.iplId ? (
                <Link href={`/players/${row.iplId.replace("#", "")}`} className="hover:underline">
                  {row.callsign}
                </Link>
              ) : (
                row.callsign
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatMVP(row.totalMvp)}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {row.handicap > 0 ? `+${row.handicap}` : row.handicap}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMVP(row.avgMvp)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.avgScore === null ? formatScore(null) : formatScore(Math.round(row.avgScore))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.gamesCounted}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
