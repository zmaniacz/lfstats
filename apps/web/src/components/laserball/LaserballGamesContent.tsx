// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getLbGamesList } from "@lfstats/db";
import { LaserballGamesTable } from "@/components/laserball/LaserballGamesTable";
import { toGameScopeFilter, type FilterContext } from "@/lib/filter-context";

export async function LaserballGamesContent({ ctx }: { ctx: FilterContext }) {
  const filters = { scopeFilter: toGameScopeFilter(ctx) };
  const games = await getLbGamesList(filters);

  if (games.length === 0) {
    return <p className="text-muted-foreground text-sm">No laserball games found.</p>;
  }

  return (
    <div className="space-y-4">
      <LaserballGamesTable games={games} />
    </div>
  );
}
