// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { DualStatLeaderboardCard } from "@/components/competitions/DualStatLeaderboardCard";
import {
  StatLeaderboardCard,
  type StatFormat,
} from "@/components/competitions/StatLeaderboardCard";
import {
  getLbGameLeaderboard,
  getLbLeaderboardTotals,
  type GameScopeFilter,
  type LbGameLeaderboardRow,
  type LbLeaderboardTotals,
} from "@lfstats/db";

type TotalsKey = Exclude<keyof LbLeaderboardTotals, "playerId" | "iplId" | "callsign">;

/** One board over the per-player totals: zeroes dropped, top 100. */
function TotalsCard({
  totals,
  stat,
  title,
  colLabel,
  format = "integer",
}: {
  totals: LbLeaderboardTotals[];
  stat: TotalsKey;
  title: string;
  colLabel: string;
  format?: StatFormat;
}) {
  const rows = totals
    .filter((r) => r[stat] > 0)
    .sort((a, b) => b[stat] - a[stat])
    .slice(0, 100)
    .map((r) => ({ ...r, value: r[stat] }));
  return (
    <StatLeaderboardCard
      title={title}
      colLabel={colLabel}
      rows={rows}
      format={format}
      gameType="lb"
    />
  );
}

/** Total plus per-game average, for the core stats. */
function TotalAvgCard({
  totals,
  stat,
  title,
}: {
  totals: LbLeaderboardTotals[];
  stat: TotalsKey;
  title: string;
}) {
  const rows = totals
    .filter((r) => r[stat] > 0)
    .sort((a, b) => b[stat] - a[stat])
    .slice(0, 100)
    .map((r) => ({ ...r, value1: r[stat], value2: r[stat] / r.gamesPlayed }));
  return (
    <DualStatLeaderboardCard
      title={title}
      col1Label="Total"
      col2Label="Avg"
      rows={rows}
      format1="integer"
      format2="decimal"
      gameType="lb"
    />
  );
}

function GameCard({
  rows,
  title,
  colLabel,
}: {
  rows: LbGameLeaderboardRow[];
  title: string;
  colLabel: string;
}) {
  return (
    <StatLeaderboardCard
      title={title}
      colLabel={colLabel}
      rows={rows}
      format="integer"
      gameType="lb"
    />
  );
}

export async function LbLeaderboardsContent({ scopeFilter }: { scopeFilter: GameScopeFilter }) {
  const [totals, goals, assists, steals, blocks, clears, passes] = await Promise.all([
    getLbLeaderboardTotals(scopeFilter),
    getLbGameLeaderboard(scopeFilter, "goals"),
    getLbGameLeaderboard(scopeFilter, "assists"),
    getLbGameLeaderboard(scopeFilter, "steals"),
    getLbGameLeaderboard(scopeFilter, "blocks"),
    getLbGameLeaderboard(scopeFilter, "clears"),
    getLbGameLeaderboard(scopeFilter, "passes"),
  ]);

  return (
    <>
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Best Single Games</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <GameCard title="Goals" colLabel="Goals" rows={goals} />
          <GameCard title="Assists" colLabel="Assists" rows={assists} />
          <GameCard title="Steals" colLabel="Steals" rows={steals} />
          <GameCard title="Blocks" colLabel="Blocks" rows={blocks} />
          <GameCard title="Clears" colLabel="Clears" rows={clears} />
          <GameCard title="Passes" colLabel="Passes" rows={passes} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Career Totals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <TotalsCard
            totals={totals}
            stat="gamesPlayed"
            title="Total Games Played"
            colLabel="Games"
          />
          <TotalsCard
            totals={totals}
            stat="timePlayedMs"
            title="Total Time Played"
            colLabel="Time"
            format="duration"
          />
          <TotalAvgCard totals={totals} stat="goals" title="Total Goals" />
          <TotalAvgCard totals={totals} stat="assists" title="Total Assists" />
          <TotalAvgCard totals={totals} stat="steals" title="Total Steals" />
          <TotalAvgCard totals={totals} stat="blocks" title="Total Blocks" />
        </div>
      </div>
    </>
  );
}
