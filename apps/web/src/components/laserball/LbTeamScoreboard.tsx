// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { LbPlayerStatsSheet } from "@/components/laserball/LbPlayerStatsSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMs } from "@/lib/format";
import type { LbGameDetailPlayer, LbGameDetailTeam } from "@lfstats/db";
import { WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

// "for / against" cell — done count and received count.
function ForAgainst({ done, against }: { done: number; against: number }) {
  return (
    <span className="tabular-nums">
      {done.toLocaleString("en-US")}
      <span className="text-muted-foreground"> / {against.toLocaleString("en-US")}</span>
    </span>
  );
}

export function LbTeamScoreboard({ team }: { team: LbGameDetailTeam }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<LbGameDetailPlayer | null>(null);

  function openSheet(player: LbGameDetailPlayer) {
    setSelected(player);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="table-fixed min-w-200 w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-5/24">Callsign</TableHead>
              <TableHead className="w-2/24 text-center">Goals</TableHead>
              <TableHead className="w-2/24 text-center">Assists</TableHead>
              <TableHead className="w-3/24 text-center">Passes</TableHead>
              <TableHead className="w-3/24 text-center">Steals</TableHead>
              <TableHead className="w-3/24 text-center">Blocks</TableHead>
              <TableHead className="w-3/24 text-center">Clears</TableHead>
              <TableHead className="w-3/24 text-center">Possn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.players.map((player) => (
              <TableRow
                key={player.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => openSheet(player)}
              >
                <TableCell className="flex font-medium items-center gap-1.5">
                  {player.playerId === null && (
                    <WarningIcon className="size-3.5 text-orange-500 shrink-0" />
                  )}
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
                <TableCell className="text-center tabular-nums font-semibold">
                  {player.goals.toLocaleString("en-US")}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.assists1.toLocaleString("en-US")}
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{formatMs(player.possessionTimeMs)}</span>
                      </TooltipTrigger>
                      <TooltipContent>Time holding the ball</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LbPlayerStatsSheet player={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
