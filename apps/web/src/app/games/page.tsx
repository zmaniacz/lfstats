// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { GamesDateFilter } from "@/components/games/GamesDateFilter";
import { GamesContent } from "@/components/games/GamesContent";
import { GamesTableSkeleton } from "@/components/games/GamesTableSkeleton";
import { LaserballGamesContent } from "@/components/laserball/LaserballGamesContent";
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
    game?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const dateSearch = sp.date ?? "";
  const gameType: "sm5" | "lb" = sp.game === "lb" ? "lb" : "sm5";

  const ctx = await resolveFilterContext(sp, { gameType });
  const urlState: FilterUrlState = {
    scope: ctx.scope,
    center: ctx.center?.slug ?? null,
    competition: ctx.competition?.slug ?? null,
  };

  // Specific competition selected → use the match-aware competition games view (SM5 only).
  const useCompetitionView =
    gameType === "sm5" && ctx.scope === "competition" && ctx.competition !== null;

  const contentKey = [
    gameType,
    ctx.scope,
    urlState.center,
    urlState.competition,
    page,
    dateSearch,
  ].join("|");

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Games</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <GameTypeToggle active={gameType} />
          <FilterBar
            basePath="/games"
            gameType={gameType}
            scope={ctx.scope}
            activeCenterSlug={urlState.center}
            activeCompetitionSlug={urlState.competition}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{ date: dateSearch || null, game: gameType === "lb" ? "lb" : null }}
          >
            {!useCompetitionView && (
              <GamesDateFilter
                basePath="/games"
                state={urlState}
                date={dateSearch}
                extras={{ game: gameType === "lb" ? "lb" : null }}
              />
            )}
          </FilterBar>
        </div>
      </div>

      <Suspense key={contentKey} fallback={<GamesTableSkeleton />}>
        {gameType === "lb" ? (
          <LaserballGamesContent
            ctx={ctx}
            urlState={urlState}
            page={page}
            dateSearch={dateSearch}
          />
        ) : (
          <GamesContent
            ctx={ctx}
            urlState={urlState}
            page={page}
            dateSearch={dateSearch}
            useCompetitionView={useCompetitionView}
          />
        )}
      </Suspense>
    </div>
  );
}
