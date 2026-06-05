// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { HitDiffDialog } from "@/components/games/HitDiffDialog";
import { MvpBreakdownDialog } from "@/components/games/MvpBreakdownDialog";
import { PlayerStatsSheet } from "@/components/games/PlayerStatsSheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPct, formatScore } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import type {
  GameDetailPlayer,
  GameDetailTeam,
  PenaltyRecord,
} from "@lfstats/db";
import { CardsIcon, WarningIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

type PenaltyActions = React.ComponentProps<
  typeof PlayerStatsSheet
>["penaltyActions"];

type Props = {
  team: GameDetailTeam;
  gameId: string;
  penaltiesByScorecard: Map<string, PenaltyRecord[]>;
  canEdit: boolean;
  penaltyActions: PenaltyActions;
  mercenaryAction?: (scorecardId: string, isMercenary: boolean) => Promise<void>;
};

export function TeamStatsTable({
  team,
  gameId,
  penaltiesByScorecard,
  canEdit,
  penaltyActions,
  mercenaryAction,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<GameDetailPlayer | null>(
    null,
  );

  function openSheet(player: GameDetailPlayer) {
    setSelectedPlayer(player);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table className="table-fixed min-w-175 w-full">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[20%]">Callsign</TableHead>
              <TableHead className="w-[6%]">Pos</TableHead>
              <TableHead className="w-[9%] text-center">Score</TableHead>
              <TableHead className="w-[8%] text-center">MVP</TableHead>
              <TableHead className="w-[9%] text-center">Hit Diff</TableHead>
              <TableHead className="w-[9%] text-center">Accuracy</TableHead>
              <TableHead className="w-[9%] text-center">Medic Hits</TableHead>
              <TableHead className="w-[6%] text-center">Msls</TableHead>
              <TableHead className="w-[6%] text-center">Lives</TableHead>
              <TableHead className="w-[6%] text-center">Shots</TableHead>
              <TableHead className="w-[6%] text-center">Missiled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.players.map((player) => (
              <TableRow
                key={player.id}
                className={`cursor-pointer hover:bg-muted/50 `}
                onClick={() => openSheet(player)}
              >
                <TableCell className="flex font-medium items-center gap-1.5">
                  {(player.isMercenary || !player.playerId) && (
                    <WarningIcon className="size-3.5 text-orange-500 shrink-0" />
                  )}
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
                  )}
                  {(() => {
                    const count = (
                      penaltiesByScorecard.get(player.id) ?? []
                    ).filter((p) => !p.rescinded).length;
                    if (count === 0) return null;
                    return (
                      <span className="flex items-center gap-0.5 text-yellow-500 text-xs font-normal shrink-0">
                        <CardsIcon weight="fill" className="size-3.5" />
                        {count > 1 && `(x${count})`}
                      </span>
                    );
                  })()}
                  {player.eliminated && (
                    <Badge
                      variant="destructive"
                      className="text-xs px-1 py-0 ml-auto"
                    >
                      OUT
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {getPosition(player.position)?.abbr ?? player.position}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {(() => {
                    const penaltySum = (
                      penaltiesByScorecard.get(player.id) ?? []
                    )
                      .filter((p) => !p.rescinded)
                      .reduce((s, p) => s + p.scoreValue, 0);
                    const adjusted = (player.score ?? 0) + penaltySum;
                    return (
                      <>
                        {formatScore(adjusted)}
                        {penaltySum !== 0 && (
                          <span className="text-destructive font-normal ml-1">
                            ({formatScore(penaltySum)})
                          </span>
                        )}
                      </>
                    );
                  })()}
                </TableCell>
                <TableCell
                  className="text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MvpBreakdownDialog
                    callsign={player.callsign}
                    totalMvp={player.mvpPoints}
                    components={player.mvpComponents}
                  />
                </TableCell>
                <TableCell
                  className="text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HitDiffDialog
                    callsign={player.callsign}
                    hitDiff={player.hitDiff}
                    interactions={player.hitInteractions}
                  />
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {formatPct(player.accuracy)}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.shotsHitOpponentMedic}
                  {player.position === 1 && player.nukesHitMedic !== null && (
                    <span className="text-muted-foreground ml-1">
                      ({player.nukesHitMedic})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.missilesHitOpponent}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.livesLeft}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.shotsLeft}
                </TableCell>
                <TableCell className="text-center tabular-nums">
                  {player.timesHitByMissile}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PlayerStatsSheet
        player={selectedPlayer}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
        }}
        gameId={gameId}
        penalties={
          selectedPlayer
            ? (penaltiesByScorecard.get(selectedPlayer.id) ?? [])
            : []
        }
        canEdit={canEdit}
        penaltyActions={penaltyActions}
        mercenaryAction={mercenaryAction}
      />
    </>
  );
}
