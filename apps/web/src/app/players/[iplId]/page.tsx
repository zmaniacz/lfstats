// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  getPlayerByIplId,
  getPlayerCallsignHistory,
  getPlayerPdfGameList,
  getPlayerVideos,
  isPlayerFavorite,
  isSyntheticIplId,
} from "@lfstats/db";
import { auth } from "@/auth";
import { FavoriteButton } from "@/components/players/FavoriteButton";
import {
  addFavoritePlayerAction,
  mergeSyntheticPlayerAction,
  removeFavoritePlayerAction,
  searchMergeTargetsAction,
} from "./actions";
import { FilterBar } from "@/components/filters/FilterBar";
import { resolveFilterContext, resolveGameType, toGameScopeFilter } from "@/lib/filter-context";
import { PlayerDetailContent } from "@/components/players/PlayerDetailContent";
import { LbPlayerDetailContent } from "@/components/players/LbPlayerDetailContent";
import { PlayerDetailSkeleton } from "@/components/players/PlayerDetailSkeleton";
import { MergeLegacyPlayer } from "@/components/players/MergeLegacyPlayer";
import { PlayerGamesTable } from "@/components/players/PlayerGamesTable";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlayerVideos } from "@/components/players/PlayerVideos";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";

const getPlayer = cache(getPlayerByIplId);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ iplId: string }>;
}): Promise<Metadata> {
  const { iplId } = await params;
  const playerDetail = await getPlayer(iplId);
  if (!playerDetail) return { title: "Player Not Found" };

  return { title: playerDetail.currentCallsign };
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ iplId: string }>;
  searchParams: Promise<{
    scope?: string;
    center?: string;
    competition?: string;
    from?: string;
    to?: string;
    game?: string;
    tab?: string;
  }>;
}) {
  const { iplId } = await params;
  const sp = await searchParams;
  const gameType = await resolveGameType(sp.game);

  const [playerDetail, session, ctx] = await Promise.all([
    getPlayer(iplId),
    auth(),
    resolveFilterContext(sp, { gameType }),
  ]);
  if (!playerDetail) notFound();

  const [callsignHistory, favorited, videos] = await Promise.all([
    getPlayerCallsignHistory(playerDetail.id),
    session?.user?.id ? isPlayerFavorite(session.user.id, playerDetail.id) : Promise.resolve(false),
    getPlayerVideos(playerDetail.id),
  ]);

  // A legacy PDF-era player with no known IPL id has only legacy games: no modern stats,
  // no filters and no iPlayLaserforce profile.
  if (isSyntheticIplId(playerDetail.iplId)) {
    const legacyGames = await getPlayerPdfGameList(playerDetail.id);
    const aliases = callsignHistory.filter((h) => h.callsign !== playerDetail.currentCallsign);
    const canMerge = (session?.user?.roles ?? []).some(
      (r) => r.role === "superAdmin" || r.role === "admin",
    );
    return (
      <div className="p-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{playerDetail.currentCallsign}</h1>
          {aliases.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Also known as: {aliases.map((h) => h.callsign).join(", ")}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Legacy player — their IPL id was never recorded, so only games from printed scorecards
            are known.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Games</CardTitle>
            <CardDescription>
              Legacy games from printed scorecards: end-of-game totals only, and MVP uses the legacy
              formula. They don&apos;t count toward any stats or the rating.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlayerGamesTable games={legacyGames} />
          </CardContent>
        </Card>
        {canMerge && (
          <MergeLegacyPlayer
            sourceCallsign={playerDetail.currentCallsign}
            legacyGameCount={legacyGames.length}
            searchAction={searchMergeTargetsAction}
            mergeAction={mergeSyntheticPlayerAction.bind(null, iplId, playerDetail.id)}
          />
        )}
      </div>
    );
  }

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
    ctx.dateFrom,
    ctx.dateTo,
  ].join("|");

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
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
          <GameTypeToggle active={gameType} />
          <FilterBar
            basePath={`/players/${iplId}`}
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            activeDateFrom={ctx.dateFrom}
            activeDateTo={ctx.dateTo}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{ game: gameType === "lb" ? "lb" : null, tab: sp.tab ?? null }}
            gameType={gameType}
          />
        </div>
      </div>

      {/* Videos are not scope/game-type filtered — a player's POV footage is
          listed across all their games. */}
      {videos.length > 0 && <PlayerVideos videos={videos} />}

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
