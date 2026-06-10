// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { GamesDateFilter } from "@/components/games/GamesDateFilter";
import { GamesContent } from "@/components/games/GamesContent";
import { GamesTableSkeleton } from "@/components/games/GamesTableSkeleton";
import { resolveFilterContext } from "@/lib/filter-context";
import { type FilterUrlState } from "@/components/filters/filter-url";

export default async function GamesPage({
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

  const ctx = await resolveFilterContext(sp);
  const urlState: FilterUrlState = {
    scope: ctx.scope,
    center: ctx.center?.slug ?? null,
    competition: ctx.competition?.slug ?? null,
  };

  // Specific competition selected → use the match-aware competition games view.
  const useCompetitionView = ctx.scope === "competition" && ctx.competition !== null;

  // Any change to these dimensions should remount the Suspense boundary and
  // show the skeleton immediately, rather than leaving stale content visible.
  const contentKey = [ctx.scope, urlState.center, urlState.competition, page, dateSearch].join("|");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Games</h1>
        <FilterBar
          basePath="/games"
          scope={ctx.scope}
          activeCenterSlug={urlState.center}
          activeCompetitionSlug={urlState.competition}
          centers={ctx.centers}
          competitions={ctx.competitions}
          extras={{ date: dateSearch || null }}
        >
          {!useCompetitionView && (
            <GamesDateFilter basePath="/games" state={urlState} date={dateSearch} />
          )}
        </FilterBar>
      </div>

      <Suspense key={contentKey} fallback={<GamesTableSkeleton />}>
        <GamesContent
          ctx={ctx}
          urlState={urlState}
          page={page}
          dateSearch={dateSearch}
          useCompetitionView={useCompetitionView}
        />
      </Suspense>
    </div>
  );
}
