// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getPlayerResultsByColor,
  getPlayerAvgMvpByPosition,
  getGlobalAvgMvpByPosition,
  getPlayerMvpBoxPlot,
  getPlayerAvgScoreByPosition,
  getGlobalAvgScoreByPosition,
  getPlayerGames,
  type GameScopeFilter,
} from "@lfstats/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerWinsByColorChart } from "@/components/players/PlayerWinsByColorChart";
import {
  PositionRadarChart,
  type PositionRadarPoint,
} from "@/components/charts/PositionRadarChart";
import { MvpBoxPlotChart } from "@/components/charts/MvpBoxPlotChart";
import { PlayerTabs } from "@/components/players/PlayerTabs";
import { PlayerGamesTable } from "@/components/players/PlayerGamesTable";
import { POSITIONS } from "@/lib/positions";

export async function PlayerDetailContent({
  playerId,
  scopeFilter,
}: {
  playerId: string;
  scopeFilter: GameScopeFilter;
}) {
  const [gameResults, playerMvp, globalMvp, playerBoxPlot, playerScore, globalScore, playerGames] =
    await Promise.all([
      getPlayerResultsByColor(playerId, scopeFilter),
      getPlayerAvgMvpByPosition(playerId, scopeFilter),
      getGlobalAvgMvpByPosition(scopeFilter),
      getPlayerMvpBoxPlot(playerId, scopeFilter),
      getPlayerAvgScoreByPosition(playerId, scopeFilter),
      getGlobalAvgScoreByPosition(scopeFilter),
      getPlayerGames(playerId, scopeFilter),
    ]);

  const playerMvpByPosition = new Map(playerMvp.map((p) => [p.position, p.avgMvp]));
  const globalMvpByPosition = new Map(globalMvp.map((p) => [p.position, p.avgMvp]));
  const mvpRadarData: PositionRadarPoint[] = [1, 2, 3, 4, 5].map((pos) => ({
    positionLabel: POSITIONS[pos]?.label ?? `Position ${pos}`,
    playerAvg: playerMvpByPosition.get(pos) ?? 0,
    globalAvg: globalMvpByPosition.get(pos) ?? 0,
  }));

  const playerScoreByPosition = new Map(playerScore.map((p) => [p.position, p.avgScore]));
  const globalScoreByPosition = new Map(globalScore.map((p) => [p.position, p.avgScore]));
  const scoreRadarData: PositionRadarPoint[] = [1, 2, 3, 4, 5].map((pos) => ({
    positionLabel: POSITIONS[pos]?.label ?? `Position ${pos}`,
    playerAvg: playerScoreByPosition.get(pos) ?? 0,
    globalAvg: globalScoreByPosition.get(pos) ?? 0,
  }));

  return (
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
  );
}
