// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { getLbGamesPage, getLbGamesCount, LB_GAMES_PER_PAGE } from "@lfstats/db";
import { LaserballGamesTable } from "@/components/laserball/LaserballGamesTable";
import { Button } from "@/components/ui/button";

export default async function LaserballGamesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; date?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const dateSearch = sp.date ?? "";

  const filters = { dateSearch: dateSearch || undefined };
  const [games, total] = await Promise.all([
    getLbGamesPage(page, filters),
    getLbGamesCount(filters),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LB_GAMES_PER_PAGE));

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (dateSearch) params.set("date", dateSearch);
    const qs = params.toString();
    return qs ? `/laserball/games?${qs}` : "/laserball/games";
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Laserball Games</h1>

      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">No laserball games found.</p>
      ) : (
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
      )}
    </div>
  );
}
