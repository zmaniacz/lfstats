// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LbPlayerAveragesTable } from "@/components/laserball/LbPlayerAveragesTable";
import { MinGamesProvider } from "@/components/players/MinGamesContext";
import { LbResultsByColorTable } from "@/components/players/LbResultsByColorTable";
import { formatAvg, formatMs, formatPct } from "@/lib/format";
import {
  getLbCenterSummaries,
  getLbPlayerAverages,
  getLbResultsByColor,
  type GameScopeFilter,
} from "@lfstats/db";

export async function LbCenterDetailContent({
  centerId,
  scopeFilter,
}: {
  centerId: string;
  /** Carries no centerId: every query here narrows to this center itself. */
  scopeFilter: GameScopeFilter;
}) {
  const [summaries, colorResults, players] = await Promise.all([
    getLbCenterSummaries(scopeFilter, centerId),
    getLbResultsByColor(scopeFilter, centerId),
    getLbPlayerAverages(scopeFilter, { centerId }),
  ]);
  const summary = summaries[0];

  if (!summary) {
    return <p className="text-muted-foreground text-sm">No laserball games in this view.</p>;
  }

  const stats = [
    { label: "Games", value: summary.games.toLocaleString("en-US") },
    { label: "Players", value: summary.players.toLocaleString("en-US") },
    { label: "Avg Goals / Game", value: formatAvg(summary.avgGoalsPerGame) },
    { label: "Draw Rate", value: formatPct(summary.draws / summary.games) },
    { label: "Avg Length", value: formatMs(summary.avgDurationMs) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-xs text-muted-foreground">{s.label}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Results by Team Colour</CardTitle>
          </CardHeader>
          <CardContent>
            <LbResultsByColorTable results={colorResults} />
          </CardContent>
        </Card>
      </div>

      <MinGamesProvider enabled>
        <LbPlayerAveragesTable players={players} />
      </MinGamesProvider>
    </div>
  );
}
