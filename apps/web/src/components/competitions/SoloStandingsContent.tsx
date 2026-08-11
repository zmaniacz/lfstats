// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getSoloCompetitionStandings } from "@lfstats/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SoloStandingsTable } from "@/components/competitions/SoloStandingsTable";

export async function SoloStandingsContent({
  activeId,
  competitionName,
}: {
  activeId: string;
  competitionName: string;
}) {
  const standings = await getSoloCompetitionStandings(activeId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{competitionName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SoloStandingsTable standings={standings} />
        <p className="text-xs text-muted-foreground">
          Total MVP counts each player&apos;s best 5 games per position (10 for Scout, so at most 30
          games), with their handicap added to every counted game. Avg MVP and Avg Score are
          averaged over all games played and exclude the handicap.
        </p>
      </CardContent>
    </Card>
  );
}
