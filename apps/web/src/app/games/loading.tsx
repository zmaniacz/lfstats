// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";
import { GamesTableSkeleton } from "@/components/games/GamesTableSkeleton";

export default function GamesLoading() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-24" />
      <GamesTableSkeleton />
    </div>
  );
}
