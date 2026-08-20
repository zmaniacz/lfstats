// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NightlyStatsTable } from "@/components/nightly/NightlyStatsTable";
import { NightlySummaryTable } from "@/components/nightly/NightlySummaryTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { GamesTable } from "@/components/games/GamesTable";
import { deriveMedicHits, toScorecardRows } from "@/lib/medic-hits";
import { getCompetitionGameDetails } from "@lfstats/db";

/**
 * A `format = 'none'` competition's whole run, presented the way a social night is: every
 * scorecard, a per-player summary, the medic-hits leaderboard, and the game list — flat
 * across the entire event rather than broken out by day.
 *
 * Unlike the nightly view this passes no lifetime averages, so the summary table renders
 * without its ▲/▼ trend icons: those compare against a player's social average at one
 * center, which is not a meaningful baseline for a competitive event that may span several.
 */
export async function NoScoringContent({ competitionId }: { competitionId: string }) {
  const gameDetails = await getCompetitionGameDetails(competitionId);
  const rows = toScorecardRows(gameDetails);

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No games have been assigned to this event yet.</p>;
  }

  return (
    <>
      <NightlyStatsTable rows={rows} />
      <NightlySummaryTable rows={rows} />
      <MedicHitsLeaderboardTable players={deriveMedicHits(rows)} />
      <GamesTable games={gameDetails} />
    </>
  );
}
