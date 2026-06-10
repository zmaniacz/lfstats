// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getPlayersLeaderboard,
  getPlayersMedicHitsLeaderboard,
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
import { PlayersLeaderboardTable } from "@/components/players/PlayersLeaderboardTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { TopPlayersAveragesTable } from "@/components/competitions/TopPlayersAveragesTable";
import { CommanderPlayersTable } from "@/components/competitions/CommanderPlayersTable";
import { HeavyPlayersTable } from "@/components/competitions/HeavyPlayersTable";
import { ScoutPlayersTable } from "@/components/competitions/ScoutPlayersTable";
import { AmmoPlayersTable } from "@/components/competitions/AmmoPlayersTable";
import { MedicPlayersTable } from "@/components/competitions/MedicPlayersTable";

export async function PlayersContent({
  useCompetitionView,
  competitionId,
  options,
  scopeFilter,
}: {
  useCompetitionView: boolean;
  competitionId: string;
  options: CompetitionTopPlayersOptions;
  scopeFilter: GameScopeFilter;
}) {
  if (useCompetitionView) {
    const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers, medicHits] =
      await Promise.all([
        getCompetitionTopPlayers(competitionId, options),
        getCompetitionCommanderPlayers(competitionId, options),
        getCompetitionHeavyPlayers(competitionId, options),
        getCompetitionScoutPlayers(competitionId, options),
        getCompetitionAmmoPlayers(competitionId, options),
        getCompetitionMedicPlayers(competitionId, options),
        getCompetitionMedicHitsLeaderboard(competitionId, options),
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

  const [overall, commanders, heavyWeapons, scouts, ammoCarriers, medics, medicHits] =
    await Promise.all([
      getPlayersLeaderboard({ scopeFilter }),
      getPlayersLeaderboard({ scopeFilter, position: 1 }),
      getPlayersLeaderboard({ scopeFilter, position: 2 }),
      getPlayersLeaderboard({ scopeFilter, position: 3 }),
      getPlayersLeaderboard({ scopeFilter, position: 4 }),
      getPlayersLeaderboard({ scopeFilter, position: 5 }),
      getPlayersMedicHitsLeaderboard({ scopeFilter }),
    ]);

  return (
    <>
      <PlayersLeaderboardTable players={overall} title="Overall" />
      <PlayersLeaderboardTable players={commanders} title="Commander" />
      <PlayersLeaderboardTable players={heavyWeapons} title="Heavy Weapons" />
      <PlayersLeaderboardTable players={scouts} title="Scout" />
      <PlayersLeaderboardTable players={ammoCarriers} title="Ammo Carrier" />
      <PlayersLeaderboardTable players={medics} title="Medic" />
      <MedicHitsLeaderboardTable players={medicHits} />
    </>
  );
}
