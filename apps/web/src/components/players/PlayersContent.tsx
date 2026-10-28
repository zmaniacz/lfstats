// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getCompetitionTopPlayers,
  getCompetitionCommanderPlayers,
  getCompetitionHeavyPlayers,
  getCompetitionScoutPlayers,
  getCompetitionAmmoPlayers,
  getCompetitionMedicPlayers,
  getCompetitionMedicHitsLeaderboard,
  getLegacyCompetitionTopPlayers,
  competitionHasLegacyGames,
  type GameScopeFilter,
  type CompetitionTopPlayersOptions,
} from "@lfstats/db";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { TopPlayersAveragesTable } from "@/components/competitions/TopPlayersAveragesTable";
import { CommanderPlayersTable } from "@/components/competitions/CommanderPlayersTable";
import { HeavyPlayersTable } from "@/components/competitions/HeavyPlayersTable";
import { ScoutPlayersTable } from "@/components/competitions/ScoutPlayersTable";
import { AmmoPlayersTable } from "@/components/competitions/AmmoPlayersTable";
import { MedicPlayersTable } from "@/components/competitions/MedicPlayersTable";
import { LegacyTopPlayersTable } from "@/components/competitions/LegacyTopPlayersTable";

export async function PlayersContent({
  options,
  scopeFilter,
}: {
  options: CompetitionTopPlayersOptions;
  scopeFilter: GameScopeFilter;
}) {
  // One competition with PDF-era games gets its own table; every other scope, including all
  // competitions together, stays TDF-only so PDF games never reach an aggregate.
  if (
    scopeFilter.scope === "competition" &&
    scopeFilter.competitionId &&
    (await competitionHasLegacyGames(scopeFilter.competitionId))
  ) {
    const legacyPlayers = await getLegacyCompetitionTopPlayers(scopeFilter, options);
    return <LegacyTopPlayersTable players={legacyPlayers} />;
  }

  const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers, medicHits] =
    await Promise.all([
      getCompetitionTopPlayers(scopeFilter, options),
      getCompetitionCommanderPlayers(scopeFilter, options),
      getCompetitionHeavyPlayers(scopeFilter, options),
      getCompetitionScoutPlayers(scopeFilter, options),
      getCompetitionAmmoPlayers(scopeFilter, options),
      getCompetitionMedicPlayers(scopeFilter, options),
      getCompetitionMedicHitsLeaderboard(scopeFilter, options),
    ]);

  return (
    <>
      <TopPlayersAveragesTable players={players} />
      <CommanderPlayersTable players={commanders} />
      <HeavyPlayersTable players={heavyPlayers} />
      <ScoutPlayersTable players={scoutPlayers} />
      <AmmoPlayersTable players={ammoPlayers} />
      <MedicPlayersTable players={medicPlayers} />
      <MedicHitsLeaderboardTable players={medicHits} />
    </>
  );
}
