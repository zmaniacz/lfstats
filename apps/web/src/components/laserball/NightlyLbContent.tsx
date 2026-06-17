// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getLbNightlyDetails } from "@lfstats/db";
import type { LbGameListItem } from "@lfstats/db";
import { NightlyLbStatsTable, type NightlyLbScorecardRow } from "./NightlyLbStatsTable";
import { NightlyLbSummaryTable } from "./NightlyLbSummaryTable";
import { LaserballGamesTable } from "./LaserballGamesTable";

export async function NightlyLbContent({
  centerId,
  selectedDate,
}: {
  centerId: string;
  selectedDate: string;
}) {
  const gameDetails = await getLbNightlyDetails(centerId, selectedDate);

  const rows: NightlyLbScorecardRow[] = gameDetails.flatMap((game) => {
    const winningTeam = game.teams.find((t) => t.result === "win");
    const winningTeamColourEnum = winningTeam?.colourEnum ?? null;

    return game.teams.flatMap((team) =>
      team.players.map((player) => ({
        player,
        teamColourEnum: team.colourEnum,
        teamResult: team.result,
        gameSlug: game.slug,
        gameStartTime: game.startTime,
        gameDescription: game.description,
        winningTeamColourEnum,
      })),
    );
  });

  if (rows.length === 0) {
    return <p className="text-muted-foreground">No games found for this date.</p>;
  }

  // Adapt LbGameDetail to LbGameListItem for the games table.
  const gameListItems: LbGameListItem[] = gameDetails.map((g) => ({
    id: g.id,
    slug: g.slug,
    centerSlug: g.slug.split("-").slice(0, 2).join("-"),
    startTime: g.startTime,
    outcome: g.outcome,
    centerName: g.centerName,
    description: g.description,
    teams: g.teams.map((t) => ({ colourEnum: t.colourEnum, score: t.score, result: t.result })),
  }));

  return (
    <>
      <NightlyLbStatsTable rows={rows} />
      <NightlyLbSummaryTable rows={rows} />
      <LaserballGamesTable games={gameListItems} />
    </>
  );
}
