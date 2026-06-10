// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { PlayersContent } from "@/components/players/PlayersContent";
import { PlayersSkeleton } from "@/components/players/PlayersSkeleton";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    pool?: string;
    finals?: string;
    mercs?: string;
  }>;
}) {
  const sp = await searchParams;
  const ctx = await resolveFilterContext(sp);

  const useCompetitionView = ctx.scope === "competition" && ctx.competition !== null;

  const showPool = sp.pool !== "0";
  const showFinals = sp.finals === "1";
  const showMercs = sp.mercs === "1";
  const options = { showPool, showFinals, showMercs };

  const contentKey = [
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
    showPool,
    showFinals,
    showMercs,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Players</h1>
        <FilterBar
          basePath="/players"
          scope={ctx.scope}
          activeCenterSlug={ctx.center?.slug ?? null}
          activeCompetitionSlug={ctx.competition?.slug ?? null}
          centers={ctx.centers}
          competitions={ctx.competitions}
          extras={{ pool: sp.pool, finals: sp.finals, mercs: sp.mercs }}
        />
      </div>

      {useCompetitionView && ctx.competition && (
        <ScopeExtraToggles
          basePath="/players"
          competitionSlug={ctx.competition.slug}
          showPool={showPool}
          showFinals={showFinals}
          showMercs={showMercs}
        />
      )}

      <Suspense key={contentKey} fallback={<PlayersSkeleton />}>
        <PlayersContent
          useCompetitionView={useCompetitionView}
          competitionId={ctx.competition?.id ?? ""}
          options={options}
          scopeFilter={toGameScopeFilter(ctx)}
        />
      </Suspense>
    </div>
  );
}
