// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import { getCompetitiveCompetitions, getCompetitionTopPlayers, getCompetitionCommanderPlayers, getCompetitionHeavyPlayers, getCompetitionScoutPlayers, getCompetitionAmmoPlayers, getCompetitionMedicPlayers } from "@lfstats/db"
import { CompetitionSelector } from "../standings/CompetitionSelector"
import { TopPlayersAveragesTable } from "@/components/competitions/TopPlayersAveragesTable"
import { CommanderPlayersTable } from "@/components/competitions/CommanderPlayersTable"
import { HeavyPlayersTable } from "@/components/competitions/HeavyPlayersTable"
import { ScoutPlayersTable } from "@/components/competitions/ScoutPlayersTable"
import { AmmoPlayersTable } from "@/components/competitions/AmmoPlayersTable"
import { MedicPlayersTable } from "@/components/competitions/MedicPlayersTable"
import { TopPlayersFilters } from "./TopPlayersFilters"


export default async function TopPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; pool?: string; finals?: string; mercs?: string }>
}) {
  const { competition: competitionId, pool, finals, mercs } = await searchParams

  const showPool = pool !== "0"
  const showFinals = finals === "1"
  const showMercs = mercs === "1"

  const competitions = await getCompetitiveCompetitions()

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Top Players</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = competitionId ?? competitions[0].id
  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const options = { showPool, showFinals, showMercs }
  const [players, commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers] = await Promise.all([
    getCompetitionTopPlayers(activeId, options),
    getCompetitionCommanderPlayers(activeId, options),
    getCompetitionHeavyPlayers(activeId, options),
    getCompetitionScoutPlayers(activeId, options),
    getCompetitionAmmoPlayers(activeId, options),
    getCompetitionMedicPlayers(activeId, options),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Top Players</h2>
        <CompetitionSelector
          competitions={competitions}
          activeId={activeId}
          activeParamBase="/competitions/top-players"
        />
      </div>

      <TopPlayersFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionId={activeId}
      />

      <TopPlayersAveragesTable players={players} />

      <CommanderPlayersTable players={commanders} />

      <HeavyPlayersTable players={heavyPlayers} />

      <ScoutPlayersTable players={scoutPlayers} />

      <AmmoPlayersTable players={ammoPlayers} />

      <MedicPlayersTable players={medicPlayers} />
    </div>
  )
}
