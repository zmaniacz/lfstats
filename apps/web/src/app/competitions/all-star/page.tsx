// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import { getCompetitiveCompetitions, getCompetitionAllStarRankings } from "@lfstats/db"
import { CompetitionSelector } from "../standings/CompetitionSelector"
import { AllStarPositionTable } from "@/components/competitions/AllStarPositionTable"
import { AllStarFilters } from "./AllStarFilters"
import { POSITIONS } from "@/lib/positions"
import { resolveActiveCompetitionId } from "@/lib/active-competition"

export default async function AllStarPage({
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
        <h2 className="text-xl font-semibold">All-Star Rankings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = await resolveActiveCompetitionId(competitions, competitionId)
  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const options = { showPool, showFinals, showMercs }
  const rankings = await getCompetitionAllStarRankings(activeId, options)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">All-Star Rankings</h2>
        <CompetitionSelector
          competitions={competitions}
          activeId={activeId}
          activeParamBase="/competitions/all-star"
        />
      </div>

      <AllStarFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionId={activeId}
      />

      {([1, 2, 3, 4, 5] as const).map((pos) => (
        <AllStarPositionTable
          key={pos}
          title={POSITIONS[pos].label}
          players={rankings[pos]}
        />
      ))}
    </div>
  )
}
