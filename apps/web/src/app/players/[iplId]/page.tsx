// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getPlayerByIplId, getPlayerCallsignHistory, isPlayerFavorite } from "@lfstats/db";
import { auth } from "@/auth";
import { FavoriteButton } from "@/components/players/FavoriteButton";
import { addFavoritePlayerAction, removeFavoritePlayerAction } from "./actions";
import { FilterBar } from "@/components/filters/FilterBar";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";
import { PlayerDetailContent } from "@/components/players/PlayerDetailContent";
import { LbPlayerDetailContent } from "@/components/players/LbPlayerDetailContent";
import { PlayerDetailSkeleton } from "@/components/players/PlayerDetailSkeleton";
import { PlayerGameTypeToggle } from "@/components/players/PlayerGameTypeToggle";

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ iplId: string }>;
  searchParams: Promise<{ scope?: string; center?: string; competition?: string; game?: string }>;
}) {
  const { iplId } = await params;
  const sp = await searchParams;
  const gameType: "sm5" | "lb" = sp.game === "lb" ? "lb" : "sm5";

  const [playerDetail, session, ctx] = await Promise.all([
    getPlayerByIplId(iplId),
    auth(),
    resolveFilterContext(sp, { gameType }),
  ]);
  if (!playerDetail) notFound();

  const [callsignHistory, favorited] = await Promise.all([
    getPlayerCallsignHistory(playerDetail.id),
    session?.user?.id ? isPlayerFavorite(session.user.id, playerDetail.id) : Promise.resolve(false),
  ]);

  const otherCallsigns = callsignHistory.filter((h) => h.callsign !== playerDetail.currentCallsign);

  // Strip the leading # for the external profile URL
  const iplIdForUrl = playerDetail.iplId.startsWith("#")
    ? playerDetail.iplId.slice(1)
    : playerDetail.iplId;

  const contentKey = [
    playerDetail.id,
    gameType,
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {playerDetail.currentCallsign}
            <a
              href={`https://www.iplaylaserforce.com/mission-stats/?t=${iplIdForUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-5 w-5" />
            </a>
            {session?.user && (
              <FavoriteButton
                playerId={playerDetail.id}
                isFavorited={favorited}
                addAction={addFavoritePlayerAction.bind(null, iplId)}
                removeAction={removeFavoritePlayerAction.bind(null, iplId)}
              />
            )}
          </h1>
          {otherCallsigns.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Also known as: {otherCallsigns.map((h) => h.callsign).join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <PlayerGameTypeToggle active={gameType} />
          <FilterBar
            basePath={`/players/${iplId}`}
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{ game: gameType === "lb" ? "lb" : null }}
          />
        </div>
      </div>

      <Suspense key={contentKey} fallback={<PlayerDetailSkeleton />}>
        {gameType === "lb" ? (
          <LbPlayerDetailContent playerId={playerDetail.id} scopeFilter={toGameScopeFilter(ctx)} />
        ) : (
          <PlayerDetailContent playerId={playerDetail.id} scopeFilter={toGameScopeFilter(ctx)} />
        )}
      </Suspense>
    </div>
  );
}
