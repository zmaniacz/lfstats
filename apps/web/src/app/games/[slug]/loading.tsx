// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton";

export default function GameDetailLoading() {
  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {[0, 1].map((i) => (
        <section key={i} className="space-y-0">
          <div className="flex items-center justify-between px-4 py-2 border-l-4 border-border bg-muted/40 rounded-tr-md">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="border rounded-b-md overflow-hidden">
            <div className="p-3 border-b bg-muted/20">
              <Skeleton className="h-4 w-full" />
            </div>
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="p-3 border-b last:border-0">
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
