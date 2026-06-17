// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import type { LbPlayerGameListItem } from "@lfstats/db";
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
import { formatDateTime, formatGameName, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";

const PAGE_SIZE = 10;

function ResultBadge({ result }: { result: "win" | "loss" | "draw" | null }) {
  if (result === "win") return <Badge variant="default">Win</Badge>;
  if (result === "loss") return <Badge variant="secondary">Loss</Badge>;
  if (result === "draw") return <Badge variant="secondary">Draw</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

export function LbPlayerGamesTable({ games }: { games: LbPlayerGameListItem[] }) {
  const [page, setPage] = useState(1);

  if (games.length === 0) {
    return <p className="text-muted-foreground">No laserball games found.</p>;
  }

  const totalPages = Math.max(1, Math.ceil(games.length / PAGE_SIZE));
  const pageGames = games.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Game</TableHead>
            <TableHead>Center</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Result</TableHead>
            <TableHead className="text-center">Goals</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageGames.map((game) => {
            const winner = game.teams.find((t) => t.result === "win");
            const winnerColor = winner ? getTeamColor(winner.colourEnum) : undefined;
            const sortedTeams = [...game.teams].sort((a, b) =>
              a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
            );
            return (
              <TableRow key={game.id}>
                <TableCell>
                  <Link
                    href={`/laserball/games/${game.gameSlug}`}
                    className={`hover:underline font-medium ${winnerColor?.text ?? "text-muted-foreground"}`}
                  >
                    {formatGameName(game.description, game.startTime)}
                  </Link>
                </TableCell>
                <TableCell>{game.centerName}</TableCell>
                <TableCell className="tabular-nums">{formatDateTime(game.startTime)}</TableCell>
                <TableCell>
                  <ResultBadge result={game.result} />
                </TableCell>
                <TableCell className="text-center tabular-nums font-semibold">
                  {game.goals.toLocaleString("en-US")}
                </TableCell>
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
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {games.length} games · page {page} of {totalPages}
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
