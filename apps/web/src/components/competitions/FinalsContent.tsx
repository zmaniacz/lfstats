// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { MatchCardSections } from "@/components/competitions/MatchCardSections";
import { ChallongeBracketCard } from "@/components/competitions/ChallongeBracketCard";
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

  return (
    <>
      <ChallongeBracketCard
        challongeLink={challongeLink}
        challongeBracketHeight={challongeBracketHeight}
      />

      <MatchCardSections
        sections={sortedRounds.map((round) => ({
          key: round.roundName,
          title: round.roundName,
          matches: round.matches,
        }))}
        competitionSlug={competitionSlug}
      />
    </>
  );
}
