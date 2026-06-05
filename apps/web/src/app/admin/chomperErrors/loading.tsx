// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Skeleton } from "@/components/ui/skeleton"

export default function ChomperErrorsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
