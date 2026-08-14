// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { RankingsContent } from "@/components/rankings/RankingsContent";
import { RankingsSkeleton } from "@/components/rankings/RankingsSkeleton";

export const metadata: Metadata = { title: "Rankings" };

/**
 * The global player ranking.
 *
 * Deliberately unfiltered: the rating is a single global fit over a rolling
 * window, so there is no scope/center/competition split to offer here. Slicing
 * the board by center would show a subset of one global ordering, which is not
 * the same thing as a ranking within that center and would read as if it were.
 */
export default function RankingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Rankings</h1>
        <p className="text-sm text-muted-foreground">
          SM5 players ranked on results from the last 24 months.
        </p>
      </div>

      <Suspense fallback={<RankingsSkeleton />}>
        <RankingsContent />
      </Suspense>
    </div>
  );
}
