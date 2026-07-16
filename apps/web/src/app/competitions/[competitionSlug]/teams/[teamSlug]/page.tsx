// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeamBySlug,
  getCompetitionTeamRoster,
  getTeamGameParticipants,
  getCompetitionTeamPositionStats,
  getCompetitionTeamResultsByColor,
  getCompetitionMatchResults,
  type CompetitionMatchResult,
} from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TeamLogo } from "@/components/teams/TeamLogo";
import { MatchCard } from "@/components/competitions/MatchCard";
import { TeamWinsByColorChart } from "@/components/competitions/TeamWinsByColorChart";
import { POSITIONS } from "@/lib/positions";
import { formatMVP, formatScore } from "@/lib/format";
import { TriangleAlert, CircleAlert, Settings } from "lucide-react";
import { auth } from "@/auth";

const POSITION_IDS = [1, 2, 3, 4, 5];

export default async function CompetitionTeamPage({
  params,
}: {
  params: Promise<{ competitionSlug: string; teamSlug: string }>;
}) {
  const { competitionSlug, teamSlug } = await params;

  const competition = await getCompetitionBySlug(competitionSlug);
  if (!competition) notFound();

  const team = await getCompetitionTeamBySlug(competition.id, teamSlug);
  if (!team) notFound();

  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );

  const [roster, unassigned, positionStats, resultsByColor, matchResults] = await Promise.all([
    getCompetitionTeamRoster(team.id),
    getTeamGameParticipants(team.id),
    getCompetitionTeamPositionStats(team.id),
    getCompetitionTeamResultsByColor(team.id),
    getCompetitionMatchResults(team.competitionId),
  ]);

  const positionMap = new Map<
    string,
    Map<number, { gamesPlayed: number; avgMvp: number; avgScore: number }>
  >();
  for (const stat of positionStats) {
    if (!positionMap.has(stat.playerId)) positionMap.set(stat.playerId, new Map());
    positionMap.get(stat.playerId)!.set(stat.position, stat);
  }

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
    { roundName: string; roundNumber: number; matches: CompetitionMatchResult[] }
  >();
  for (const match of teamMatches) {
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Roster</CardTitle>
          </CardHeader>
          <CardContent>
            {rosterRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No players have appeared for this team yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead rowSpan={2} className="align-bottom">
                        Player
                      </TableHead>
                      <TableHead rowSpan={2} className="text-right align-bottom">
                        Games
                      </TableHead>
                      {POSITION_IDS.map((p) => (
                        <TableHead key={p} colSpan={3} className="text-center border-l">
                          {POSITIONS[p]?.abbr}
                        </TableHead>
                      ))}
                    </TableRow>
                    <TableRow>
                      {POSITION_IDS.flatMap((p) => [
                        <TableHead
                          key={`${p}-gp`}
                          className="text-right text-xs text-muted-foreground border-l"
                        >
                          GP
                        </TableHead>,
                        <TableHead
                          key={`${p}-mvp`}
                          className="text-right text-xs text-muted-foreground"
                        >
                          Avg MVP
                        </TableHead>,
                        <TableHead
                          key={`${p}-score`}
                          className="text-right text-xs text-muted-foreground"
                        >
                          Avg Score
                        </TableHead>,
                      ])}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rosterRows.map((r) => {
                      const byPos = positionMap.get(r.playerId);
                      return (
                        <TableRow key={r.playerId}>
                          <TableCell className="font-medium">
                            {r.iplId !== null ? (
                              <Link
                                href={`/players/${r.iplId.replace(/^#/, "")}`}
                                className="hover:underline inline-flex items-center gap-1.5"
                              >
                                {r.currentCallsign}
                                {r.isMercenary && (
                                  <TriangleAlert
                                    className="h-3.5 w-3.5 text-amber-500"
                                    aria-label="Mercenary"
                                  />
                                )}
                                {r.isUnassigned && (
                                  <CircleAlert
                                    className="h-3.5 w-3.5 text-destructive"
                                    aria-label="Unassigned"
                                  />
                                )}
                              </Link>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                {r.currentCallsign}
                                {r.isMercenary && (
                                  <TriangleAlert
                                    className="h-3.5 w-3.5 text-amber-500"
                                    aria-label="Mercenary"
                                  />
                                )}
                                {r.isUnassigned && (
                                  <CircleAlert
                                    className="h-3.5 w-3.5 text-destructive"
                                    aria-label="Unassigned"
                                  />
                                )}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.gamesPlayed}</TableCell>
                          {POSITION_IDS.flatMap((p) => {
                            const stat = byPos?.get(p);
                            return [
                              <TableCell
                                key={`${p}-gp`}
                                className="text-right tabular-nums text-muted-foreground border-l"
                              >
                                {stat ? stat.gamesPlayed : "—"}
                              </TableCell>,
                              <TableCell key={`${p}-mvp`} className="text-right tabular-nums">
                                {stat ? formatMVP(stat.avgMvp) : "—"}
                              </TableCell>,
                              <TableCell key={`${p}-score`} className="text-right tabular-nums">
                                {stat ? formatScore(Math.round(stat.avgScore)) : "—"}
                              </TableCell>,
                            ];
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <TriangleAlert className="h-3.5 w-3.5 text-amber-500" /> Mercenary
              </span>
              <span className="inline-flex items-center gap-1">
                <CircleAlert className="h-3.5 w-3.5 text-destructive" /> Not on official roster
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Wins by Team Color</CardTitle>
          </CardHeader>
          <CardContent>
            <TeamWinsByColorChart data={resultsByColor} />
          </CardContent>
        </Card>
      </div>

      {sortedRounds.map((round) => (
        <div key={round.roundName} className="space-y-3">
          <h3 className="text-lg font-semibold">{round.roundName}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {round.matches.map((match) => (
              <MatchCard key={match.matchId} match={match} competitionSlug={competition.slug} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
