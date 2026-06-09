// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import type { GameDetailPlayer } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatScore, formatPct, formatHitDiff, formatMVP, formatGameName } from "@/lib/format";
import { getPosition, POSITIONS } from "@/lib/positions";
import { getTeamColor } from "@/lib/team-colors";
import { MvpBreakdownDialog } from "@/components/games/MvpBreakdownDialog";
import { HitDiffDialog } from "@/components/games/HitDiffDialog";
import { PlayerStatsSheet } from "@/components/games/PlayerStatsSheet";

export type NightlyScorecardRow = {
  player: GameDetailPlayer;
  teamColorEnum: number;
  teamResult: "win" | "loss" | "draw" | null;
  gameSlug: string;
  gameStartTime: Date;
  gameDescription: string | null;
  winningTeamColorEnum: number | null;
};

type SortKey =
  | "callsign"
  | "gameStartTime"
  | "position"
  | "score"
  | "mvpPoints"
  | "hitDiff"
  | "medicHits"
  | "accuracy"
  | "shotsHitTeam";

const PAGE_SIZE = 10;

function getSortValue(row: NightlyScorecardRow, key: SortKey): string | number {
  switch (key) {
    case "callsign":
      return row.player.callsign.toLowerCase();
    case "gameStartTime":
      return row.gameStartTime.getTime();
    case "position":
      return row.player.position;
    case "score":
      return row.player.score;
    case "mvpPoints":
      return row.player.mvpPoints;
    case "hitDiff":
      return row.player.hitDiff;
    case "medicHits":
      return row.player.medicHits;
    case "accuracy":
      return row.player.accuracy;
    case "shotsHitTeam":
      return row.player.shotsHitTeam;
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

type Props = {
  rows: NightlyScorecardRow[];
};

export function NightlyStatsTable({ rows }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<GameDetailPlayer | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>("mvpPoints");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [nameFilter, setNameFilter] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("all");

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

  function handleNameFilter(value: string) {
    setNameFilter(value);
    setPage(1);
  }

  function handlePositionFilter(value: string) {
    setPositionFilter(value);
    setPage(1);
  }

  function openSheet(player: GameDetailPlayer) {
    setSelectedPlayer(player);
    setSheetOpen(true);
  }

  const filtered = useMemo(() => {
    const lowerName = nameFilter.toLowerCase();
    const posNum = positionFilter === "all" ? null : Number(positionFilter);
    return rows.filter((r) => {
      if (lowerName && !r.player.callsign.toLowerCase().includes(lowerName)) return false;
      if (posNum !== null && r.player.position !== posNum) return false;
      return true;
    });
  }, [rows, nameFilter, positionFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

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
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search players…"
              value={nameFilter}
              onChange={(e) => handleNameFilter(e.target.value)}
              className="max-w-xs"
            />
            <Select value={positionFilter} onValueChange={handlePositionFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All positions</SelectItem>
                {Object.entries(POSITIONS).map(([num, pos]) => (
                  <SelectItem key={num} value={num}>
                    {pos.abbr} — {pos.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table className="table-fixed min-w-200 w-full">
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="Callsign"
                    col="callsign"
                    className="w-[16%]"
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Game"
                    col="gameStartTime"
                    className="w-[12%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Pos"
                    col="position"
                    className="w-[6%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Score"
                    col="score"
                    className="w-[8%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="MVP"
                    col="mvpPoints"
                    className="w-[8%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Hit Diff"
                    col="hitDiff"
                    className="w-[8%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Medic Hits"
                    col="medicHits"
                    className="w-[8%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Accuracy"
                    col="accuracy"
                    className="w-[8%]"
                    center
                    {...sortHeadProps}
                  />
                  <SortableHead
                    label="Shot Team"
                    col="shotsHitTeam"
                    className="w-[8%]"
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
                      row.winningTeamColorEnum !== null
                        ? getTeamColor(row.winningTeamColorEnum)?.text
                        : undefined;
                    const posColor = getTeamColor(row.teamColorEnum)?.text;

                    return (
                      <TableRow
                        key={player.id}
                        className={`cursor-pointer hover:bg-muted/50 ${player.eliminated ? "opacity-60" : ""}`}
                        onClick={() => openSheet(player)}
                      >
                        <TableCell className="font-medium">
                          {player.playerId !== null ? (
                            <Link
                              href={`/players/${player.iplId?.replace(/^#/, "")}`}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {player.callsign}
                            </Link>
                          ) : (
                            player.callsign
                          )}{" "}
                          {player.eliminated && (
                            <Badge variant="destructive" className="text-xs px-1 py-0">
                              OUT
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Link
                            href={`/games/${row.gameSlug}`}
                            className={`hover:underline ${winnerColor ?? ""}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatGameName(row.gameDescription, row.gameStartTime)}
                          </Link>
                        </TableCell>
                        <TableCell
                          className={`text-center text-xs ${posColor ?? "text-muted-foreground"}`}
                        >
                          {getPosition(player.position)?.abbr ?? player.position}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatScore(player.score)}
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <MvpBreakdownDialog
                            callsign={player.callsign}
                            totalMvp={player.mvpPoints}
                            components={player.mvpComponents}
                          />
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <HitDiffDialog
                            callsign={player.callsign}
                            hitDiff={player.hitDiff}
                            interactions={player.hitInteractions}
                          />
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {player.medicHits}
                          {player.position === 1 && player.nukesHitMedic !== null && (
                            <span className="text-muted-foreground ml-1">
                              ({player.nukesHitMedic})
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatPct(player.accuracy)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {player.shotsHitTeam}
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

      <PlayerStatsSheet
        player={selectedPlayer}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        gameId=""
        penalties={[]}
        canEdit={false}
        penaltyActions={{
          addAction: async () => {},
          updateAction: async () => {},
          rescindAction: async () => {},
          deleteAction: async () => {},
        }}
      />
    </>
  );
}
