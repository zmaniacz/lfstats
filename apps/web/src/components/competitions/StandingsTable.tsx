// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
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
import type {
  CompetitionFormat,
  CompetitionStandingsRow,
  CompetitionTeamAdjustment,
  CompetitionTeamListItem,
} from "@lfstats/db";
import { formatScore, formatSignedPoints } from "@/lib/format";
import { competitionTeamNoun } from "@/lib/competition-format";

export function StandingsTable({
  standings,
  teams,
  competitionSlug,
  format = "team",
  adjustments = [],
}: {
  standings: CompetitionStandingsRow[];
  teams: CompetitionTeamListItem[];
  competitionSlug: string;
  // Listed under the table. Pass them only where they count: the whole-competition standings.
  adjustments?: CompetitionTeamAdjustment[];
  // Trios and duos rank on each trio's or duo's own player score (scoreFor/scoreAgainst),
  // which is shown as well.
  format?: CompetitionFormat;
}) {
  const entity = competitionTeamNoun(format);
  const partnered = entity !== "Team";
  if (standings.length === 0) {
    if (teams.length === 0) {
      return <p className="text-sm text-muted-foreground">No teams have been added yet.</p>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-right">#</TableHead>
            <TableHead>{entity}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team, i) => (
            <TableRow key={team.id}>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {i + 1}
              </TableCell>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <TeamLogo
                    teamId={team.id}
                    hasLogo={team.hasLogo}
                    logoVersion={team.logoVersion}
                    name={team.name}
                    size={24}
                  />
                  <Link
                    href={`/competitions/${competitionSlug}/teams/${team.slug}`}
                    className="hover:underline"
                  >
                    {team.name}
                    {team.shortName && (
                      <span className="text-muted-foreground font-normal ml-1">
                        ({team.shortName})
                      </span>
                    )}
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8 text-right">#</TableHead>
          <TableHead>{entity}</TableHead>
          <TableHead className="text-right">Pts</TableHead>
          <TableHead className="text-right">M W-L-D</TableHead>
          <TableHead className="text-right">G W-L-D</TableHead>
          <TableHead className="text-right">Elims</TableHead>
          {partnered && <TableHead className="text-right">{entity} Score</TableHead>}
          <TableHead className="text-right">
            {partnered ? `${entity} Ratio` : "Score Ratio"}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {standings.map((row, i) => {
          const ratio =
            row.scoreAgainst === 0
              ? row.scoreFor === 0
                ? "—"
                : "∞"
              : (row.scoreFor / row.scoreAgainst).toFixed(3);
          return (
            <TableRow key={row.teamId}>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {i + 1}
              </TableCell>
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
              <TableCell className="text-right tabular-nums font-semibold">
                {row.matchPoints}
                {row.adjustmentPoints !== 0 && (
                  <span
                    className="text-muted-foreground font-normal"
                    title={`Includes ${formatSignedPoints(row.adjustmentPoints)} in adjustments`}
                  >
                    *
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.matchWins}-{row.matchLosses}-{row.matchDraws}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.gameWins}-{row.gameLosses}-{row.gameDraws}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.teamEliminations}</TableCell>
              {partnered && (
                <TableCell className="text-right tabular-nums">
                  {formatScore(row.scoreFor)}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums">{ratio}</TableCell>
            </TableRow>
          );
        })}
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
