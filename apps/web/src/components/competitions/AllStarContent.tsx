// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { MvpModelRef } from "@lfstats/db";
import {
  getCompetitionAllStarRankings,
  type CompetitionFormat,
  type CompetitionTopPlayersOptions,
} from "@lfstats/db";
import { AllStarPositionTable } from "@/components/competitions/AllStarPositionTable";
import { POSITIONS } from "@/lib/positions";

export async function AllStarContent({
  competitionId,
  options,
  format,
  mvpModel,
}: {
  competitionId: string;
  options: CompetitionTopPlayersOptions;
  format: CompetitionFormat;
  mvpModel?: MvpModelRef | null;
}) {
  const rankings = await getCompetitionAllStarRankings(competitionId, options, format, mvpModel);

  return (
    <>
      {([1, 2, 3, 4, 5] as const).map((pos) => (
        <AllStarPositionTable key={pos} title={POSITIONS[pos].label} players={rankings[pos]} />
      ))}
    </>
  );
}
