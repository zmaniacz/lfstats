// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function CardGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function LeaderboardsSkeleton() {
  return (
    <>
      <div className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <CardGridSkeleton count={5} />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <CardGridSkeleton count={3} />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-44" />
        <CardGridSkeleton count={4} />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <CardGridSkeleton count={3} />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-36" />
        <CardGridSkeleton count={5} />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-6 w-52" />
        <CardGridSkeleton count={8} />
      </div>
    </>
  );
}
