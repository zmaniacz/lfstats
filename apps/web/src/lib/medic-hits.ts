// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { NightlyScorecardRow } from "@/components/nightly/NightlyStatsTable";
import type { GameDetail, PlayerMedicHitsItem } from "@lfstats/db";

/**
 * Rolls a flat list of scorecard rows up into the medic-hits leaderboard shape.
 *
 * Resup positions (Ammo and Medic) get their own non-resup split, since a Scout/Heavy/
 * Commander medic-hit total is the interesting number and resup games would dilute it.
 * Shared by the nightly view and the no-scoring competition view, which present the same
 * leaderboard over different slices of games.
 */
export function deriveMedicHits(rows: NightlyScorecardRow[]): PlayerMedicHitsItem[] {
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

/** Flattens a list of fully-detailed games into one row per player scorecard. */
export function toScorecardRows(games: GameDetail[]): NightlyScorecardRow[] {
  return games.flatMap((game) => {
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
}
