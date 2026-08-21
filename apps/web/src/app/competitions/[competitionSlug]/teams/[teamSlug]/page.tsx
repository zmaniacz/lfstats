// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeamBySlug,
  getCompetitionTeamRoster,
  getTeamGameParticipants,
  getCompetitionTeamPlayerStats,
  getCompetitionTeamResultsByColor,
  getCompetitionMatchResults,
  type CompetitionMatchResult,
} from "@lfstats/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TeamLogo } from "@/components/teams/TeamLogo";
import { MatchCardSections } from "@/components/competitions/MatchCardSections";
import { TeamPlayerComparisonTable } from "@/components/competitions/TeamPlayerComparisonTable";
import { TeamWinsByColorChart } from "@/components/competitions/TeamWinsByColorChart";
import { Settings } from "lucide-react";
import { auth } from "@/auth";

const getCompetition = cache(getCompetitionBySlug);
const getCompetitionTeam = cache(getCompetitionTeamBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ competitionSlug: string; teamSlug: string }>;
}): Promise<Metadata> {
  const { competitionSlug, teamSlug } = await params;

  const competition = await getCompetition(competitionSlug);
  if (!competition) return { title: "Team Not Found" };

  const team = await getCompetitionTeam(competition.id, teamSlug);
  if (!team) return { title: "Team Not Found" };

  return { title: `${team.name} – ${competition.name}` };
}

export default async function CompetitionTeamPage({
  params,
}: {
  params: Promise<{ competitionSlug: string; teamSlug: string }>;
}) {
  const { competitionSlug, teamSlug } = await params;

  const competition = await getCompetition(competitionSlug);
  if (!competition) notFound();

  const team = await getCompetitionTeam(competition.id, teamSlug);
  if (!team) notFound();

  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );

  const [roster, unassigned, playerStats, resultsByColor, matchResults] = await Promise.all([
    getCompetitionTeamRoster(team.id),
    getTeamGameParticipants(team.id),
    getCompetitionTeamPlayerStats(team.id),
    getCompetitionTeamResultsByColor(team.id),
    // "all" so finals matches sit alongside round play in the match list below.
    getCompetitionMatchResults(team.competitionId, undefined, "all"),
  ]);

  const rosterRows = [
    ...roster.map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      currentCallsign: r.currentCallsign,
      isMercenary: r.isMercenary,
      isUnassigned: false,
      gamesPlayed: r.gamesPlayed,
    })),
    ...unassigned.map((u) => ({
      playerId: u.playerId,
      iplId: u.iplId,
      currentCallsign: u.currentCallsign,
      isMercenary: u.isMercenary,
      isUnassigned: true,
      gamesPlayed: u.gamesPlayed,
    })),
  ];

  const teamMatches = matchResults.filter((m) => m.team1Id === team.id || m.team2Id === team.id);
  const rounds = new Map<
    string,
    {
      roundId: string;
      roundName: string;
      roundNumber: number;
      roundMultiplier: number;
      matches: CompetitionMatchResult[];
    }
  >();
  for (const match of teamMatches) {
    if (!rounds.has(match.roundId)) {
      rounds.set(match.roundId, {
        roundId: match.roundId,
        roundName: match.roundName,
        roundNumber: match.roundNumber,
        roundMultiplier: match.roundMultiplier,
        matches: [],
      });
    }
    rounds.get(match.roundId)!.matches.push(match);
  }
  const sortedRounds = [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <TeamLogo
            teamId={team.id}
            hasLogo={team.hasLogo}
            logoVersion={team.logoVersion}
            name={team.name}
            size={64}
            expandable
          />
          <h2 className="text-xl font-semibold">
            {team.name}
            {team.shortName && (
              <span className="text-muted-foreground font-normal ml-2">({team.shortName})</span>
            )}
          </h2>
        </div>
        {isAdmin && (
          <Link
            href={`/admin/competitions/${competition.slug}/teams/${team.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <Settings className="h-4 w-4" />
            Manage team
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamPlayerComparisonTable rows={rosterRows} stats={playerStats} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Wins by Team Color</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamWinsByColorChart data={resultsByColor} />
          </CardContent>
        </Card>
      </div>

      <MatchCardSections
        sections={sortedRounds.map((round) => ({
          key: round.roundId,
          title: round.roundName,
          multiplier: round.roundMultiplier,
          matches: round.matches,
        }))}
        competitionSlug={competition.slug}
      />
    </div>
  );
}
