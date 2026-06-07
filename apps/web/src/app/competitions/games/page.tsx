// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getCompetitiveCompetitions,
  getCompetitionGamesPage,
  getCompetitionGamesCount,
  getExcludedCompetitionGames,
  COMPETITION_GAMES_PER_PAGE,
} from "@lfstats/db"
import { CompetitionGamesTable } from "@/components/games/CompetitionGamesTable"
import { CompetitionSelector } from "@/app/competitions/standings/CompetitionSelector"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { resolveActiveCompetition } from "@/lib/active-competition"

export default async function CompetitionGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; page?: string }>
}) {
  const { competition: competitionSlug, page: pageParam } = await searchParams
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

  const activeComp = await resolveActiveCompetition(competitions, competitionSlug)
  const activeId = activeComp.id

  const [games, total, excludedGames] = await Promise.all([
    getCompetitionGamesPage(activeId, page),
    getCompetitionGamesCount(activeId),
    getExcludedCompetitionGames(activeId),
  ])
  const totalPages = Math.ceil(total / COMPETITION_GAMES_PER_PAGE)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    params.set("competition", activeComp.slug)
    if (p > 1) params.set("page", String(p))
    return `/competitions/games?${params.toString()}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Games</h2>
        <CompetitionSelector
          competitions={competitions}
          activeSlug={activeComp.slug}
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

      {excludedGames.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Excluded Games</h3>
          <CompetitionGamesTable games={excludedGames} />
        </div>
      )}
    </div>
  )
}
