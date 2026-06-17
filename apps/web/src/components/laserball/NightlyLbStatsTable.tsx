// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { LbGameDetailPlayer } from "@lfstats/db";
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
import { formatMs, formatGameName } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { LbPlayerStatsSheet } from "@/components/laserball/LbPlayerStatsSheet";

export type NightlyLbScorecardRow = {
  player: LbGameDetailPlayer;
  teamColourEnum: number;
  teamResult: "win" | "loss" | "draw" | null;
  gameSlug: string;
  gameStartTime: Date;
  gameDescription: string | null;
  winningTeamColourEnum: number | null;
};

type SortKey =
  | "callsign"
  | "gameStartTime"
  | "goals"
  | "assists1"
  | "passesDone"
  | "stealsDone"
  | "blocksDone"
  | "clearsDone"
  | "possessionTimeMs";

const PAGE_SIZE = 10;

function getSortValue(row: NightlyLbScorecardRow, key: SortKey): string | number {
  switch (key) {
    case "callsign":
      return row.player.callsign.toLowerCase();
    case "gameStartTime":
      return row.gameStartTime.getTime();
    case "goals":
      return row.player.goals;
    case "assists1":
      return row.player.assists1;
    case "passesDone":
      return row.player.passesDone;
    case "stealsDone":
      return row.player.stealsDone;
    case "blocksDone":
      return row.player.blocksDone;
    case "clearsDone":
      return row.player.clearsDone;
    case "possessionTimeMs":
      return row.player.possessionTimeMs;
  }
}

function ForAgainst({ done, against }: { done: number; against: number }) {
  return (
    <span className="tabular-nums">
      {done.toLocaleString("en-US")}
      <span className="text-muted-foreground"> / {against.toLocaleString("en-US")}</span>
    </span>
  );
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

export function NightlyLbStatsTable({ rows }: { rows: NightlyLbScorecardRow[] }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<LbGameDetailPlayer | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("goals");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [nameFilter, setNameFilter] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortKey) {
    if (col === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  function handleNameFilter(value: string) {
    setNameFilter(value);
    setPage(1);
  }

  const filtered = useMemo(() => {
    const lower = nameFilter.toLowerCase();
    return lower ? rows.filter((r) => r.player.callsign.toLowerCase().includes(lower)) : rows;
  }, [rows, nameFilter]);

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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Overall</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search players…"
            value={nameFilter}
            onChange={(e) => handleNameFilter(e.target.value)}
            className="max-w-xs"
          />

          <div className="overflow-x-auto">
            <Table className="table-fixed min-w-200 w-full">
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Callsign"
                    col="callsign"
                    className="w-[14%]"
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Game"
                    col="gameStartTime"
                    className="w-[11%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Goals"
                    col="goals"
                    className="w-[7%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Assists"
                    col="assists1"
                    className="w-[7%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Passes"
                    col="passesDone"
                    className="w-[10%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Steals"
                    col="stealsDone"
                    className="w-[10%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Blocks"
                    col="blocksDone"
                    className="w-[10%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Clears"
                    col="clearsDone"
                    className="w-[10%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Possession"
                    col="possessionTimeMs"
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
                      No results match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageRows.map((row) => {
                    const { player } = row;
                    const winnerColor =
                      row.winningTeamColourEnum !== null
                        ? getTeamColor(row.winningTeamColourEnum)?.text
                        : undefined;

                    return (
                      <TableRow
                        key={player.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelected(player);
                          setSheetOpen(true);
                        }}
                      >
                        <TableCell className="font-medium">
                          {player.playerId !== null ? (
                            <Link
                              href={`/players/${player.iplId?.replace(/^#/, "")}?game=lb`}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {player.callsign}
                            </Link>
                          ) : (
                            player.callsign
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Link
                            href={`/laserball/games/${row.gameSlug}`}
                            className={`hover:underline ${winnerColor ?? ""}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatGameName(row.gameDescription, row.gameStartTime)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-semibold">
                          {player.goals}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {player.assists1}
                        </TableCell>
                        <TableCell className="text-center">
                          <ForAgainst done={player.passesDone} against={player.passesReceived} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ForAgainst done={player.stealsDone} against={player.stealsReceived} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ForAgainst done={player.blocksDone} against={player.blocksReceived} />
                        </TableCell>
                        <TableCell className="text-center">
                          <ForAgainst done={player.clearsDone} against={player.clearsReceived} />
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-muted-foreground">
                          {formatMs(player.possessionTimeMs)}
                        </TableCell>
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

      <LbPlayerStatsSheet player={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
