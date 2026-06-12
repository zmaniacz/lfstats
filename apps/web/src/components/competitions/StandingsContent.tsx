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
import { MatchCard } from "@/components/competitions/MatchCard";

function groupMatchesByRound(matchResults: CompetitionMatchResult[]) {
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

  if (activeRoundId && activeRoundType === "split-pool") {
    const pools = await getCompetitionPoolsForStandings(activeRoundId);

    const poolData = await Promise.all(
      pools.map(async (pool) => {
        const [standings, matchResults] = await Promise.all([
          getCompetitionStandings(activeId, activeRoundId, pool.id),
          getCompetitionMatchResults(activeId, activeRoundId, "split-pool", pool.id),
        ]);
        return { pool, standings, matchResults };
      }),
    );

    return (
      <>
        {poolData.map(({ pool, standings, matchResults }) => {
          const sortedRounds = groupMatchesByRound(matchResults);
          return (
            <div key={pool.id} className="space-y-3">
              <Card>
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
              {sortedRounds.map((round) => (
                <div key={round.roundName} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {round.matches.map((match) => (
                      <MatchCard
                        key={match.matchId}
                        match={match}
                        competitionSlug={competitionSlug}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
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
