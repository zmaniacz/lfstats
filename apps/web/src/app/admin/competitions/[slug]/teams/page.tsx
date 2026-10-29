// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeamAdjustments,
  getCompetitionTeams,
} from "@lfstats/db";
import { CompetitionTeamForm } from "@/components/admin/competition/CompetitionTeamForm";
import { TeamAdjustmentForm } from "@/components/admin/competition/TeamAdjustmentForm";
import { formatSignedPoints } from "@/lib/format";
import { TeamLogo } from "@/components/teams/TeamLogo";
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  addTeamAdjustmentAction,
  createCompetitionTeamAction,
  deleteCompetitionTeamAction,
  deleteTeamAdjustmentAction,
} from "./actions";

const getCompetition = cache(getCompetitionBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const comp = await getCompetition(slug);
  if (!comp) return { title: "Admin: Competition Not Found" };

  return { title: `Admin: ${comp.name} Teams` };
}

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const comp = await getCompetition(slug);
  if (!comp) notFound();

  const [teams, adjustments] = await Promise.all([
    getCompetitionTeams(comp.id),
    getCompetitionTeamAdjustments(comp.id),
  ]);

  const boundCreate = createCompetitionTeamAction.bind(null, comp.id);
  const boundDelete = deleteCompetitionTeamAction.bind(null, comp.id);
  const boundAddAdjustment = addTeamAdjustmentAction.bind(null, comp.id);
  const boundDeleteAdjustment = deleteTeamAdjustmentAction.bind(null, comp.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${comp.slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {comp.name}
        </Link>
        <h2 className="text-xl font-semibold mt-1">Teams</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Team</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionTeamForm action={boundCreate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams ({teams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Short Name</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead>Mercs</TableHead>
                  <TableHead>Unassigned</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/competitions/${comp.slug}/teams/${team.slug}`}
                        className="hover:underline flex items-center gap-2"
                      >
                        <TeamLogo
                          teamId={team.id}
                          hasLogo={team.hasLogo}
                          logoVersion={team.logoVersion}
                          name={team.name}
                          size={24}
                        />
                        {team.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{team.shortName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{team.playerCount}</TableCell>
                    <TableCell className="tabular-nums">{team.mercCount}</TableCell>
                    <TableCell className="tabular-nums">{team.unassignedCount}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="mr-2">
                        <Link href={`/admin/competitions/${comp.slug}/teams/${team.slug}`}>
                          Manage Roster
                        </Link>
                      </Button>
                      <DeleteEntityButton
                        id={team.id}
                        label={`"${team.name}"`}
                        description="This removes the team and its roster from this competition."
                        action={boundDelete}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {teams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Standings Adjustments</CardTitle>
            <CardDescription>
              Points added to or taken from a team outside any match — a missed referee duty, a
              sanction, a correction. They count on the overall standings only, not on a single
              round&apos;s.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <TeamAdjustmentForm
              teams={teams.map((t) => ({ id: t.id, name: t.name }))}
              action={boundAddAdjustment}
              step={comp.gameType === "lb" ? 0.5 : 1}
            />
            {adjustments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No adjustments.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead className="text-right">Points</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.teamName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatSignedPoints(a.points)}
                      </TableCell>
                      <TableCell>{a.reason}</TableCell>
                      <TableCell className="text-right">
                        <DeleteEntityButton
                          id={a.id}
                          label={`the ${formatSignedPoints(a.points)} adjustment for "${a.teamName}"`}
                          action={boundDeleteAdjustment}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
