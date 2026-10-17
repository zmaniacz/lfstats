// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { HitDiffDialog } from "@/components/games/HitDiffDialog";
import { LegacyMvpDialog } from "@/components/sm5-pdf/LegacyMvpDialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatPct, formatScore } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import type { PdfGameTeam } from "@lfstats/db";
import { CardsIcon } from "@phosphor-icons/react";
import Link from "next/link";

/**
 * Scoreboard for one side of a PDF-era game. Mirrors TeamStatsTable, minus everything
 * that needs the event stream: no timeline, no survival bar, no modern MVP.
 */
export function PdfTeamStatsTable({ team }: { team: PdfGameTeam }) {
  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed w-full min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[180px]">Callsign</TableHead>
            <TableHead className="w-[50px]">Pos</TableHead>
            <TableHead className="w-[90px] text-center">Score</TableHead>
            <TableHead className="w-[80px] text-center">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="underline decoration-dotted underline-offset-4">
                    MVP*
                  </TooltipTrigger>
                  <TooltipContent>Legacy formula — not comparable with modern MVP</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </TableHead>
            <TableHead className="w-[110px] text-center">HitDiff</TableHead>
            <TableHead className="w-[55px] text-center">Acc</TableHead>
            <TableHead className="w-[70px] text-center">Medic Hits</TableHead>
            <TableHead className="w-[55px] text-center">Lives</TableHead>
            <TableHead className="w-[55px] text-center">Shots</TableHead>
            <TableHead className="w-[50px] text-center">Msls</TableHead>
            <TableHead className="w-[50px] text-center">Msld</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.players.map((player) => {
            const active = player.penalties.filter((p) => !p.rescinded);
            const penaltySum = active.reduce((s, p) => s + p.scoreValue, 0);
            return (
              <TableRow key={player.id}>
                <TableCell className="flex font-medium items-center gap-1.5">
                  <Link
                    href={`/players/${encodeURIComponent(player.iplId.replace(/^#/, ""))}`}
                    className="hover:underline truncate"
                  >
                    {player.callsign}
                  </Link>
                  {player.isSub && (
                    <Badge variant="outline" className="text-xs px-1 py-0">
                      SUB
                    </Badge>
                  )}
                  {active.length > 0 && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 text-yellow-500 text-xs font-normal shrink-0">
                            <CardsIcon weight="fill" className="size-3.5" />
                            {active.length > 1 && `(x${active.length})`}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {active.map((p) => (
                            <div key={p.id}>
                              {p.type}: {formatScore(p.scoreValue)}
                            </div>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {player.eliminated && (
                    <Badge variant="destructive" className="text-xs px-1 py-0 ml-auto">
                      OUT
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {getPosition(player.position)?.abbr ?? player.position}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {formatScore(player.score + penaltySum)}
                  {penaltySum !== 0 && (
                    <span className="text-destructive font-normal ml-1">
                      ({formatScore(penaltySum)})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <LegacyMvpDialog
                    callsign={player.callsign}
                    totalMvp={player.legacyMvpPoints}
                    components={player.legacyMvp}
                  />
                </TableCell>
                <TableCell className="text-center">
                  <HitDiffDialog
                    callsign={player.callsign}
                    hitDiff={player.hitDiff}
                    shotsHitOpponent={player.shotsHitOpponent}
                    timesHit={player.timesHit}
                    interactions={player.hitInteractions}
                  />
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {formatPct(player.accuracy)}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.medicHits}
                  {player.nukesHitMedic ? (
                    <span className="text-muted-foreground ml-1">({player.nukesHitMedic}n)</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-center tabular-nums">{player.livesLeft}</TableCell>
                <TableCell className="text-center tabular-nums">{player.shotsLeft}</TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.missilesHitOpponent}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.timesHitByMissile}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
