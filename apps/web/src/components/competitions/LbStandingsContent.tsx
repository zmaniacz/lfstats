// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import {
  getCompetitionTeamAdjustments,
  getLbCompetitionMatchResults,
  getLbCompetitionStandings,
  type CompetitionTeamAdjustment,
  type LbCompetitionMatchResult,
  type LbCompetitionStandingsRow,
  isOvertimeHalf,
} from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamLogo } from "@/components/teams/TeamLogo";
import { formatPoints, formatSignedPoints } from "@/lib/format";
import { TEAM_COLORS } from "@/lib/team-colors";

/**
 * Laserball competition standings: the table over the non-finals rounds (or one round), then
 * every match, grouped by round. A match win is 1 point and a tie 0.5 — see
 * docs/Competition_Structure.md, "Laserball Competitions".
 */
export async function LbStandingsContent({
  activeId,
  activeRoundId,
  competitionSlug,
  competitionName,
  finals = false,
}: {
  activeId: string;
  activeRoundId: string | null;
  competitionSlug: string;
  competitionName: string;
  // The finals tab: matches from finals rounds only, and no table.
  finals?: boolean;
}) {
  const [standings, matches, adjustments] = await Promise.all([
    finals ? Promise.resolve([]) : getLbCompetitionStandings(activeId, activeRoundId ?? undefined),
    getLbCompetitionMatchResults(activeId, { roundId: activeRoundId ?? undefined }),
    // Adjustments belong to no round, so they count (and are listed) on the overall view only.
    finals || activeRoundId ? Promise.resolve([]) : getCompetitionTeamAdjustments(activeId),
  ]);
  const shown = matches.filter((m) => (m.roundType === "finals") === finals);

  return (
    <>
      {!finals && (
        <Card>
          <CardHeader>
            <CardTitle>{competitionName}</CardTitle>
          </CardHeader>
          <CardContent>
            <LbStandingsTable
              standings={standings}
              competitionSlug={competitionSlug}
              adjustments={adjustments}
            />
          </CardContent>
        </Card>
      )}
      <LbMatchList matches={shown} competitionSlug={competitionSlug} />
    </>
  );
}

