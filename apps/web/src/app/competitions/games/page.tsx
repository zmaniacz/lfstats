// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import {
  getCompetitiveCompetitions,
  getCompetitionGamesPage,
  getCompetitionGamesCount,
  COMPETITION_GAMES_PER_PAGE,
} from "@lfstats/db"
import { CompetitionGamesTable } from "@/components/games/CompetitionGamesTable"
import { CompetitionSelector } from "@/app/competitions/standings/CompetitionSelector"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { resolveActiveCompetitionId } from "@/lib/active-competition"

export default async function CompetitionGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; page?: string }>
}) {
  const { competition: competitionId, page: pageParam } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)

  const competitions = await getCompetitiveCompetitions()

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Games</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = await resolveActiveCompetitionId(competitions, competitionId)
  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const [games, total] = await Promise.all([
    getCompetitionGamesPage(activeId, page),
    getCompetitionGamesCount(activeId),
  ])
  const totalPages = Math.ceil(total / COMPETITION_GAMES_PER_PAGE)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    params.set("competition", activeId)
    if (p > 1) params.set("page", String(p))
    return `/competitions/games?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Games</h2>
        <CompetitionSelector
          competitions={competitions}
          activeId={activeId}
          activeParamBase="/competitions/games"
        />
      </div>

      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">No games found for this competition.</p>
      ) : (
        <>
          <CompetitionGamesTable games={games} />
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {total} games · page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageUrl(page - 1)}>Previous</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>Previous</Button>
              )}
              {page < totalPages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={pageUrl(page + 1)}>Next</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>Next</Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
