// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NightlyStatsTable } from "@/components/nightly/NightlyStatsTable";
import { NightlySummaryTable } from "@/components/nightly/NightlySummaryTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { GamesTable } from "@/components/games/GamesTable";
import { deriveMedicHits, toScorecardRows } from "@/lib/medic-hits";
import { getNightlyDetails, getPlayerSocialAveragesByCenter } from "@lfstats/db";

export async function NightlyContent({
  centerId,
  selectedDate,
}: {
  centerId: string;
  selectedDate: string;
}) {
  const [gameDetails, lifetimeAvgsArr] = await Promise.all([
    getNightlyDetails(centerId, selectedDate),
    getPlayerSocialAveragesByCenter(centerId),
  ]);

  const lifetimeAvgs = new Map(lifetimeAvgsArr.map((a) => [a.playerId, a]));

  const rows = toScorecardRows(gameDetails);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No games found for this date.</p>;
  }

  return (
    <>
      <NightlyStatsTable rows={rows} />
      <NightlySummaryTable rows={rows} lifetimeAvgs={lifetimeAvgs} />
      <MedicHitsLeaderboardTable players={deriveMedicHits(rows)} />
      <GamesTable games={gameDetails} />
    </>
  );
}
