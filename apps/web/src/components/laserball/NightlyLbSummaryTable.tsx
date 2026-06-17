// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
import { formatMs, formatWinRate } from "@/lib/format";
import type { NightlyLbScorecardRow } from "./NightlyLbStatsTable";

type PlayerSummary = {
  playerId: string | null;
  iplId: string | null;
  callsign: string;
  gameCount: number;
  avgGoals: number;
  avgAssists: number;
  avgPassesDone: number;
  avgStealsDone: number;
  avgBlocksDone: number;
  avgClearsDone: number;
  avgPossessionMs: number;
  wins: number;
};

type SortKey =
  | "callsign"
  | "avgGoals"
  | "avgAssists"
  | "avgPassesDone"
  | "avgStealsDone"
  | "avgBlocksDone"
  | "avgClearsDone"
  | "avgPossessionMs"
  | "winRate";

const PAGE_SIZE = 10;

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function aggregate(rows: NightlyLbScorecardRow[]): PlayerSummary[] {
  const map = new Map<
    string,
    {
      entries: NightlyLbScorecardRow[];
      playerId: string | null;
      iplId: string | null;
      callsign: string;
    }
  >();

  for (const row of rows) {
    const key = row.player.playerId ?? `guest:${row.player.callsign}`;
    if (!map.has(key)) {
      map.set(key, {
        entries: [],
        playerId: row.player.playerId,
        iplId: row.player.iplId,
        callsign: row.player.callsign,
      });
    }
    map.get(key)!.entries.push(row);
  }

  return Array.from(map.values()).map(({ entries, playerId, iplId, callsign }) => ({
    playerId,
    iplId,
    callsign,
    gameCount: entries.length,
    avgGoals: avg(entries.map((r) => r.player.goals)),
    avgAssists: avg(entries.map((r) => r.player.assists1)),
    avgPassesDone: avg(entries.map((r) => r.player.passesDone)),
    avgStealsDone: avg(entries.map((r) => r.player.stealsDone)),
    avgBlocksDone: avg(entries.map((r) => r.player.blocksDone)),
    avgClearsDone: avg(entries.map((r) => r.player.clearsDone)),
    avgPossessionMs: avg(entries.map((r) => r.player.possessionTimeMs)),
    wins: entries.filter((r) => r.teamResult === "win").length,
  }));
}

function getSortValue(s: PlayerSummary, key: SortKey): string | number {
  switch (key) {
    case "callsign":
      return s.callsign.toLowerCase();
    case "avgGoals":
      return s.avgGoals;
    case "avgAssists":
      return s.avgAssists;
    case "avgPassesDone":
      return s.avgPassesDone;
    case "avgStealsDone":
      return s.avgStealsDone;
    case "avgBlocksDone":
      return s.avgBlocksDone;
    case "avgClearsDone":
      return s.avgClearsDone;
    case "avgPossessionMs":
      return s.avgPossessionMs;
    case "winRate":
      return s.gameCount === 0 ? -1 : s.wins / s.gameCount;
  }
}

function SortableHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  center = false,
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

export function NightlyLbSummaryTable({ rows }: { rows: NightlyLbScorecardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("avgGoals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  const summaries = useMemo(() => aggregate(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? summaries.filter((s) => s.callsign.toLowerCase().includes(q)) : summaries;
  }, [summaries, search]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const av = getSortValue(a, sortKey);
        const bv = getSortValue(b, sortKey);
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      }),
    [filtered, sortKey, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const sortHeadProps = { sortKey, sortDir, onSort: handleSort };

  function fmtAvg(n: number) {
    return n.toFixed(1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary Stats</CardTitle>
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
                <SortableHead
                  label="Callsign"
                  col="callsign"
                  className="w-[16%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Goals"
                  col="avgGoals"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Assists"
                  col="avgAssists"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Passes"
                  col="avgPassesDone"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Steals"
                  col="avgStealsDone"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Blocks"
                  col="avgBlocksDone"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Clears"
                  col="avgClearsDone"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Possession"
                  col="avgPossessionMs"
                  className="w-[12%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Win Rate"
                  col="winRate"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {search ? "No players match the search." : "No players found."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((s) => (
                  <TableRow key={s.playerId ?? `guest:${s.callsign}`}>
                    <TableCell className="font-medium">
                      {s.playerId !== null ? (
                        <Link
                          href={`/players/${s.iplId?.replace(/^#/, "")}?game=lb`}
                          className="hover:underline"
                        >
                          {s.callsign}
                        </Link>
                      ) : (
                        s.callsign
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{fmtAvg(s.avgGoals)}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {fmtAvg(s.avgAssists)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {fmtAvg(s.avgPassesDone)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {fmtAvg(s.avgStealsDone)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {fmtAvg(s.avgBlocksDone)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {fmtAvg(s.avgClearsDone)}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatMs(Math.round(s.avgPossessionMs))}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">
                      {formatWinRate(s.wins, s.gameCount)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length === summaries.length
              ? `${summaries.length} players`
              : `${filtered.length} of ${summaries.length} players`}{" "}
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
