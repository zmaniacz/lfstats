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
} from "@lfstats/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { PlayersLeaderboardTable } from "@/components/players/PlayersLeaderboardTable";
import { MedicHitsLeaderboardTable } from "@/components/players/MedicHitsLeaderboardTable";
import { TopPlayersAveragesTable } from "@/components/competitions/TopPlayersAveragesTable";
import { CommanderPlayersTable } from "@/components/competitions/CommanderPlayersTable";
import { HeavyPlayersTable } from "@/components/competitions/HeavyPlayersTable";
import { ScoutPlayersTable } from "@/components/competitions/ScoutPlayersTable";
import { AmmoPlayersTable } from "@/components/competitions/AmmoPlayersTable";
import { MedicPlayersTable } from "@/components/competitions/MedicPlayersTable";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    pool?: string;
    finals?: string;
    mercs?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await resolveFilterContext(sp);

  const filterBar = (
    <FilterBar
      basePath="/players"
      scope={ctx.scope}
      activeCenterSlug={ctx.center?.slug ?? null}
      activeCompetitionSlug={ctx.competition?.slug ?? null}
      centers={ctx.centers}
      competitions={ctx.competitions}
      extras={{ pool: sp.pool, finals: sp.finals, mercs: sp.mercs }}
    />
  );

  // Specific competition → rich tournament tables with pool/finals/mercs toggles.
  if (ctx.scope === "competition" && ctx.competition) {
    const showPool = sp.pool !== "0";
    const showFinals = sp.finals === "1";
    const showMercs = sp.mercs === "1";
    const options = { showPool, showFinals, showMercs };
    const id = ctx.competition.id;

    const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers, medicHits] =
      await Promise.all([
        getCompetitionTopPlayers(id, options),
        getCompetitionCommanderPlayers(id, options),
        getCompetitionHeavyPlayers(id, options),
        getCompetitionScoutPlayers(id, options),
        getCompetitionAmmoPlayers(id, options),
        getCompetitionMedicPlayers(id, options),
        getCompetitionMedicHitsLeaderboard(id, options),
      ]);

    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold">Players</h1>
          {filterBar}
        </div>

        <ScopeExtraToggles
          basePath="/players"
          competitionSlug={ctx.competition.slug}
          showPool={showPool}
          showFinals={showFinals}
          showMercs={showMercs}
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

  // Social / all / competition-all → generic scope-aware leaderboards.
  const scopeFilter = toGameScopeFilter(ctx);
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Players</h1>
        {filterBar}
      </div>

      <PlayersLeaderboardTable players={overall} title="Overall" />
      <PlayersLeaderboardTable players={commanders} title="Commander" />
      <PlayersLeaderboardTable players={heavyWeapons} title="Heavy Weapons" />
      <PlayersLeaderboardTable players={scouts} title="Scout" />
      <PlayersLeaderboardTable players={ammoCarriers} title="Ammo Carrier" />
      <PlayersLeaderboardTable players={medics} title="Medic" />
      <MedicHitsLeaderboardTable players={medicHits} />
    </div>
  );
}
