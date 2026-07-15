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
import { formatHitDiff, formatMVP, formatPct, formatScore, formatWinRate } from "@/lib/format";
import { useMinGames } from "@/components/players/MinGamesContext";
import type { CompetitionAmmoPlayer } from "@lfstats/db";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

type SortColumn =
  | "callsign"
  | "winRate"
  | "avgScore"
  | "totalScore"
  | "avgMvp"
  | "totalMvp"
  | "avgAccuracy"
  | "avgHitDiff"
  | "avgUptime"
  | "avgMedicHits"
  | "avgAmmoBoost"
  | "avgResuppliesGiven"
  | "avgDoubleResuppliesGiven";
type SortState = { column: SortColumn; dir: "asc" | "desc" };

function getSortValue(item: CompetitionAmmoPlayer, col: SortColumn): string | number {
  switch (col) {
    case "callsign":
      return item.callsign.toLowerCase();
    case "winRate":
      return item.totalGames === 0 ? 0 : item.wins / item.totalGames;
    case "avgScore":
      return item.avgScore;
    case "totalScore":
      return item.totalScore;
    case "avgMvp":
      return item.avgMvp;
    case "totalMvp":
      return item.totalMvp;
    case "avgAccuracy":
      return item.avgAccuracy;
    case "avgHitDiff":
      return item.avgHitDiff;
    case "avgUptime":
      return item.avgUptime;
    case "avgMedicHits":
      return item.avgMedicHits;
    case "avgAmmoBoost":
      return item.avgAmmoBoost ?? -Infinity;
    case "avgResuppliesGiven":
      return item.avgResuppliesGiven ?? -Infinity;
    case "avgDoubleResuppliesGiven":
      return item.avgDoubleResuppliesGiven ?? -Infinity;
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

export function AmmoPlayersTable({ players }: { players: CompetitionAmmoPlayer[] }) {
  const minGames = useMinGames();
  const [sort, setSort] = useState<SortState>({
    column: "avgMvp",
    dir: "desc",
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [minGames]);

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
    return players.filter((p) => p.totalGames >= minGames);
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
      <CardHeader>
        <CardTitle>Ammo Carrier</CardTitle>
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
                <TableHead className="sticky left-0 bg-background z-10">Callsign</TableHead>
                <SortableHead column="winRate" sort={sort} onSort={handleSort}>
                  Win Rate
                </SortableHead>
                <SortableHead column="avgScore" sort={sort} onSort={handleSort}>
                  Avg Score
                </SortableHead>
                <SortableHead column="totalScore" sort={sort} onSort={handleSort}>
                  Total Score
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
                <SortableHead column="avgUptime" sort={sort} onSort={handleSort}>
                  Avg Uptime
                </SortableHead>
                <SortableHead column="avgMedicHits" sort={sort} onSort={handleSort}>
                  Avg Medic Hits
                </SortableHead>
                <SortableHead column="avgAmmoBoost" sort={sort} onSort={handleSort}>
                  Avg Boosts
                </SortableHead>
                <SortableHead column="avgResuppliesGiven" sort={sort} onSort={handleSort}>
                  Avg Resupplies
                </SortableHead>
                <SortableHead column="avgDoubleResuppliesGiven" sort={sort} onSort={handleSort}>
                  Avg Doubles
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((p) => {
                const iplIdForUrl = p.iplId.startsWith("#") ? p.iplId.slice(1) : p.iplId;
                return (
                  <TableRow key={p.playerId}>
                    <TableCell className="sticky left-0 bg-background z-10 font-medium">
                      <Link href={`/players/${iplIdForUrl}`} className="hover:underline">
                        {p.callsign}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatWinRate(p.wins, p.totalGames)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatScore(Math.round(p.avgScore))}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatScore(p.totalScore)}</TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.totalMvp)}</TableCell>
                    <TableCell className="tabular-nums">{formatPct(p.avgAccuracy)}</TableCell>
                    <TableCell className="tabular-nums">{formatHitDiff(p.avgHitDiff)}</TableCell>
                    <TableCell className="tabular-nums">{formatPct(p.avgUptime)}</TableCell>
                    <TableCell className="tabular-nums">{p.avgMedicHits.toFixed(2)}</TableCell>
                    <TableCell className="tabular-nums">
                      {p.avgAmmoBoost !== null ? p.avgAmmoBoost.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.avgResuppliesGiven !== null ? p.avgResuppliesGiven.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.avgDoubleResuppliesGiven !== null
                        ? p.avgDoubleResuppliesGiven.toFixed(2)
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {pageRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
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
