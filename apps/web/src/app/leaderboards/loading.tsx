// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";
import { LeaderboardsSkeleton } from "@/components/competitions/LeaderboardsSkeleton";

export default function LeaderboardsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-10 w-64" />
      </div>
      <LeaderboardsSkeleton />
    </div>
  );
}
