// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { LeaderboardsContent } from "@/components/competitions/LeaderboardsContent";
import { LeaderboardsSkeleton } from "@/components/competitions/LeaderboardsSkeleton";
import { FilterBar } from "@/components/filters/FilterBar";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export default async function LeaderboardsPage({
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

  // Same loser-board stats for every scope. pool/finals/mercs only apply when a
  // specific competition is selected (they depend on the round structure).
  const showPool = sp.pool !== "0";
  const showFinals = sp.finals === "1";
  const showMercs = sp.mercs === "1";
  const options = { showPool, showFinals, showMercs };
  const scopeFilter = toGameScopeFilter(ctx);
  const specificCompetition = ctx.scope === "competition" && ctx.competition !== null;

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
        <h1 className="text-2xl font-bold">Leader (Loser) Boards</h1>
        <FilterBar
          basePath="/leaderboards"
          scope={ctx.scope}
          activeCenterSlug={ctx.center?.slug ?? null}
          activeCompetitionSlug={ctx.competition?.slug ?? null}
          centers={ctx.centers}
          competitions={ctx.competitions}
          extras={{ pool: sp.pool, finals: sp.finals, mercs: sp.mercs }}
        />
      </div>

      {specificCompetition && ctx.competition && (
        <ScopeExtraToggles
          basePath="/leaderboards"
          competitionSlug={ctx.competition.slug}
          showPool={showPool}
          showFinals={showFinals}
          showMercs={showMercs}
        />
      )}

      <Suspense key={contentKey} fallback={<LeaderboardsSkeleton />}>
        <LeaderboardsContent scopeFilter={scopeFilter} options={options} />
      </Suspense>
    </div>
  );
}
