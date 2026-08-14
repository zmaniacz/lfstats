// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { RankingsSkeleton } from "@/components/rankings/RankingsSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function RankingsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <RankingsSkeleton />
    </div>
  );
}
