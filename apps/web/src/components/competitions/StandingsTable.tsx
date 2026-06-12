// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamLogo } from "@/components/teams/TeamLogo";
import type { CompetitionStandingsRow, CompetitionTeamListItem } from "@lfstats/db";

export function StandingsTable({
  standings,
  teams,
  competitionSlug,
}: {
  standings: CompetitionStandingsRow[];
  teams: CompetitionTeamListItem[];
  competitionSlug: string;
}) {
  if (standings.length === 0) {
    if (teams.length === 0) {
      return <p className="text-sm text-muted-foreground">No teams have been added yet.</p>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 text-right">#</TableHead>
            <TableHead>Team</TableHead>
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
                  <TeamLogo teamId={team.id} hasLogo={team.hasLogo} name={team.name} size={24} />
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
          <TableHead>Team</TableHead>
          <TableHead className="text-right">Pts</TableHead>
          <TableHead className="text-right">M W-L-D</TableHead>
          <TableHead className="text-right">G W-L-D</TableHead>
          <TableHead className="text-right">Elims</TableHead>
          <TableHead className="text-right">Score Ratio</TableHead>
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
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.matchWins}-{row.matchLosses}-{row.matchDraws}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.gameWins}-{row.gameLosses}-{row.gameDraws}
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.teamEliminations}</TableCell>
              <TableCell className="text-right tabular-nums">{ratio}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
