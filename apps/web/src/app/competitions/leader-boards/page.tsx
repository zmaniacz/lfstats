// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import {
  getCompetitiveCompetitions,
  getCompetitionPositionScorecards,
  getCompetitionGamesPlayed,
  getCompetitionTotalScore,
  getCompetitionTotalTime,
} from "@lfstats/db"
import { CompetitionSelector } from "../standings/CompetitionSelector"
import { LeaderBoardsFilters } from "./LeaderBoardsFilters"
import { PositionLeaderboardCard } from "@/components/competitions/PositionLeaderboardCard"
import { StatLeaderboardCard } from "@/components/competitions/StatLeaderboardCard"

export default async function LeaderBoardsPage({
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
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = competitionId ?? competitions[0].id
  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const options = { showPool, showFinals, showMercs }
  const [
    commanders, heavyPlayers, scoutPlayers, ammoPlayers, medicPlayers,
    gamesPlayed, totalScore, totalTime,
  ] = await Promise.all([
    getCompetitionPositionScorecards(activeId, 1, options),
    getCompetitionPositionScorecards(activeId, 2, options),
    getCompetitionPositionScorecards(activeId, 3, options),
    getCompetitionPositionScorecards(activeId, 4, options),
    getCompetitionPositionScorecards(activeId, 5, options),
    getCompetitionGamesPlayed(activeId, options),
    getCompetitionTotalScore(activeId, options),
    getCompetitionTotalTime(activeId, options),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Leader (Loser) Boards</h2>
        <CompetitionSelector
          competitions={competitions}
          activeId={activeId}
          activeParamBase="/competitions/leader-boards"
        />
      </div>

      <LeaderBoardsFilters
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
        competitionId={activeId}
      />

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Positions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PositionLeaderboardCard title="Commander" scorecards={commanders} />
          <PositionLeaderboardCard title="Heavy Weapons" scorecards={heavyPlayers} />
          <PositionLeaderboardCard title="Scout" scorecards={scoutPlayers} />
          <PositionLeaderboardCard title="Ammo Carrier" scorecards={ammoPlayers} />
          <PositionLeaderboardCard title="Medic" scorecards={medicPlayers} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Games and Points</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatLeaderboardCard
            title="Total Games Played"
            colLabel="Games"
            rows={gamesPlayed.map((r) => ({ ...r, value: r.totalGames }))}
            format="integer"
          />
          <StatLeaderboardCard
            title="Total Score"
            colLabel="Score"
            rows={totalScore.map((r) => ({ ...r, value: r.totalScore }))}
            format="score"
          />
          <StatLeaderboardCard
            title="Total Time Played"
            colLabel="Time"
            rows={totalTime.map((r) => ({ ...r, value: r.totalTimeMs }))}
            format="duration"
          />
        </div>
      </div>
    </div>
  )
}
