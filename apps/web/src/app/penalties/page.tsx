// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@/auth";
import { FilterBar } from "@/components/filters/FilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlayerPenaltiesContent, TeamPenaltiesContent } from "./PenaltiesContent";
import { PenaltiesSkeleton } from "./PenaltiesSkeleton";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export const metadata: Metadata = { title: "Penalties" };

export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;
  // Laserball has no penalties, so this page is SM5 only and offers no game-type toggle.
  const [ctx, session] = await Promise.all([resolveFilterContext(sp, { gameType: "sm5" }), auth()]);

  const roles = session?.user?.roles ?? [];
  // Editing rewrites competition results, so only enable it for a specific competition.
  const canEdit =
    ctx.scope === "competition" &&
    ctx.competition !== null &&
    roles.some((r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin");

  const heading =
    ctx.scope === "competition" && ctx.competition
      ? ctx.competition.name
      : (ctx.scope === "social" || ctx.scope === "all") && ctx.center
        ? ctx.center.name
        : "All Penalties";

  const contentKey = [
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
    ctx.dateFrom,
    ctx.dateTo,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Penalties</h1>
          <p className="text-sm text-muted-foreground">
            Space Marines 5 only. Laserball has no penalties.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <FilterBar
            basePath="/penalties"
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            activeDateFrom={ctx.dateFrom}
            activeDateTo={ctx.dateTo}
            centers={ctx.centers}
            competitions={ctx.competitions}
          />
        </div>
      </div>

      <Tabs defaultValue="players">
        <TabsList>
          <TabsTrigger value="players">Players</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
        </TabsList>
        <TabsContent value="players" className="mt-4">
          <Suspense key={contentKey} fallback={<PenaltiesSkeleton />}>
            <PlayerPenaltiesContent
              scopeFilter={toGameScopeFilter(ctx)}
              competitionId={ctx.competition?.id ?? ""}
              canEdit={canEdit}
              heading={heading}
            />
          </Suspense>
        </TabsContent>
        <TabsContent value="teams" className="mt-4">
          <Suspense key={contentKey} fallback={<PenaltiesSkeleton />}>
            <TeamPenaltiesContent
              scopeFilter={toGameScopeFilter(ctx)}
              competitionId={ctx.competition?.id ?? ""}
              canEdit={canEdit}
              heading={heading}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}
