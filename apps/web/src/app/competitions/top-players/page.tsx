// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getCompetitiveCompetitions,
  getCompetitionTopPlayers,
  getCompetitionCommanderPlayers,
  getCompetitionHeavyPlayers,
  getCompetitionScoutPlayers,
  getCompetitionAmmoPlayers,
  getCompetitionMedicPlayers,
  getCompetitionMedicHitsLeaderboard,
} from "@lfstats/db";
import { CompetitionSelector } from "../standings/CompetitionSelector";
import { TopPlayersAveragesTable } from "@/components/competitions/TopPlayersAveragesTable";
import { CommanderPlayersTable } from "@/components/competitions/CommanderPlayersTable";
import { HeavyPlayersTable } from "@/components/competitions/HeavyPlayersTable";
import { ScoutPlayersTable } from "@/components/competitions/ScoutPlayersTable";
import { AmmoPlayersTable } from "@/components/competitions/AmmoPlayersTable";
import { MedicPlayersTable } from "@/components/competitions/MedicPlayersTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { TopPlayersFilters } from "./TopPlayersFilters";
import { resolveActiveCompetition } from "@/lib/active-competition";

export default async function TopPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; pool?: string; finals?: string; mercs?: string }>;
}) {
  const { competition: competitionSlug, pool, finals, mercs } = await searchParams;

  const showPool = pool !== "0";
  const showFinals = finals === "1";
  const showMercs = mercs === "1";

  const competitions = await getCompetitiveCompetitions();

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Top Players</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    );
  }

  const activeComp = await resolveActiveCompetition(competitions, competitionSlug);
  const activeId = activeComp.id;

  const options = { showPool, showFinals, showMercs };
  const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers, medicHits] =
    await Promise.all([
      getCompetitionTopPlayers(activeId, options),
      getCompetitionCommanderPlayers(activeId, options),
      getCompetitionHeavyPlayers(activeId, options),
      getCompetitionScoutPlayers(activeId, options),
      getCompetitionAmmoPlayers(activeId, options),
      getCompetitionMedicPlayers(activeId, options),
      getCompetitionMedicHitsLeaderboard(activeId, options),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Top Players</h2>
        <CompetitionSelector
          competitions={competitions}
          activeSlug={activeComp.slug}
          activeParamBase="/competitions/top-players"
        />
      </div>

      <TopPlayersFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionSlug={activeComp.slug}
      />

      <TopPlayersAveragesTable players={players} />

      <CommanderPlayersTable players={commanders} />

      <HeavyPlayersTable players={heavyPlayers} />

      <ScoutPlayersTable players={scoutPlayers} />

      <AmmoPlayersTable players={ammoPlayers} />

      <MedicPlayersTable players={medicPlayers} />

      <MedicHitsLeaderboardTable players={medicHits} />
    </div>
  );
}
