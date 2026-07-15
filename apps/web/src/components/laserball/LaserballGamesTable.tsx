// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatGameName, formatMs, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { LbGameListItem } from "@lfstats/db";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

const PAGE_SIZE = 10;

type SortColumn = "game" | "center" | "started" | "outcome" | "score" | "length";
type SortState = { column: SortColumn; dir: "asc" | "desc" };

function winningTeamScore(game: LbGameListItem): number {
  const winner = game.teams.find((t) => t.result === "win") ?? game.teams[0];
  return winner?.score ?? 0;
}

function getSortValue(item: LbGameListItem, col: SortColumn): string | number {
  switch (col) {
    case "game":
      return formatGameName(item.description, item.startTime).toLowerCase();
    case "center":
      return item.centerName.toLowerCase();
    case "started":
      return item.startTime.getTime();
    case "outcome":
      return item.outcome;
    case "score":
      return winningTeamScore(item);
    case "length":
      return item.actualDuration;
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

export function LaserballGamesTable({ games }: { games: LbGameListItem[] }) {
  const [sort, setSort] = useState<SortState>({ column: "started", dir: "desc" });
  const [page, setPage] = useState(1);

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: col === "started" || col === "length" ? "desc" : "asc" },
    );
    setPage(1);
  }

  const sorted = useMemo(() => {
    return [...games].sort((a, b) => {
      const va = getSortValue(a, sort.column);
      const vb = getSortValue(b, sort.column);
      const cmp =
        typeof va === "number" ? va - (vb as number) : (va as string).localeCompare(vb as string);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [games, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Card>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead column="game" sort={sort} onSort={handleSort}>
                Game
              </SortableHead>
              <SortableHead column="center" sort={sort} onSort={handleSort}>
                Center
              </SortableHead>
              <SortableHead column="started" sort={sort} onSort={handleSort}>
                Started
              </SortableHead>
              <SortableHead column="length" sort={sort} onSort={handleSort}>
                Length
              </SortableHead>
              <SortableHead column="outcome" sort={sort} onSort={handleSort}>
                Outcome
              </SortableHead>
              <SortableHead column="score" sort={sort} onSort={handleSort}>
                Score
              </SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((game) => {
              const winner = game.teams.find((t) => t.result === "win");
              const winnerColor = winner ? getTeamColor(winner.colourEnum) : undefined;
              // Show the winning team first; draws keep tdf order.
              const sortedTeams = [...game.teams].sort((a, b) =>
                a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
              );
              return (
                <TableRow key={game.id}>
                  <TableCell>
                    <Link
                      href={`/laserball/games/${game.slug}`}
                      className={`hover:underline font-medium ${winnerColor?.text ?? "text-muted-foreground"}`}
                    >
                      {formatGameName(game.description, game.startTime)}
                    </Link>
                  </TableCell>
                  <TableCell>{game.centerName}</TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(game.startTime)}</TableCell>
                  <TableCell className="tabular-nums">{formatMs(game.actualDuration)}</TableCell>
                  <TableCell className="capitalize">{game.outcome}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 tabular-nums">
                      {sortedTeams.map((team, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="text-muted-foreground">–</span>}
                          <span className={getTeamColor(team.colourEnum)?.text ?? ""}>
                            {formatScore(team.score ?? 0)}
                          </span>
                        </Fragment>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No laserball games found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {sorted.length} games · page {page} of {totalPages}
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
