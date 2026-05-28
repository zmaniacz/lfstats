import { notFound } from "next/navigation"
import Link from "next/link"
import { getGameDetail } from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  formatScore,
  formatGameName,
  formatDateTime,
  formatMs,
} from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"
import { getPosition } from "@/lib/positions"
import { MvpBreakdownDialog } from "@/components/games/MvpBreakdownDialog"
import { HitDiffDialog } from "@/components/games/HitDiffDialog"

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const game = await getGameDetail(id)

  if (!game) notFound()

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">
          {formatGameName(game.description, game.startTime)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {game.centerName} · {formatDateTime(game.startTime)} · {formatMs(game.actualDuration)}
        </p>
      </div>

      {game.teams.map((team) => {
        const color = getTeamColor(team.colourEnum)
        const baseScore = team.score ?? 0
        const elimBonus = team.eliminationBonus ?? 0
        const totalScore = baseScore + elimBonus

        return (
          <section key={team.id} className="space-y-0">
            <div
              className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${color?.text ?? ""}`}>
                  {team.name}
                </span>
                {team.result === "win" && (
                  <Badge variant="default">Win</Badge>
                )}
                {team.result === "loss" && (
                  <Badge variant="secondary">Loss</Badge>
                )}
                {team.result === "draw" && (
                  <Badge variant="secondary">Draw</Badge>
                )}
              </div>
              <span className="tabular-nums font-semibold">
                {formatScore(totalScore)}
                {elimBonus > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({formatScore(elimBonus)})
                  </span>
                )}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>Pos</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">MVP</TableHead>
                  <TableHead className="text-right">Lives</TableHead>
                  <TableHead className="text-right">Shots</TableHead>
                  <TableHead className="text-right">Hit Diff</TableHead>
                  <TableHead className="text-right">Msls</TableHead>
                  <TableHead className="text-right">Missiled</TableHead>
                  <TableHead className="text-right">Medic Hits</TableHead>
                  <TableHead className="text-right">Shot Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.players.map((player) => (
                  <TableRow
                    key={player.id}
                    className={player.eliminated ? "opacity-60" : ""}
                  >
                    <TableCell className="font-medium">
                      {player.playerId !== null ? (
                        <Link
                          href={`/players/${player.iplId}`}
                          className="hover:underline"
                        >
                          {player.callsign}
                        </Link>
                      ) : (
                        player.callsign
                      )} {player.eliminated && (
                        <Badge variant="destructive" className="text-xs px-1 py-0">
                          OUT
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {getPosition(player.position)?.abbr ?? player.position}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatScore(player.score)}
                    </TableCell>
                    <TableCell className="text-right">
                      <MvpBreakdownDialog
                        callsign={player.callsign}
                        totalMvp={player.mvpPoints}
                        components={player.mvpComponents}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.livesLeft}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.shotsLeft}
                    </TableCell>
                    <TableCell className="text-right">
                      <HitDiffDialog
                        callsign={player.callsign}
                        hitDiff={player.hitDiff}
                        interactions={player.hitInteractions}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.missilesHitOpponent}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.timesHitByMissile}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.shotsHitOpponentMedic}
                      {player.position === 1 && player.nukesHitMedic !== null && (
                        <span className="text-muted-foreground ml-1">
                          ({player.nukesHitMedic})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {player.shotsHitTeam}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </div>
  )
}
