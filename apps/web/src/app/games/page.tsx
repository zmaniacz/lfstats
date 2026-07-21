// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { GamesContent } from "@/components/games/GamesContent";
import { GamesTableSkeleton } from "@/components/games/GamesTableSkeleton";
import { LaserballGamesContent } from "@/components/laserball/LaserballGamesContent";
import { resolveFilterContext, resolveGameType } from "@/lib/filter-context";

export const metadata: Metadata = { title: "Games" };

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    from?: string;
    to?: string;
    game?: string;
  }>;
}) {
  const sp = await searchParams;
  const gameType = await resolveGameType(sp.game);

  const ctx = await resolveFilterContext(sp, { gameType });

  // Specific competition selected → use the match-aware competition games view (SM5 only).
  const useCompetitionView =
    gameType === "sm5" && ctx.scope === "competition" && ctx.competition !== null;

  const contentKey = [
    gameType,
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
    ctx.dateFrom,
    ctx.dateTo,
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
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            activeDateFrom={ctx.dateFrom}
            activeDateTo={ctx.dateTo}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{ game: gameType === "lb" ? "lb" : null }}
          />
        </div>
      </div>

      <Suspense key={contentKey} fallback={<GamesTableSkeleton />}>
        {gameType === "lb" ? (
          <LaserballGamesContent ctx={ctx} />
        ) : (
          <GamesContent ctx={ctx} useCompetitionView={useCompetitionView} />
        )}
      </Suspense>
    </div>
  );
}
