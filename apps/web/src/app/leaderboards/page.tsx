// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardsContent } from "@/components/competitions/LeaderboardsContent";
import { LeaderboardsSkeleton } from "@/components/competitions/LeaderboardsSkeleton";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { LaserballStub } from "@/components/laserball/LaserballStub";
import { resolveFilterContext, resolveGameType, toGameScopeFilter } from "@/lib/filter-context";

export const metadata: Metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    from?: string;
    to?: string;
    pool?: string;
    finals?: string;
    mercs?: string;
    game?: string;
  }>;
}) {
  const sp = await searchParams;
  const gameType = await resolveGameType(sp.game);
  const ctx = await resolveFilterContext(sp, { gameType });

  // Same loser-board stats for every scope. pool/finals/mercs only apply when a
  // specific competition is selected (they depend on the round structure).
  const showPool = sp.pool !== "0";
  const showFinals = sp.finals === "1";
  const showMercs = sp.mercs === "1";
  const options = { showPool, showFinals, showMercs };
  const scopeFilter = toGameScopeFilter(ctx);
  const specificCompetition =
    gameType === "sm5" && ctx.scope === "competition" && ctx.competition !== null;

  const contentKey = [
    gameType,
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
    ctx.dateFrom,
    ctx.dateTo,
    showPool,
    showFinals,
    showMercs,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Leader (Loser) Boards</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <GameTypeToggle active={gameType} />
          <FilterBar
            basePath="/leaderboards"
            gameType={gameType}
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            activeDateFrom={ctx.dateFrom}
            activeDateTo={ctx.dateTo}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{
              pool: sp.pool,
              finals: sp.finals,
              mercs: sp.mercs,
              game: gameType === "lb" ? "lb" : null,
            }}
          />
        </div>
      </div>

      {gameType === "lb" ? (
        <LaserballStub feature="leaderboards" />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
