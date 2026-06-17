// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LbWinLossChart } from "@/components/players/LbWinLossChart";
import { LbPlayerGamesTable } from "@/components/players/LbPlayerGamesTable";
import { PlayerTabs } from "@/components/players/PlayerTabs";
import { getLbPlayerWinLoss, getLbPlayerGames, type GameScopeFilter } from "@lfstats/db";

export async function LbPlayerDetailContent({
  playerId,
  scopeFilter,
}: {
  playerId: string;
  scopeFilter: GameScopeFilter;
}) {
  const [winLoss, games] = await Promise.all([
    getLbPlayerWinLoss(playerId, scopeFilter),
    getLbPlayerGames(playerId, scopeFilter),
  ]);

  return (
    <PlayerTabs
      chartsContent={
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Win / Loss</CardTitle>
            </CardHeader>
            <CardContent>
              <LbWinLossChart data={winLoss} />
            </CardContent>
          </Card>
        </div>
      }
      gamesContent={<LbPlayerGamesTable games={games} />}
    />
  );
}
