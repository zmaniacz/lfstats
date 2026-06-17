// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { ScopeExtraToggles } from "@/components/filters/ScopeExtraToggles";
import { PlayersContent } from "@/components/players/PlayersContent";
import { PlayersSkeleton } from "@/components/players/PlayersSkeleton";
import { LaserballStub } from "@/components/laserball/LaserballStub";
import { resolveFilterContext, resolveGameType, toGameScopeFilter } from "@/lib/filter-context";

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
    game?: string;
  }>;
}) {
  const sp = await searchParams;
  const gameType = await resolveGameType(sp.game);
  const ctx = await resolveFilterContext(sp, { gameType });

  const useCompetitionView =
    gameType === "sm5" && ctx.scope === "competition" && ctx.competition !== null;

  const showPool = sp.pool !== "0";
  const showFinals = sp.finals === "1";
  const showMercs = sp.mercs === "1";
  const options = { showPool, showFinals, showMercs };

  const contentKey = [
    gameType,
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
    showPool,
    showFinals,
    showMercs,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Players</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <GameTypeToggle active={gameType} />
          <FilterBar
            basePath="/players"
            gameType={gameType}
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
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
        <LaserballStub feature="player rankings" />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