function LbStandingsTable({
  standings,
  competitionSlug,
  adjustments,
}: {
  standings: LbCompetitionStandingsRow[];
  competitionSlug: string;
  adjustments: CompetitionTeamAdjustment[];
}) {
  if (standings.length === 0) {
    return <p className="text-sm text-muted-foreground">No teams have been added yet.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 text-right">#</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="text-right" title="Matches played">
            MP
          </TableHead>
          <TableHead className="text-right">W</TableHead>
          <TableHead className="text-right">T</TableHead>
          <TableHead className="text-right">L</TableHead>
          <TableHead className="text-right">Pts</TableHead>
          <TableHead className="text-right" title="Goals for">
            GF
          </TableHead>
          <TableHead className="text-right" title="Goals against">
            GA
          </TableHead>
          <TableHead className="text-right" title="Goal difference">
            GD
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map((row, i) => (
          <TableRow key={row.teamId}>
            <TableCell className="text-right tabular-nums text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">
              <div className="flex items-center gap-2">
                <TeamLogo
                  teamId={row.teamId}
                  hasLogo={row.teamHasLogo}
                  logoVersion={row.teamLogoVersion}
                  name={row.teamName}
                  size={24}
                />
                <Link
                  href={`/competitions/${competitionSlug}/teams/${row.teamSlug}`}
                  className="hover:underline"
                >
                  {row.teamName}
                  {row.teamShortName && (
                    <span className="text-muted-foreground font-normal ml-1">
                      ({row.teamShortName})
                    </span>
                  )}
                </Link>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.matchesPlayed}</TableCell>
            <TableCell className="text-right tabular-nums">{row.wins}</TableCell>
            <TableCell className="text-right tabular-nums">{row.ties}</TableCell>
            <TableCell className="text-right tabular-nums">{row.losses}</TableCell>
            <TableCell className="text-right tabular-nums font-semibold">
              {formatPoints(row.points)}
              {row.adjustmentPoints !== 0 && (
                <span
                  className="text-muted-foreground font-normal"
                  title={`Includes ${formatSignedPoints(row.adjustmentPoints)} in adjustments`}
                >
                  *
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.goalsFor}</TableCell>
            <TableCell className="text-right tabular-nums">{row.goalsAgainst}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatSignedPoints(row.goalDifference)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      {adjustments.length > 0 && (
        <TableCaption className="text-left">
          <span className="font-medium">* Includes standings adjustments:</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {adjustments.map((a) => (
              <li key={a.id}>
                {a.teamName}{" "}
                <span className="tabular-nums font-medium">{formatSignedPoints(a.points)}</span> —{" "}
                {a.reason}
              </li>
            ))}
          </ul>
        </TableCaption>
      )}
    </Table>
  );
}

/** Every match, grouped by round, with each half's score linking to its game. */
export function LbMatchList({
  matches,
  competitionSlug,
  highlightTeamId,
}: {
  matches: LbCompetitionMatchResult[];
  competitionSlug: string;
  highlightTeamId?: string;
}) {
  if (matches.length === 0) return null;
  const rounds = new Map<string, { name: string; matches: LbCompetitionMatchResult[] }>();
  for (const m of matches) {
    const round = rounds.get(m.roundId) ?? { name: m.roundName, matches: [] };
    round.matches.push(m);
    rounds.set(m.roundId, round);
  }

  return (
    <>
      {[...rounds].map(([roundId, round]) => (
        <Card key={roundId}>
          <CardHeader>
            <CardTitle>{round.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead className="text-right">Team 1</TableHead>
                  <TableHead className="text-center">Goals</TableHead>
                  <TableHead>Team 2</TableHead>
                  <TableHead>Halves</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {round.matches.map((m) => (
                  <TableRow key={m.matchId}>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {m.matchNumber}
                    </TableCell>
                    <TableCell className="text-right">
                      <MatchTeamName
                        match={m}
                        side={1}
                        competitionSlug={competitionSlug}
                        highlightTeamId={highlightTeamId}
                      />
                    </TableCell>
                    <TableCell className="text-center tabular-nums whitespace-nowrap">
                      {m.halves.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <>
                          {m.outcome.team1Goals}–{m.outcome.team2Goals}
                          {m.outcome.overtime && (
                            <Badge variant="outline" className="ml-2">
                              OT
                            </Badge>
                          )}
                          {m.outcome.winner === null && (
                            <Badge variant="outline" className="ml-2">
                              In progress
                            </Badge>
                          )}
                          {m.outcome.winner === "tie" && (
                            <Badge variant="secondary" className="ml-2">
                              Tie
                            </Badge>
                          )}
                        </>
                      )}
                    </TableCell>
                    <TableCell>
                      <MatchTeamName
                        match={m}
                        side={2}
                        competitionSlug={competitionSlug}
                        highlightTeamId={highlightTeamId}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {m.halves.map((h) => (
                        <Link
                          key={h.half}
                          href={`/laserball/games/${h.gameSlug}`}
                          className="mr-3 hover:underline tabular-nums"
                          title={isOvertimeHalf(h.half) ? `OT ${h.half - 2}` : `Half ${h.half}`}
                        >
                          {isOvertimeHalf(h.half) && (
                            <Badge variant="outline" className="mr-1 px-1 py-0 text-[10px]">
                              OT{h.half - 2}
                            </Badge>
                          )}
                          <span className={TEAM_COLORS[h.team1ColourEnum]?.text}>
                            {h.team1Goals}
                          </span>
                          –
                          <span className={TEAM_COLORS[h.team2ColourEnum]?.text}>
                            {h.team2Goals}
                          </span>
                          {h.excluded && " (excl.)"}
                        </Link>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

function MatchTeamName({
  match,
  side,
  competitionSlug,
  highlightTeamId,
}: {
  match: LbCompetitionMatchResult;
  side: 1 | 2;
  competitionSlug: string;
  highlightTeamId?: string;
}) {
  const team = side === 1 ? match.team1 : match.team2;
  if (!team) return <span className="text-muted-foreground">TBD</span>;
  const won = match.outcome.winner === side;
  return (
    <Link
      href={`/competitions/${competitionSlug}/teams/${team.slug}`}
      className={`hover:underline ${won ? "font-semibold" : ""} ${
        team.id === highlightTeamId ? "underline" : ""
      }`}
    >
      {team.name}
    </Link>
  );
}
