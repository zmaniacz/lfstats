import { DateFilter } from "@/components/nightly/DateFilter";
import { NightlyCenterFilter } from "@/components/nightly/NightlyCenterFilter";
import { NightlyStateManager } from "@/components/nightly/NightlyStateManager";
import { NightlyStateRestorer } from "@/components/nightly/NightlyStateRestorer";
import {
  NightlyStatsTable,
  type NightlyScorecardRow,
} from "@/components/nightly/NightlyStatsTable";
import { NightlySummaryTable } from "@/components/nightly/NightlySummaryTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { GamesTable } from "@/components/games/GamesTable";
import {
  getCenterList,
  getGameDatesForCenter,
  getNightlyDetails,
  getPlayerSocialAveragesByCenter,
  type PlayerMedicHitsItem,
} from "@lfstats/db";
import { Suspense } from "react";

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
      const nonResup = entries.filter((r) =>
        [1, 2, 3].includes(r.player.position),
      );
      const totalMedicHits = entries.reduce(
        (s, r) => s + r.player.shotsHitOpponentMedic,
        0,
      );
      const gamesPlayed = entries.length;
      const totalMedicHitsNonResup =
        nonResup.length > 0
          ? nonResup.reduce((s, r) => s + r.player.shotsHitOpponentMedic, 0)
          : null;
      return {
        iplId,
        callsign,
        totalMedicHits,
        avgMedicHits: totalMedicHits / gamesPlayed,
        gamesPlayed,
        totalMedicHitsNonResup,
        avgMedicHitsNonResup:
          nonResup.length > 0
            ? (totalMedicHitsNonResup as number) / nonResup.length
            : null,
        gamesPlayedNonResup: nonResup.length,
      };
    })
    .sort((a, b) => b.totalMedicHits - a.totalMedicHits);
}

export default async function NightlyPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; date?: string }>;
}) {
  const { center: centerId, date } = await searchParams;
  const today = new Date().toISOString().split("T")[0];

  const centers = await getCenterList();

  if (!centerId) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Nightly Stats</h1>
          <div className="flex items-center gap-2">
            <Suspense>
              <NightlyCenterFilter centers={centers} selected={centerId} />
            </Suspense>
            <Suspense>
              <DateFilter selected={date ?? today} gameDates={[]} />
            </Suspense>
          </div>
        </div>
        <NightlyStateRestorer>
          <p className="text-muted-foreground">
            Select a center to get started.
          </p>
        </NightlyStateRestorer>
      </div>
    );
  }

  const gameDates = await getGameDatesForCenter(centerId);
  const selectedDate = date ?? gameDates[0] ?? today;

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

  return (
    <>
      <NightlyStateManager center={centerId} date={selectedDate} />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Nightly Stats</h1>
          <div className="flex items-center gap-2">
            <Suspense>
              <NightlyCenterFilter centers={centers} selected={centerId} />
            </Suspense>
            <Suspense>
              <DateFilter selected={selectedDate} gameDates={gameDates} />
            </Suspense>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground">No games found for this date.</p>
        ) : (
          <>
            <NightlyStatsTable rows={rows} />
            <NightlySummaryTable rows={rows} lifetimeAvgs={lifetimeAvgs} />
            <MedicHitsLeaderboardTable players={deriveMedicHits(rows)} />
            <GamesTable games={gameDetails} />
          </>
        )}
      </div>
    </>
  );
}
