// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { MvpModelRef } from "@lfstats/db";
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
  mvpModel,
}: {
  options: CompetitionTopPlayersOptions;
  scopeFilter: GameScopeFilter;
  mvpModel?: MvpModelRef | null;
}) {
  // One competition with PDF-era games gets its own table; every other scope, including all
  // competitions together, stays TDF-only so PDF games never reach an aggregate.
  if (
    scopeFilter.scope === "competition" &&
    scopeFilter.competitionId &&
    (await competitionHasLegacyGames(scopeFilter.competitionId))
  ) {
    const legacyPlayers = await getLegacyCompetitionTopPlayers(scopeFilter, options, mvpModel);
    return <LegacyTopPlayersTable players={legacyPlayers} />;
  }

  const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers, medicHits] =
    await Promise.all([
      getCompetitionTopPlayers(scopeFilter, options, mvpModel),
      getCompetitionCommanderPlayers(scopeFilter, options, mvpModel),
      getCompetitionHeavyPlayers(scopeFilter, options, mvpModel),
      getCompetitionScoutPlayers(scopeFilter, options, mvpModel),
      getCompetitionAmmoPlayers(scopeFilter, options, mvpModel),
      getCompetitionMedicPlayers(scopeFilter, options, mvpModel),
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
