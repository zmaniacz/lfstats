// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { AllStarContent } from "@/components/competitions/AllStarContent";
import { AllStarSkeleton } from "@/components/competitions/AllStarSkeleton";
import { resolveFilterContext } from "@/lib/filter-context";

export const metadata: Metadata = { title: "All-Star Rankings" };

export default async function AllStarPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    competition?: string;
    pool?: string;
    finals?: string;
    mercs?: string;
  }>;
}) {
  const sp = await searchParams;

  const showPool = sp.pool !== "0";
  const showFinals = sp.finals === "1";
  const showMercs = sp.mercs === "1";

  const ctx = await resolveFilterContext(sp, {
    allowedScopes: ["competition"],
    defaultScope: "competition",
  });

  if (ctx.competitions.length === 0 || !ctx.competition) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">All-Star Rankings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    );
  }

  const activeComp = ctx.competition;
  const options = { showPool, showFinals, showMercs };

  const contentKey = [activeComp.slug, showPool, showFinals, showMercs].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">All-Star Rankings</h2>
        <FilterBar
          basePath="/all-star"
          mode="competition-only"
          scope="competition"
          activeCenterSlug={null}
          activeCompetitionSlug={activeComp.slug}
          centers={ctx.centers}
          competitions={ctx.competitions}
        />
      </div>

      <ScopeExtraToggles
        basePath="/all-star"
        competitionSlug={activeComp.slug}
        showPool={showPool}
        showFinals={showFinals}
        showMercs={showMercs}
      />

      <Suspense key={contentKey} fallback={<AllStarSkeleton />}>
        <AllStarContent competitionId={activeComp.id} options={options} />
      </Suspense>
    </div>
  );
}
