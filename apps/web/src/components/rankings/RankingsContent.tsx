// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { getGlobalRankings } from "@lfstats/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateIso } from "@/lib/format";
import { RankingsTable } from "./RankingsTable";

const BOARD_SIZE = 100;

export async function RankingsContent() {
  const rankings = await getGlobalRankings(BOARD_SIZE);

  if (!rankings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No ranking published yet</CardTitle>
          <CardDescription>
            Ratings are rebuilt by a scheduled recompute. Once it has run, the board appears here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const {
    rows,
    windowStart,
    windowEnd,
    computedAt,
    qualifiedPlayers,
    modelVersion,
    bandWidth,
    groupedHead,
  } = rankings;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top {rows.length}</CardTitle>
        <CardDescription>
          {qualifiedPlayers} players qualify from games played between {formatDateIso(windowStart)}{" "}
          and {formatDateIso(windowEnd)}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-4 space-y-2 text-sm">
          <p>
            Rating measures strength against the opponents actually faced. Beating a strong team
            counts for more than beating a weak one, and losing to a strong team costs less than
            losing to a weak one — so a player on a weak team is not punished for their teammates.
          </p>
          <p className="text-muted-foreground">
            The labelled rules across the top {Math.min(groupedHead, rows.length)} mark{" "}
            {bandWidth.toFixed(2)}-point slices of the rating scale. They are a reading aid, not a
            claim that players either side of a rule are meaningfully apart — most neighbouring
            players are separated by less than the uncertainty in their ratings, so treat nearby
            positions as roughly equal.{" "}
            <Link href="/about-rating" className="underline underline-offset-2">
              How the rating is calculated
            </Link>
            .
          </p>
        </div>

        <RankingsTable rows={rows} bandWidth={bandWidth} groupedHead={groupedHead} />

        <p className="text-xs text-muted-foreground">
          Model {modelVersion}, computed {formatDateIso(computedAt)}.
        </p>
      </CardContent>
    </Card>
  );
}
