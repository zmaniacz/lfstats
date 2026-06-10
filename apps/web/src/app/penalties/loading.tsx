// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";
import { PenaltiesSkeleton } from "./PenaltiesSkeleton";

export default function PenaltiesLoading() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-64" />
      </div>

      <PenaltiesSkeleton />
    </div>
  );
}
