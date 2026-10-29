// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerStatLineChart } from "@/components/charts/PlayerStatLineChart";
import { LbCareerAveragesCard } from "@/components/players/LbCareerAveragesCard";
import { LbHeadToHeadTable } from "@/components/players/LbHeadToHeadTable";
import {
  LbResultsByColorTable,
  colorResultsFromGames,
} from "@/components/players/LbResultsByColorTable";
import { LbWinLossChart } from "@/components/players/LbWinLossChart";
import { LbPlayerGamesTable } from "@/components/players/LbPlayerGamesTable";
import { PlayerTabs } from "@/components/players/PlayerTabs";
import { buildLbStatSeries } from "@/lib/player-stat-series";
import {
  getLbPlayerAverages,
  getLbPlayerHeadToHead,
  getLbPlayerWinLoss,
  getLbPlayerGames,
  type GameScopeFilter,
} from "@lfstats/db";

const TREND_CHARTS = [
  { stat: "goals", title: "Goals by Game" },
  { stat: "assists", title: "Assists by Game" },
  { stat: "steals", title: "Steals by Game" },
  { stat: "blocks", title: "Blocks by Game" },
] as const;

export async function LbPlayerDetailContent({
  playerId,
  scopeFilter,
}: {
  playerId: string;
  scopeFilter: GameScopeFilter;
}) {
  const [winLoss, games, averages, headToHead] = await Promise.all([
    getLbPlayerWinLoss(playerId, scopeFilter),
    getLbPlayerGames(playerId, scopeFilter),
    // Every game the player played, mercenary ones included, as in the rest of the profile.
    getLbPlayerAverages(scopeFilter, { playerId, showMercs: true }),
    getLbPlayerHeadToHead(playerId, scopeFilter),
  ]);

  return (
    <PlayerTabs
      chartsContent={
        <div className="space-y-6">
          <LbCareerAveragesCard averages={averages[0] ?? null} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Win / Loss</CardTitle>
              </CardHeader>
              <CardContent>
                <LbWinLossChart data={winLoss} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Results by Team Colour</CardTitle>
              </CardHeader>
              <CardContent>
                <LbResultsByColorTable results={colorResultsFromGames(games)} />
              </CardContent>
            </Card>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {TREND_CHARTS.map((c) => (
              <Card key={c.stat}>
                <CardHeader>
                  <CardTitle>{c.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <PlayerStatLineChart
                    data={buildLbStatSeries(games, c.stat)}
                    format="avg"
                    showPositionFilter={false}
                    emptyMessage="No laserball games in this view."
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      }
      gamesContent={<LbPlayerGamesTable games={games} />}
      headToHeadContent={<LbHeadToHeadTable rows={headToHead} />}
    />
  );
}
