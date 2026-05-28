import { notFound } from "next/navigation"
import { getGameDetail } from "@lfstats/db"
import { Badge } from "@/components/ui/badge"
import {
  formatScore,
  formatGameName,
  formatDateTime,
  formatMs,
} from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"
import { TeamStatsTable } from "@/components/games/TeamStatsTable"


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

            <TeamStatsTable team={team} />
          </section>
        )
      })}
    </div>
  )
}
