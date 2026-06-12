// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { MatchCard } from "@/components/competitions/MatchCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCompetitionMatchResults, type CompetitionMatchResult } from "@lfstats/db";

export async function FinalsContent({
  activeId,
  competitionSlug,
  challongeLink,
  challongeBracketHeight,
}: {
  activeId: string;
  competitionSlug: string;
  challongeLink: string | null;
  challongeBracketHeight: number | null;
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

  const bracketUrl = challongeLink?.replace(/\/+$/, "").replace(/\/module$/, "") ?? null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bracket</CardTitle>
        </CardHeader>
        <CardContent>
          {bracketUrl ? (
            <>
              <iframe
                src={`${bracketUrl}/module?show_final_results=1&show_standings=1`}
                width="100%"
                height={challongeBracketHeight ?? 500}
                className="rounded-md border"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                <a
                  href={bracketUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View bracket on Challonge
                </a>
              </p>
            </>
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
