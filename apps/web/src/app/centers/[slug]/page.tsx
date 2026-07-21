// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import {
  getCenterBySlug,
  getCenterGameCount,
  getCenterWinsByColor,
  getCenterMvpBoxPlot,
  getCenterMvpComponents,
  type GameScopeFilter,
} from "@lfstats/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WinsByColorChart } from "@/components/centers/WinsByColorChart";
import { MvpBoxPlotChart } from "@/components/centers/MvpBoxPlotChart";
import { MvpComponentsChart } from "@/components/centers/MvpComponentsChart";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { LaserballStub } from "@/components/laserball/LaserballStub";
import { resolveFilterContext, resolveGameType } from "@/lib/filter-context";

const getCenter = cache(getCenterBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const centerDetail = await getCenter(slug);
  if (!centerDetail) return { title: "Center Not Found" };

  return { title: centerDetail.name };
}

export default async function CenterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    scope?: string;
    competition?: string;
    from?: string;
    to?: string;
    game?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const gameType = await resolveGameType(sp.game);

  const centerDetail = await getCenter(slug);
  if (!centerDetail) notFound();

  const ctx = await resolveFilterContext(sp, { gameType });

  // Center is fixed to this page's center, so the scope filter never carries
  // a centerId — every query below ANDs its own eq(game.centerId, id) instead.
  const scopeFilter: GameScopeFilter =
    ctx.scope === "competition"
      ? ctx.competition
        ? { scope: "competition", competitionId: ctx.competition.id }
        : { scope: "competition" }
      : {
          scope: ctx.scope,
          ...(ctx.dateFrom && { dateFrom: ctx.dateFrom }),
          ...(ctx.dateTo && { dateTo: ctx.dateTo }),
        };

  const filterBar = (
    <div className="flex items-center gap-3 flex-wrap">
      <GameTypeToggle active={gameType} />
      <FilterBar
        basePath={`/centers/${slug}`}
        mode="center-detail"
        gameType={gameType}
        scope={ctx.scope}
        activeCenterSlug={null}
        activeCompetitionSlug={ctx.competition?.slug ?? null}
        activeDateFrom={ctx.dateFrom}
        activeDateTo={ctx.dateTo}
        centers={ctx.centers}
        competitions={ctx.competitions}
        extras={{ game: gameType === "lb" ? "lb" : null }}
      />
    </div>
  );

  const header = (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold">{centerDetail.name}</h1>
      <div className="text-sm text-muted-foreground space-y-0.5">
        {centerDetail.city && (
          <p>
            {centerDetail.city}
            {centerDetail.countryName ? `, ${centerDetail.countryName}` : ""}
          </p>
        )}
      </div>
    </div>
  );

  if (gameType === "lb") {
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-4">
          {header}
          {filterBar}
        </div>
        <LaserballStub feature="center stats" />
      </div>
    );
  }

  const [gameCount, winsByColor, mvpBoxPlot, mvpComponents] = await Promise.all([
    getCenterGameCount(centerDetail.id, scopeFilter),
    getCenterWinsByColor(centerDetail.id, scopeFilter),
    getCenterMvpBoxPlot(centerDetail.id, scopeFilter),
    getCenterMvpComponents(centerDetail.id, scopeFilter),
  ]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        {header}
        {filterBar}
        <p className="text-sm text-muted-foreground">{gameCount.toLocaleString("en-US")} games</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Wins by Team Color</CardTitle>
          </CardHeader>
          <CardContent>
            <WinsByColorChart data={winsByColor} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MVP Distribution by Position</CardTitle>
          </CardHeader>
          <CardContent>
            <MvpBoxPlotChart data={mvpBoxPlot} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Average MVP Composition by Position</CardTitle>
        </CardHeader>
        <CardContent>
          <MvpComponentsChart data={mvpComponents} />
        </CardContent>
      </Card>
    </div>
  );
}
