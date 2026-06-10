// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  NightlyStatsTable,
  type NightlyScorecardRow,
} from "@/components/nightly/NightlyStatsTable";
import { NightlySummaryTable } from "@/components/nightly/NightlySummaryTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { GamesTable } from "@/components/games/GamesTable";
import {
  getNightlyDetails,
  getPlayerSocialAveragesByCenter,
  type PlayerMedicHitsItem,
} from "@lfstats/db";

function deriveMedicHits(rows: NightlyScorecardRow[]): PlayerMedicHitsItem[] {
  const map = new Map<
    string,
    { iplId: string; callsign: string; entries: NightlyScorecardRow[] }
  >();

  for (const row of rows) {
    if (!row.player.playerId || !row.player.iplId) continue;
    const key = row.player.playerId;
    if (!map.has(key)) {
      map.set(key, {
        iplId: row.player.iplId,
        callsign: row.player.callsign,
        entries: [],
      });
    }
    map.get(key)!.entries.push(row);
  }

  return Array.from(map.values())
    .map(({ iplId, callsign, entries }) => {
      const nonResup = entries.filter((r) => [1, 2, 3].includes(r.player.position));
      const totalMedicHits = entries.reduce((s, r) => s + r.player.medicHits, 0);
      const gamesPlayed = entries.length;
      const totalMedicHitsNonResup =
        nonResup.length > 0 ? nonResup.reduce((s, r) => s + r.player.medicHits, 0) : null;
      return {
        iplId,
        callsign,
        totalMedicHits,
        avgMedicHits: totalMedicHits / gamesPlayed,
        gamesPlayed,
        totalMedicHitsNonResup,
        avgMedicHitsNonResup:
          nonResup.length > 0 ? (totalMedicHitsNonResup as number) / nonResup.length : null,
        gamesPlayedNonResup: nonResup.length,
      };
    })
    .sort((a, b) => b.totalMedicHits - a.totalMedicHits);
}

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

  const rows: NightlyScorecardRow[] = gameDetails.flatMap((game) => {
    const winningTeam = game.teams.find((t) => t.result === "win");
    const winningTeamColorEnum = winningTeam?.colourEnum ?? null;

    return game.teams.flatMap((team) =>
      team.players.map((player) => ({
        player,
        teamColorEnum: team.colourEnum,
        teamResult: team.result,
        gameSlug: game.slug,
        gameStartTime: game.startTime,
        gameDescription: game.description,
        winningTeamColorEnum,
      })),
    );
  });

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
