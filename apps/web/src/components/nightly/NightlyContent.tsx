// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NightlyStatsTable } from "@/components/nightly/NightlyStatsTable";
import { NightlySummaryTable } from "@/components/nightly/NightlySummaryTable";
import { NightlyLegacyStatsTable } from "@/components/nightly/NightlyLegacyStatsTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { GamesTable } from "@/components/games/GamesTable";
import { deriveMedicHits, toScorecardRows } from "@/lib/medic-hits";
import {
  getGamesList,
  getNightlyDetails,
  getNightlyPdfScorecards,
  getPlayerSocialAveragesByCenter,
} from "@lfstats/db";

export async function NightlyContent({
  centerId,
  selectedDate,
}: {
  centerId: string;
  selectedDate: string;
}) {
  const [gameDetails, lifetimeAvgsArr, legacyGames, legacyRows] = await Promise.all([
    getNightlyDetails(centerId, selectedDate),
    getPlayerSocialAveragesByCenter(centerId),
    getGamesList({
      centerId,
      gameTypes: ["sm5_pdf"],
      scopeFilter: { scope: "social", dateFrom: selectedDate, dateTo: selectedDate },
    }),
    getNightlyPdfScorecards(centerId, selectedDate),
  ]);

  const lifetimeAvgs = new Map(lifetimeAvgsArr.map((a) => [a.playerId, a]));

  const rows = toScorecardRows(gameDetails);

  if (rows.length === 0 && legacyRows.length === 0) {
    return <p className="text-muted-foreground">No games found for this date.</p>;
  }

  // Legacy PDF-era games are listed (and badged) with the night's games, but only the
  // modern ones feed the stats, summary and medic-hit tables.
  const games = [...gameDetails, ...legacyGames].sort(
    (a, b) => b.startTime.getTime() - a.startTime.getTime(),
  );

  return (
    <>
      {rows.length > 0 && (
        <>
          <NightlyStatsTable rows={rows} />
          <NightlySummaryTable rows={rows} lifetimeAvgs={lifetimeAvgs} />
          <MedicHitsLeaderboardTable players={deriveMedicHits(rows)} />
        </>
      )}
      {legacyRows.length > 0 && <NightlyLegacyStatsTable rows={legacyRows} />}
      <GamesTable games={games} />
    </>
  );
}
