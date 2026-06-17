// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { GamesDateFilter } from "@/components/games/GamesDateFilter";
import { GamesTableSkeleton } from "@/components/games/GamesTableSkeleton";
import { LaserballGamesContent } from "@/components/laserball/LaserballGamesContent";
import { resolveFilterContext } from "@/lib/filter-context";
import { type FilterUrlState } from "@/components/filters/filter-url";

export default async function LaserballGamesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    page?: string;
    date?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const dateSearch = sp.date ?? "";

  const ctx = await resolveFilterContext(sp, { gameType: "lb" });
  const urlState: FilterUrlState = {
    scope: ctx.scope,
    center: ctx.center?.slug ?? null,
    competition: ctx.competition?.slug ?? null,
  };

  const contentKey = [ctx.scope, urlState.center, urlState.competition, page, dateSearch].join("|");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Laserball Games</h1>
        <FilterBar
          basePath="/laserball/games"
          gameType="lb"
          scope={ctx.scope}
          activeCenterSlug={urlState.center}
          activeCompetitionSlug={urlState.competition}
          centers={ctx.centers}
          competitions={ctx.competitions}
          extras={{ date: dateSearch || null }}
        >
          <GamesDateFilter basePath="/laserball/games" state={urlState} date={dateSearch} />
        </FilterBar>
      </div>

      <Suspense key={contentKey} fallback={<GamesTableSkeleton />}>
        <LaserballGamesContent ctx={ctx} urlState={urlState} page={page} dateSearch={dateSearch} />
      </Suspense>
    </div>
  );
}
