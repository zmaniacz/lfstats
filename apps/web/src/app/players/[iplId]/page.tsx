import { notFound } from "next/navigation"
import { ExternalLink } from "lucide-react"
import {
  getPlayerByIplId,
  getPlayerCallsignHistory,
  getPlayerResultsByColor,
  getPlayerAvgMvpByPosition,
  getGlobalAvgMvpByPosition,
  getPlayerMvpBoxPlot,
  getPlayerAvgScoreByPosition,
  getGlobalAvgScoreByPosition,
  getPlayerGames,
} from "@lfstats/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PlayerWinsByColorChart } from "@/components/players/PlayerWinsByColorChart"
import { PositionRadarChart, type PositionRadarPoint } from "@/components/charts/PositionRadarChart"
import { MvpBoxPlotChart } from "@/components/charts/MvpBoxPlotChart"
import { PlayerTabs } from "@/components/players/PlayerTabs"
import { PlayerGamesTable } from "@/components/players/PlayerGamesTable"
import { POSITIONS } from "@/lib/positions"

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ iplId: string }>
}) {
  const { iplId } = await params

  const playerDetail = await getPlayerByIplId(iplId)
  if (!playerDetail) notFound()

  const [
    callsignHistory,
    gameResults,
    playerMvp,
    globalMvp,
    playerBoxPlot,
    playerScore,
    globalScore,
    playerGames,
  ] = await Promise.all([
    getPlayerCallsignHistory(playerDetail.id),
    getPlayerResultsByColor(playerDetail.id),
    getPlayerAvgMvpByPosition(playerDetail.id),
    getGlobalAvgMvpByPosition(),
    getPlayerMvpBoxPlot(playerDetail.id),
    getPlayerAvgScoreByPosition(playerDetail.id),
    getGlobalAvgScoreByPosition(),
    getPlayerGames(playerDetail.id),
  ])

  const otherCallsigns = callsignHistory.filter(
    (h) => h.callsign !== playerDetail.currentCallsign,
  )

  const playerMvpByPosition = new Map(playerMvp.map((p) => [p.position, p.avgMvp]))
  const globalMvpByPosition = new Map(globalMvp.map((p) => [p.position, p.avgMvp]))
  const mvpRadarData: PositionRadarPoint[] = [1, 2, 3, 4, 5].map((pos) => ({
    positionLabel: POSITIONS[pos]?.label ?? `Position ${pos}`,
    playerAvg: playerMvpByPosition.get(pos) ?? 0,
    globalAvg: globalMvpByPosition.get(pos) ?? 0,
  }))

  const playerScoreByPosition = new Map(playerScore.map((p) => [p.position, p.avgScore]))
  const globalScoreByPosition = new Map(globalScore.map((p) => [p.position, p.avgScore]))
  const scoreRadarData: PositionRadarPoint[] = [1, 2, 3, 4, 5].map((pos) => ({
    positionLabel: POSITIONS[pos]?.label ?? `Position ${pos}`,
    playerAvg: playerScoreByPosition.get(pos) ?? 0,
    globalAvg: globalScoreByPosition.get(pos) ?? 0,
  }))

  // Strip the leading # for the external profile URL
  const iplIdForUrl = playerDetail.iplId.startsWith("#")
    ? playerDetail.iplId.slice(1)
    : playerDetail.iplId

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {playerDetail.currentCallsign}
          <a
            href={`https://www.iplaylaserforce.com/mission-stats/?t=${iplIdForUrl}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        </h1>
        {otherCallsigns.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Also known as:{" "}
            {otherCallsigns.map((h) => h.callsign).join(", ")}
          </p>
        )}
      </div>

      <PlayerTabs
        chartsContent={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Wins by Team Color</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlayerWinsByColorChart data={gameResults} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Average MVP by Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <PositionRadarChart data={mvpRadarData} />
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>MVP Distribution by Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <MvpBoxPlotChart data={playerBoxPlot} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Average Score by Position</CardTitle>
                </CardHeader>
                <CardContent>
                  <PositionRadarChart data={scoreRadarData} />
                </CardContent>
              </Card>
            </div>
          </div>
        }
        gamesContent={<PlayerGamesTable games={playerGames} />}
      />
    </div>
  )
}
