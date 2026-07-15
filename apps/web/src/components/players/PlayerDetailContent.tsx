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
  getPlayerHeadToHead,
  type GameScopeFilter,
} from "@lfstats/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerWinsByColorChart } from "@/components/players/PlayerWinsByColorChart";
import {
  PositionRadarChart,
  type PositionRadarPoint,
} from "@/components/charts/PositionRadarChart";
import { MvpBoxPlotChart } from "@/components/charts/MvpBoxPlotChart";
import { PlayerStatLineChart } from "@/components/charts/PlayerStatLineChart";
import { PlayerTabs } from "@/components/players/PlayerTabs";
import { PlayerGamesTable } from "@/components/players/PlayerGamesTable";
import { HeadToHeadTable } from "@/components/players/HeadToHeadTable";
import { POSITIONS } from "@/lib/positions";
import { buildStatSeries } from "@/lib/player-stat-series";

export async function PlayerDetailContent({
  playerId,
  scopeFilter,
}: {
  playerId: string;
  scopeFilter: GameScopeFilter;
}) {
  const [
    gameResults,
    playerMvp,
    globalMvp,
    playerBoxPlot,
    playerScore,
    globalScore,
    playerGames,
    headToHeadRows,
  ] = await Promise.all([
    getPlayerResultsByColor(playerId, scopeFilter),
    getPlayerAvgMvpByPosition(playerId, scopeFilter),
    getGlobalAvgMvpByPosition(scopeFilter),
    getPlayerMvpBoxPlot(playerId, scopeFilter),
    getPlayerAvgScoreByPosition(playerId, scopeFilter),
    getGlobalAvgScoreByPosition(scopeFilter),
    getPlayerGames(playerId, scopeFilter),
    getPlayerHeadToHead(playerId, scopeFilter),
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

  const mvpSeries = buildStatSeries(playerGames, "mvpPoints");
  const scoreSeries = buildStatSeries(playerGames, "score");
  const accuracySeries = buildStatSeries(playerGames, "accuracy");
  const hitDiffSeries = buildStatSeries(playerGames, "hitDiff");
  const medicHitsSeries = buildStatSeries(playerGames, "medicHits");

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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>MVP by Game</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerStatLineChart data={mvpSeries} format="mvp" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Score by Game</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerStatLineChart data={scoreSeries} format="score" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Accuracy by Game</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerStatLineChart data={accuracySeries} format="pct" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hit Diff by Game</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerStatLineChart data={hitDiffSeries} format="hitDiff" />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Medic Hits by Game</CardTitle>
              </CardHeader>
              <CardContent>
                <PlayerStatLineChart data={medicHitsSeries} format="score" />
              </CardContent>
            </Card>
          </div>
        </div>
      }
      gamesContent={<PlayerGamesTable games={playerGames} />}
      headToHeadContent={<HeadToHeadTable rows={headToHeadRows} />}
    />
  );
}
