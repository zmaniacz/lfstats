// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { LbHeadToHeadRow } from "@lfstats/db";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPct, formatRatio, formatRecord } from "@/lib/format";

const PAGE_SIZE = 15;

type Relationship = "opponent" | "team";

type SortColumn =
  | "callsign"
  | "games"
  | "winRate"
  | "steals"
  | "stolenBy"
  | "stealRatio"
  | "blocks"
  | "blockedBy"
  | "blockRatio"
  | "passesTo"
  | "passesFrom";

type SortState = { column: SortColumn; dir: "asc" | "desc" };

type Column = { column: Exclude<SortColumn, "callsign">; label: string };

const OPPONENT_COLUMNS: Column[] = [
  { column: "games", label: "Games" },
  { column: "winRate", label: "Record vs" },
  { column: "steals", label: "Stole From" },
  { column: "stolenBy", label: "Stolen By" },
  { column: "stealRatio", label: "Steal Ratio" },
  { column: "blocks", label: "Blocked" },
  { column: "blockedBy", label: "Blocked By" },
  { column: "blockRatio", label: "Block Ratio" },
];

const TEAM_COLUMNS: Column[] = [
  { column: "games", label: "Games" },
  { column: "winRate", label: "Record with" },
  { column: "passesTo", label: "Passes To" },
  { column: "passesFrom", label: "Passes From" },
];

// A ratio with nothing on the bottom sorts above every finite one; 0/0 sorts last.
function ratioSortValue(num: number, den: number): number {
  if (den === 0) return num === 0 ? -1 : Infinity;
  return num / den;
}

function getSortValue(row: LbHeadToHeadRow, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return row.targetCallsign.toLowerCase();
    case "winRate":
      return row.games === 0 ? 0 : row.wins / row.games;
    case "stealRatio":
      return ratioSortValue(row.steals, row.stolenBy);
    case "blockRatio":
      return ratioSortValue(row.blocks, row.blockedBy);
    default:
      return row[col];
  }
}

function formatCell(row: LbHeadToHeadRow, col: Column["column"]): string {
  switch (col) {
    case "winRate":
      return `${formatRecord(row.wins, row.losses, row.draws)} (${formatPct(row.games === 0 ? null : row.wins / row.games)})`;
    case "stealRatio":
      return formatRatio(row.steals, row.stolenBy);
    case "blockRatio":
      return formatRatio(row.blocks, row.blockedBy);
    default:
      return String(row[col]);
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

export function LbHeadToHeadTable({ rows }: { rows: LbHeadToHeadRow[] }) {
  const [relationship, setRelationship] = useState<Relationship>("opponent");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "games", dir: "desc" });
  const [page, setPage] = useState(1);

  const columns = relationship === "opponent" ? OPPONENT_COLUMNS : TEAM_COLUMNS;

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "desc" },
    );
    setPage(1);
  }

  function handleRelationship(next: Relationship) {
    setRelationship(next);
    // A sort column the other view doesn't have falls back to games.
    const nextColumns = next === "opponent" ? OPPONENT_COLUMNS : TEAM_COLUMNS;
    if (sort.column !== "callsign" && !nextColumns.some((c) => c.column === sort.column)) {
      setSort({ column: "games", dir: "desc" });
    }
    setPage(1);
  }

  const inRelationship = useMemo(
    () => rows.filter((r) => r.isSameTeam === (relationship === "team")),
    [rows, relationship],
  );

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inRelationship;
    return inRelationship.filter((r) => r.targetCallsign.toLowerCase().includes(q));
  }, [inRelationship, search]);

  const sorted = useMemo(() => {
    return [...searched].sort((a, b) => {
      const va = getSortValue(a, sort.column);
      const vb = getSortValue(b, sort.column);
      const cmp =
        typeof va === "number" ? va - (vb as number) : (va as string).localeCompare(vb as string);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [searched, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No head-to-head data found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={relationship}
          onValueChange={(v) => {
            if (v) handleRelationship(v as Relationship);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="opponent">Opponents</ToggleGroupItem>
          <ToggleGroupItem value="team">Teammates</ToggleGroupItem>
        </ToggleGroup>
        <Input
          placeholder="Search players..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column="callsign" sort={sort} onSort={handleSort}>
              Player
            </SortableHead>
            {columns.map((c) => (
              <SortableHead key={c.column} column={c.column} sort={sort} onSort={handleSort}>
                {c.label}
              </SortableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => {
            const iplIdForUrl = row.targetIplId.startsWith("#")
              ? row.targetIplId.slice(1)
              : row.targetIplId;
            return (
              <TableRow key={row.targetPlayerId}>
                <TableCell>
                  <Link
                    href={`/players/${iplIdForUrl}?game=lb`}
                    className="hover:underline font-medium"
                  >
                    {row.targetCallsign}
                  </Link>
                </TableCell>
                {columns.map((c) => (
                  <TableCell key={c.column} className="tabular-nums">
                    {formatCell(row, c.column)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {pageRows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={1 + columns.length}
                className="text-center text-muted-foreground py-8"
              >
                No players match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length === inRelationship.length
            ? `${inRelationship.length} players`
            : `${sorted.length} of ${inRelationship.length} players`}{" "}
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
    </div>
  );
}
