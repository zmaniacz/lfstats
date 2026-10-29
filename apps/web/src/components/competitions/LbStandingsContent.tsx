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
} from "@lfstats/db";
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
import {
  LbMatchCardSections,
  type LbMatchSection,
} from "@/components/competitions/LbMatchCardSections";
import { formatPoints, formatSignedPoints } from "@/lib/format";

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
      <LbMatchCardSections sections={lbMatchSections(shown)} competitionSlug={competitionSlug} />
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

/** Groups matches into one card section per round, in round order. */
export function lbMatchSections(matches: LbCompetitionMatchResult[]): LbMatchSection[] {
  const rounds = new Map<string, LbMatchSection>();
  for (const m of matches) {
    const section = rounds.get(m.roundId) ?? {
      key: m.roundId,
      title: m.roundName,
      multiplier: m.roundMultiplier,
      matches: [],
    };
    section.matches.push(m);
    rounds.set(m.roundId, section);
  }
  return [...rounds.values()];
}
