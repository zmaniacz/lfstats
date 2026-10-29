// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAvg, formatMs, formatWinRate } from "@/lib/format";
import type { LbPlayerAverages } from "@lfstats/db";

/** The player's per-game averages over the games in view. */
export function LbCareerAveragesCard({ averages }: { averages: LbPlayerAverages | null }) {
  const stats = averages
    ? [
        { label: "Games", value: averages.gamesPlayed.toLocaleString("en-US") },
        { label: "Win Rate", value: formatWinRate(averages.wins, averages.gamesPlayed) },
        { label: "Total Goals", value: averages.totalGoals.toLocaleString("en-US") },
        { label: "Avg Goals", value: formatAvg(averages.avgGoals) },
        { label: "Avg Assists", value: formatAvg(averages.avgAssists) },
        { label: "Avg Steals", value: formatAvg(averages.avgSteals) },
        { label: "Avg Blocks", value: formatAvg(averages.avgBlocks) },
        { label: "Avg Clears", value: formatAvg(averages.avgClears) },
        { label: "Avg Passes", value: formatAvg(averages.avgPasses) },
        { label: "Avg Possession", value: formatMs(averages.avgPossessionMs) },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Averages</CardTitle>
      </CardHeader>
      <CardContent>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No laserball games in this view.</p>
        ) : (
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
