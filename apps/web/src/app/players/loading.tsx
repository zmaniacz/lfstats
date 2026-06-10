// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";
import { PlayersSkeleton } from "@/components/players/PlayersSkeleton";

export default function PlayersLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-10 w-60" />
      </div>
      <PlayersSkeleton />
    </div>
  );
}
