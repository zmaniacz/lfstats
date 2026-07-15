// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getGamesList, getCompetitionGamesList, getExcludedCompetitionGames } from "@lfstats/db";
import { GamesTable } from "@/components/games/GamesTable";
import { CompetitionGamesTable } from "@/components/games/CompetitionGamesTable";
import { toGameScopeFilter, type FilterContext } from "@/lib/filter-context";

export async function GamesContent({
  ctx,
  dateSearch,
  useCompetitionView,
}: {
  ctx: FilterContext;
  dateSearch: string;
  useCompetitionView: boolean;
}) {
  if (useCompetitionView && ctx.competition) {
    const [games, excludedGames] = await Promise.all([
      getCompetitionGamesList(ctx.competition.id),
      getExcludedCompetitionGames(ctx.competition.id),
    ]);

    return (
      <div className="space-y-4">
        {games.length === 0 ? (
          <p className="text-muted-foreground text-sm">No games found for this competition.</p>
        ) : (
          <CompetitionGamesTable games={games} />
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
  const games = await getGamesList(filters);

  return (
    <div className="space-y-4">
      <GamesTable games={games} />
    </div>
  );
}
