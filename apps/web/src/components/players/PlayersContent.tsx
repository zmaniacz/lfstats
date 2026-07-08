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

export async function PlayersContent({
  options,
  scopeFilter,
}: {
  options: CompetitionTopPlayersOptions;
  scopeFilter: GameScopeFilter;
}) {
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
