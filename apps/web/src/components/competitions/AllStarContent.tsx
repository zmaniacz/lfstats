// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getCompetitionAllStarRankings, type CompetitionTopPlayersOptions } from "@lfstats/db";
import { AllStarPositionTable } from "@/components/competitions/AllStarPositionTable";
import { POSITIONS } from "@/lib/positions";

export async function AllStarContent({
  competitionId,
  options,
}: {
  competitionId: string;
  options: CompetitionTopPlayersOptions;
}) {
  const rankings = await getCompetitionAllStarRankings(competitionId, options);

  return (
    <>
      {([1, 2, 3, 4, 5] as const).map((pos) => (
        <AllStarPositionTable key={pos} title={POSITIONS[pos].label} players={rankings[pos]} />
      ))}
    </>
  );
}
