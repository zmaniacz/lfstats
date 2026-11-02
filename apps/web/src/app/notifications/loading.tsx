// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <Skeleton className="h-8 w-44" />
      <Card>
        <CardHeader className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-48" />
        </CardContent>
      </Card>
    </div>
  );
}
