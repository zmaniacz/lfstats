// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { GameMomentumChart } from "@/components/charts/GameMomentumChart";
import { buildMomentumSeries } from "@/lib/game-momentum-series";
import { getGameMomentumData } from "@lfstats/db";

type Props = {
  gameId: string;
  teamNames?: Map<string, string>;
};

export async function GameMomentumTab({ gameId, teamNames }: Props) {
  const data = await getGameMomentumData(gameId);

  if (!data || data.teams.length < 2) {
    return <p className="text-sm text-muted-foreground">Not enough team data for this game.</p>;
  }

  const [rawTeamA, rawTeamB] = data.teams;
  const teamA = { ...rawTeamA, teamName: teamNames?.get(rawTeamA.teamId) ?? rawTeamA.teamName };
  const teamB = { ...rawTeamB, teamName: teamNames?.get(rawTeamB.teamId) ?? rawTeamB.teamName };
  const { series, markers, yDomain } = buildMomentumSeries(data);

  return (
    <GameMomentumChart
      series={series}
      markers={markers}
      yDomain={yDomain}
      duration={data.duration}
      teamA={teamA}
      teamB={teamB}
    />
  );
}
