// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useEffect, useState } from "react";
import { PlayerTimelineChart } from "@/components/charts/PlayerTimelineChart";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerTimeline as PlayerTimelineData } from "@lfstats/db";

type Props = { gameId: string; scorecardId: string };

type LoadState =
  { status: "loading" } | { status: "error" } | { status: "ready"; data: PlayerTimelineData };

export function PlayerTimeline({ gameId, scorecardId }: Props) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/games/${gameId}/players/${scorecardId}/timeline`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PlayerTimelineData>;
      })
      .then((data) => setState({ status: "ready", data }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [gameId, scorecardId]);

  if (state.status === "loading") {
    return (
      <div className="space-y-2 py-2">
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (state.status === "error") {
    return <p className="py-4 text-sm text-muted-foreground">Couldn't load this timeline.</p>;
  }

  if (state.data.points.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No timeline data was recorded for this player.
      </p>
    );
  }

  return (
    <div className="py-2">
      <PlayerTimelineChart timeline={state.data} />
    </div>
  );
}
