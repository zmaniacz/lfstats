// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  getCompetitionStandings,
  getCompetitionMatchResults,
  getCompetitionTeams,
  getCompetitionPoolsForStandings,
  type CompetitionMatchResult,
  type CompetitionRoundType,
} from "@lfstats/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StandingsTable } from "@/components/competitions/StandingsTable";
import { MatchCardSections, type MatchSection } from "@/components/competitions/MatchCardSections";

function groupMatchesByRound(matchResults: CompetitionMatchResult[]) {
  const rounds = new Map<
    string,
    {
      roundName: string;
      roundNumber: number;
      roundMultiplier: number;
      matches: CompetitionMatchResult[];
    }
  >();
  for (const match of matchResults) {
    if (!rounds.has(match.roundId)) {
      rounds.set(match.roundId, {
        roundName: match.roundName,
        roundNumber: match.roundNumber,
        roundMultiplier: match.roundMultiplier,
        matches: [],
      });
    }
    rounds.get(match.roundId)!.matches.push(match);
  }
  return [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber);
}

export async function StandingsContent({
  activeId,
  activeRoundId,
  activeRoundType,
  competitionSlug,
  competitionName,
}: {
  activeId: string;
  activeRoundId: string | null;
  activeRoundType: CompetitionRoundType | null;
  competitionSlug: string;
  competitionName: string;
}) {
  const teams = await getCompetitionTeams(activeId);

  if (activeRoundId && (activeRoundType === "split-pool" || activeRoundType === "wildcard")) {
    const pools = await getCompetitionPoolsForStandings(activeRoundId);

    const poolData = await Promise.all(
      pools.map(async (pool) => {
        const [standings, matchResults] = await Promise.all([
          getCompetitionStandings(activeId, activeRoundId, pool.id),
          getCompetitionMatchResults(activeId, activeRoundId, activeRoundType, pool.id),
        ]);
        return { pool, standings, matchResults };
      }),
    );

    const poolSections: MatchSection[] = poolData
      .map(({ pool, matchResults }) => ({
        key: pool.id,
        title: pool.name,
        matches: [...matchResults].sort(
          (a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber,
        ),
      }))
      .filter((section) => section.matches.length > 0);

    return (
      <>
        <div className="grid gap-4 lg:grid-cols-2">
          {poolData.map(({ pool, standings }) => (
            <Card key={pool.id}>
              <CardHeader>
                <CardTitle>{pool.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <StandingsTable
                  standings={standings}
                  teams={teams}
                  competitionSlug={competitionSlug}
                />
              </CardContent>
            </Card>
          ))}
        </div>

        <MatchCardSections sections={poolSections} competitionSlug={competitionSlug} />
      </>
    );
  }

  const [standings, matchResults] = await Promise.all([
    getCompetitionStandings(activeId, activeRoundId ?? undefined),
    getCompetitionMatchResults(activeId, activeRoundId ?? undefined),
  ]);

  const sortedRounds = groupMatchesByRound(matchResults);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{competitionName}</CardTitle>
        </CardHeader>
        <CardContent>
          <StandingsTable standings={standings} teams={teams} competitionSlug={competitionSlug} />
        </CardContent>
      </Card>

      <MatchCardSections
        sections={sortedRounds.map((round) => ({
          key: round.roundName,
          title: round.roundName,
          multiplier: round.roundMultiplier,
          matches: round.matches,
        }))}
        competitionSlug={competitionSlug}
      />
    </>
  );
}
