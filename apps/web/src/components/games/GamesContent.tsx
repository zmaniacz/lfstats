// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import {
  getGamesPage,
  getGamesCount,
  GAMES_PER_PAGE,
  getCompetitionGamesPage,
  getCompetitionGamesCount,
  getExcludedCompetitionGames,
  COMPETITION_GAMES_PER_PAGE,
} from "@lfstats/db";
import { GamesTable } from "@/components/games/GamesTable";
import { CompetitionGamesTable } from "@/components/games/CompetitionGamesTable";
import { Button } from "@/components/ui/button";
import { buildFilterUrl, type FilterUrlState } from "@/components/filters/filter-url";
import { toGameScopeFilter, type FilterContext } from "@/lib/filter-context";

export async function GamesContent({
  ctx,
  urlState,
  page,
  dateSearch,
  useCompetitionView,
}: {
  ctx: FilterContext;
  urlState: FilterUrlState;
  page: number;
  dateSearch: string;
  useCompetitionView: boolean;
}) {
  if (useCompetitionView && ctx.competition) {
    const [games, total, excludedGames] = await Promise.all([
      getCompetitionGamesPage(ctx.competition.id, page),
      getCompetitionGamesCount(ctx.competition.id),
      getExcludedCompetitionGames(ctx.competition.id),
    ]);
    const totalPages = Math.ceil(total / COMPETITION_GAMES_PER_PAGE);

    function pageUrl(p: number) {
      return buildFilterUrl("/games", urlState, { page: p > 1 ? String(p) : null });
    }

    return (
      <div className="space-y-4">
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
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                )}
                {page < totalPages ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={pageUrl(page + 1)}>Next</Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
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
    );
  }

  const filters = { scopeFilter: toGameScopeFilter(ctx), dateSearch: dateSearch || undefined };
  const [games, total] = await Promise.all([getGamesPage(page, filters), getGamesCount(filters)]);
  const totalPages = Math.ceil(total / GAMES_PER_PAGE);

  function pageUrl(p: number) {
    return buildFilterUrl("/games", urlState, {
      page: p > 1 ? String(p) : null,
      date: dateSearch || null,
    });
  }

  return (
    <div className="space-y-4">
      <GamesTable games={games} />

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
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={pageUrl(page + 1)}>Next</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
