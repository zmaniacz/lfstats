"use client"

import { useState } from "react"
import Link from "next/link"
import type { GameDetailTeam, GameDetailPlayer } from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { formatScore } from "@/lib/format"
import { getPosition } from "@/lib/positions"
import { MvpBreakdownDialog } from "@/components/games/MvpBreakdownDialog"
import { HitDiffDialog } from "@/components/games/HitDiffDialog"
import { PlayerStatsSheet } from "@/components/games/PlayerStatsSheet"

type Props = {
  team: GameDetailTeam
}

export function TeamStatsTable({ team }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<GameDetailPlayer | null>(null)

  function openSheet(player: GameDetailPlayer) {
    setSelectedPlayer(player)
    setSheetOpen(true)
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Callsign</TableHead>
            <TableHead>Pos</TableHead>
            <TableHead className="text-center">Score</TableHead>
            <TableHead className="text-center">MVP</TableHead>
            <TableHead className="text-center">Hit Diff</TableHead>
            <TableHead className="text-center">Medic Hits</TableHead>
            <TableHead className="text-center">Msls</TableHead>
            <TableHead className="text-center">Lives</TableHead>
            <TableHead className="text-center">Shots</TableHead>
            <TableHead className="text-center">Missiled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {team.players.map((player) => (
            <TableRow
              key={player.id}
              className={`cursor-pointer hover:bg-muted/50 ${player.eliminated ? "opacity-60" : ""}`}
              onClick={() => openSheet(player)}
            >
              <TableCell className="font-medium">
                {player.playerId !== null ? (
                  <Link
                    href={`/players/${player.iplId}`}
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
              <TableCell className="text-muted-foreground text-xs">
                {getPosition(player.position)?.abbr ?? player.position}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {formatScore(player.score)}
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

      <PlayerStatsSheet
        player={selectedPlayer}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
        }}
      />
    </>
  )
}
