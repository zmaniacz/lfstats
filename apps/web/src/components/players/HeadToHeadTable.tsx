// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { HeadToHeadRow } from "@lfstats/db";
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
import { formatRatio } from "@/lib/format";
import { POSITIONS } from "@/lib/positions";

const PAGE_SIZE = 15;

const ALL_POSITIONS = ["1", "2", "3", "4", "5"];

type Relationship = "opponent" | "team" | "all";

type SortColumn =
  | "callsign"
  | "shot"
  | "shotBy"
  | "shotRatio"
  | "missiled"
  | "missiledBy"
  | "missileRatio"
  | "gamesPlayed";

type SortState = { column: SortColumn; dir: "asc" | "desc" };

type AggregatedRow = {
  targetPlayerId: string;
  targetIplId: string;
  targetCallsign: string;
  shotsHit: number;
  shotsHitBy: number;
  missileHits: number;
  missileHitsBy: number;
  gamesPlayed: number;
};

function getSortValue(row: AggregatedRow, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return row.targetCallsign.toLowerCase();
    case "shot":
      return row.shotsHit;
    case "shotBy":
      return row.shotsHitBy;
    case "shotRatio":
      return row.shotsHitBy === 0
        ? row.shotsHit === 0
          ? -1
          : Infinity
        : row.shotsHit / row.shotsHitBy;
    case "missiled":
      return row.missileHits;
    case "missiledBy":
      return row.missileHitsBy;
    case "missileRatio":
      return row.missileHitsBy === 0
        ? row.missileHits === 0
          ? -1
          : Infinity
        : row.missileHits / row.missileHitsBy;
    case "gamesPlayed":
      return row.gamesPlayed;
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

export function HeadToHeadTable({ rows }: { rows: HeadToHeadRow[] }) {
  const [relationship, setRelationship] = useState<Relationship>("opponent");
  const [mainPositions, setMainPositions] = useState<string[]>(ALL_POSITIONS);
  const [targetPositions, setTargetPositions] = useState<string[]>(ALL_POSITIONS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>({ column: "shot", dir: "desc" });
  const [page, setPage] = useState(1);

  const hasActiveFilters =
    relationship !== "opponent" ||
    mainPositions.length < ALL_POSITIONS.length ||
    targetPositions.length < ALL_POSITIONS.length;

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "desc" },
    );
    setPage(1);
  }

  function clearFilters() {
    setRelationship("opponent");
    setMainPositions(ALL_POSITIONS);
    setTargetPositions(ALL_POSITIONS);
    setPage(1);
  }

  const aggregated = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (relationship === "opponent" && row.isSameTeam) return false;
      if (relationship === "team" && !row.isSameTeam) return false;
      if (!mainPositions.includes(String(row.mainPosition))) return false;
      if (!targetPositions.includes(String(row.targetPosition))) return false;
      return true;
    });

    const byTarget = new Map<string, AggregatedRow>();
    for (const row of filtered) {
      const existing = byTarget.get(row.targetPlayerId);
      if (existing) {
        existing.shotsHit += row.shotsHit;
        existing.shotsHitBy += row.shotsHitBy;
        existing.missileHits += row.missileHits;
        existing.missileHitsBy += row.missileHitsBy;
        existing.gamesPlayed += row.gamesCount;
      } else {
        byTarget.set(row.targetPlayerId, {
          targetPlayerId: row.targetPlayerId,
          targetIplId: row.targetIplId,
          targetCallsign: row.targetCallsign,
          shotsHit: row.shotsHit,
          shotsHitBy: row.shotsHitBy,
          missileHits: row.missileHits,
          missileHitsBy: row.missileHitsBy,
          gamesPlayed: row.gamesCount,
        });
      }
    }
    return [...byTarget.values()];
  }, [rows, relationship, mainPositions, targetPositions]);

  const searched = useMemo(() => {
    if (!search) return aggregated;
    const q = search.toLowerCase();
    return aggregated.filter((r) => r.targetCallsign.toLowerCase().includes(q));
  }, [aggregated, search]);

  const sorted = useMemo(() => {
    return [...searched].sort((a, b) => {
      const va = getSortValue(a, sort.column);
      const vb = getSortValue(b, sort.column);
      const cmp =
        typeof va === "number"
          ? (va as number) - (vb as number)
          : (va as string).localeCompare(vb as string);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [searched, sort]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
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
            if (v) {
              setRelationship(v as Relationship);
              setPage(1);
            }
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="opponent">Opponent</ToggleGroupItem>
          <ToggleGroupItem value="team">Team</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>

        <span className="text-sm text-muted-foreground">Player</span>
        <ToggleGroup
          type="multiple"
          value={mainPositions}
          onValueChange={(vals) => {
            setMainPositions(vals);
            setPage(1);
          }}
          variant="outline"
          size="sm"
        >
          {ALL_POSITIONS.map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {POSITIONS[Number(p)]?.abbr ?? p}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <span className="text-sm text-muted-foreground">Target</span>
        <ToggleGroup
          type="multiple"
          value={targetPositions}
          onValueChange={(vals) => {
            setTargetPositions(vals);
            setPage(1);
          }}
          variant="outline"
          size="sm"
        >
          {ALL_POSITIONS.map((p) => (
            <ToggleGroupItem key={p} value={p}>
              {POSITIONS[Number(p)]?.abbr ?? p}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <Input
        placeholder="Search players..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="max-w-xs"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column="callsign" sort={sort} onSort={handleSort}>
              Player
            </SortableHead>
            <SortableHead column="shot" sort={sort} onSort={handleSort}>
              Shot
            </SortableHead>
            <SortableHead column="shotBy" sort={sort} onSort={handleSort}>
              Shot By
            </SortableHead>
            <SortableHead column="shotRatio" sort={sort} onSort={handleSort}>
              Shot Ratio
            </SortableHead>
            <SortableHead column="missiled" sort={sort} onSort={handleSort}>
              Missiled
            </SortableHead>
            <SortableHead column="missiledBy" sort={sort} onSort={handleSort}>
              Missiled By
            </SortableHead>
            <SortableHead column="missileRatio" sort={sort} onSort={handleSort}>
              Missile Ratio
            </SortableHead>
            <SortableHead column="gamesPlayed" sort={sort} onSort={handleSort}>
              Games
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => (
            <TableRow key={row.targetPlayerId}>
              <TableCell>
                <Link href={`/players/${row.targetIplId}`} className="hover:underline font-medium">
                  {row.targetCallsign}
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{row.shotsHit}</TableCell>
              <TableCell className="tabular-nums">{row.shotsHitBy}</TableCell>
              <TableCell className="tabular-nums">
                {formatRatio(row.shotsHit, row.shotsHitBy)}
              </TableCell>
              <TableCell className="tabular-nums">{row.missileHits}</TableCell>
              <TableCell className="tabular-nums">{row.missileHitsBy}</TableCell>
              <TableCell className="tabular-nums">
                {formatRatio(row.missileHits, row.missileHitsBy)}
              </TableCell>
              <TableCell className="tabular-nums">{row.gamesPlayed}</TableCell>
            </TableRow>
          ))}
          {pageRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No players match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length === aggregated.length
            ? `${aggregated.length} players`
            : `${sorted.length} of ${aggregated.length} players`}{" "}
          · page {page} of {Math.max(1, totalPages)}
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
