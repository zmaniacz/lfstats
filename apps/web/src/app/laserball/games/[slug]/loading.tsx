// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-5 w-20" />
      </div>
      {Array.from({ length: 2 }).map((_, t) => (
        <div key={t} className="space-y-2">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 6 }).map((_, r) => (
            <Skeleton key={r} className="h-8 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
