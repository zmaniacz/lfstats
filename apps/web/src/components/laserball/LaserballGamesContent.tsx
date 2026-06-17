// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { getLbGamesPage, getLbGamesCount, LB_GAMES_PER_PAGE } from "@lfstats/db";
import { LaserballGamesTable } from "@/components/laserball/LaserballGamesTable";
import { Button } from "@/components/ui/button";
import { buildFilterUrl, type FilterUrlState } from "@/components/filters/filter-url";
import { toGameScopeFilter, type FilterContext } from "@/lib/filter-context";

export async function LaserballGamesContent({
  ctx,
  urlState,
  page,
  dateSearch,
}: {
  ctx: FilterContext;
  urlState: FilterUrlState;
  page: number;
  dateSearch: string;
}) {
  const filters = { scopeFilter: toGameScopeFilter(ctx), dateSearch: dateSearch || undefined };
  const [games, total] = await Promise.all([
    getLbGamesPage(page, filters),
    getLbGamesCount(filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LB_GAMES_PER_PAGE));

  function pageUrl(p: number) {
    return buildFilterUrl("/laserball/games", urlState, {
      page: p > 1 ? String(p) : null,
      date: dateSearch || null,
    });
  }

  if (games.length === 0) {
    return <p className="text-muted-foreground text-sm">No laserball games found.</p>;
  }

  return (
    <div className="space-y-4">
      <LaserballGamesTable games={games} />
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
