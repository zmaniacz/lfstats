// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { getCompetitionRounds } from "@lfstats/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { RoundFilter } from "./RoundFilter";
import { StandingsContent } from "@/components/competitions/StandingsContent";
import { FinalsContent } from "@/components/competitions/FinalsContent";
import { StandingsSkeleton } from "@/components/competitions/StandingsSkeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { resolveFilterContext } from "@/lib/filter-context";

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; competition?: string; round?: string }>;
}) {
  const sp = await searchParams;
  const roundIdParam = sp.round;

  const ctx = await resolveFilterContext(sp, {
    allowedScopes: ["competition"],
    defaultScope: "competition",
  });

  if (ctx.competitions.length === 0 || !ctx.competition) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Standings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    );
  }

  const activeComp = ctx.competition;
  const activeId = activeComp.id;

  const allRounds = await getCompetitionRounds(activeId);
  const poolRounds = allRounds
    .filter((r) => r.type === "pool")
    .sort((a, b) => a.roundNumber - b.roundNumber);
  const finalsRounds = allRounds
    .filter((r) => r.type === "finals")
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const activeRoundId = poolRounds.some((r) => r.id === roundIdParam) ? roundIdParam! : null;

  const contentKey = [activeComp.slug, activeRoundId].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Standings</h2>
        <FilterBar
          basePath="/standings"
          mode="competition-only"
          scope="competition"
          activeCenterSlug={null}
          activeCompetitionSlug={activeComp.slug}
          centers={ctx.centers}
          competitions={ctx.competitions}
        />
      </div>

      <Tabs defaultValue="standings">
        <TabsList>
          <TabsTrigger value="standings">Standings</TabsTrigger>
          {finalsRounds.length > 0 && <TabsTrigger value="finals">Finals</TabsTrigger>}
        </TabsList>
        <TabsContent value="standings" className="space-y-6">
          {poolRounds.length > 1 && (
            <RoundFilter
              competitionSlug={activeComp.slug}
              rounds={poolRounds.map((r) => ({ id: r.id, name: r.name }))}
              activeRoundId={activeRoundId}
            />
          )}

          <Suspense key={contentKey} fallback={<StandingsSkeleton />}>
            <StandingsContent
              activeId={activeId}
              activeRoundId={activeRoundId}
              competitionSlug={activeComp.slug}
              competitionName={activeComp.name}
            />
          </Suspense>
        </TabsContent>
        {finalsRounds.length > 0 && (
          <TabsContent value="finals" className="space-y-6">
            <Suspense fallback={<StandingsSkeleton />}>
              <FinalsContent
                activeId={activeId}
                competitionSlug={activeComp.slug}
                challongeLink={activeComp.challongeLink}
              />
            </Suspense>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
