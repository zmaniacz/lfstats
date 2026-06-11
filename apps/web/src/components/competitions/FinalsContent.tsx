// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getCompetitionMatchResults, type CompetitionMatchResult } from "@lfstats/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { MatchCard } from "@/components/competitions/MatchCard";

export async function FinalsContent({
  activeId,
  competitionSlug,
  challongeLink,
}: {
  activeId: string;
  competitionSlug: string;
  challongeLink: string | null;
}) {
  const matchResults = await getCompetitionMatchResults(activeId, undefined, "finals");

  // Group matches by round
  const rounds = new Map<
    string,
    { roundName: string; roundNumber: number; matches: CompetitionMatchResult[] }
  >();
  for (const match of matchResults) {
    if (!rounds.has(match.roundId)) {
      rounds.set(match.roundId, {
        roundName: match.roundName,
        roundNumber: match.roundNumber,
        matches: [],
      });
    }
    rounds.get(match.roundId)!.matches.push(match);
  }
  const sortedRounds = [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bracket</CardTitle>
        </CardHeader>
        <CardContent>
          {challongeLink ? (
            <p className="text-sm text-muted-foreground">
              Bracket:{" "}
              <a
                href={challongeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {challongeLink}
              </a>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Bracket not configured.</p>
          )}
        </CardContent>
      </Card>

      {sortedRounds.map((round) => (
        <div key={round.roundName} className="space-y-3">
          <h3 className="text-lg font-semibold">{round.roundName}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {round.matches.map((match) => (
              <MatchCard key={match.matchId} match={match} competitionSlug={competitionSlug} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
