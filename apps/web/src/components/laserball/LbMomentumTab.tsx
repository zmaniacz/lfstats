// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { GameMomentumChart, MomentumMatchupHeader } from "@/components/charts/GameMomentumChart";
import { GameScoreChart } from "@/components/charts/GameScoreChart";
import { buildMomentumSeries, buildScoreSeries } from "@/lib/game-momentum-series";
import { getLbGameMomentumData } from "@lfstats/db";

type Props = {
  /** One game, or every half of a linked match; `label` heads each half's charts. */
  games: { gameId: string; label: string | null }[];
};

async function LbGameMomentumCharts({ gameId }: { gameId: string }) {
  const data = await getLbGameMomentumData(gameId);
  const [teamA, teamB] = data?.teams ?? [];
  if (!data || !teamA || !teamB) {
    return <p className="text-sm text-muted-foreground">Not enough team data for this game.</p>;
  }

  const { series, markers, yDomain } = buildMomentumSeries(data);
  return (
    <>
      <MomentumMatchupHeader teamA={teamA} teamB={teamB} />
      <GameMomentumChart
        series={series}
        markers={markers}
        yDomain={yDomain}
        duration={data.duration}
        teamA={teamA}
        teamB={teamB}
      />
      <GameScoreChart
        series={buildScoreSeries(data)}
        duration={data.duration}
        teamA={teamA}
        teamB={teamB}
        tickUnit={1}
      />
    </>
  );
}

export function LbMomentumTab({ games }: Props) {
  return (
    <div className="space-y-10">
      <p className="text-sm text-muted-foreground">
        Momentum weighs goals (●), steals and blocks, fading over about a minute.
      </p>
      {games.map((g) => (
        <section key={g.gameId} className="space-y-4">
          {g.label && <h3 className="text-lg font-semibold">{g.label}</h3>}
          <LbGameMomentumCharts gameId={g.gameId} />
        </section>
      ))}
    </div>
  );
}
