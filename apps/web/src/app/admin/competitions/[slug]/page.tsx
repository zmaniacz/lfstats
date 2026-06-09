// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCenterList,
  getCompetitionTeams,
  getCompetitionRounds,
  getCompetitionUnassignedGamesForAdmin,
  getCompetitionAssignedGamesForAdmin,
} from "@lfstats/db";
import { CompetitionForm } from "@/components/admin/CompetitionForm";
import { BulkAssignForm } from "@/components/admin/BulkAssignForm";
import { DeleteCompetitionButton } from "@/components/admin/DeleteCompetitionButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import { formatDateTime, formatGameName } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import {
  updateCompetitionAction,
  deleteCompetitionAction,
  bulkAssignGamesAction,
  removeGameFromCompetitionAction,
  unassignGameFromMatchAction,
} from "../actions";

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();

  const [unassignedGames, assignedGames, centers, teams, rounds] = await Promise.all([
    getCompetitionUnassignedGamesForAdmin(comp.id),
    getCompetitionAssignedGamesForAdmin(comp.id),
    getCenterList(),
    getCompetitionTeams(comp.id),
    getCompetitionRounds(comp.id),
  ]);

  const boundUpdate = updateCompetitionAction.bind(null, comp.id);
  const boundRemoveGame = removeGameFromCompetitionAction.bind(null, comp.id);
  const boundUnassignGame = unassignGameFromMatchAction.bind(null, comp.id);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/competitions"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Competitions
          </Link>
          <h2 className="text-xl font-semibold mt-1">{comp.name}</h2>
        </div>
        <DeleteCompetitionButton
          competitionId={comp.id}
          competitionName={comp.name}
          action={deleteCompetitionAction}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionForm competition={comp} centers={centers} action={boundUpdate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Assign Games</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Assign all games from a center within a date range to this competition.
          </p>
          <BulkAssignForm
            competitionId={comp.id}
            centers={centers}
            action={bulkAssignGamesAction}
          />
        </CardContent>
      </Card>

      {comp.type === "competitive" && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-2xl font-bold tabular-nums">{teams.length}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/competitions/${comp.slug}/teams`}>Manage Teams</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rounds</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-2xl font-bold tabular-nums">{rounds.length}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/competitions/${comp.slug}/rounds`}>Manage Rounds</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Unassigned Games ({unassignedGames.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {unassignedGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unassigned games.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassignedGames.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link href={`/games/${g.slug}`} className="hover:underline font-medium">
                        {formatGameName(g.description, g.startTime)}
                      </Link>
                    </TableCell>
                    <TableCell>{g.centerName}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(g.startTime)}</TableCell>
                    <TableCell className="capitalize">{g.outcome}</TableCell>
                    <TableCell className="text-right">
                      <DeleteEntityButton
                        id={g.id}
                        label={formatGameName(g.description, g.startTime)}
                        description="This removes the game from the competition. The game itself is not deleted."
                        action={boundRemoveGame}
                        confirmLabel="Remove"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Games ({assignedGames.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {assignedGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games assigned to matches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignedGames.map((g) => {
                  const t1Color = getTeamColor(g.team1ColourEnum);
                  const t2Color = getTeamColor(g.team2ColourEnum);
                  return (
                    <TableRow key={g.id}>
                      <TableCell>
                        <Link href={`/games/${g.slug}`} className="hover:underline font-medium">
                          {g.roundName} · Match {g.matchNumber} · Game {g.gameNumber} ·{" "}
                          <span className={t1Color?.text}>{g.team1Name}</span>
                          {" vs "}
                          <span className={t2Color?.text}>{g.team2Name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDateTime(g.startTime)}</TableCell>
                      <TableCell className="capitalize">{g.outcome}</TableCell>
                      <TableCell className="text-right">
                        <DeleteEntityButton
                          id={g.matchGameId}
                          label={`${g.roundName} · Match ${g.matchNumber} · Game ${g.gameNumber} · ${g.team1Name} vs ${g.team2Name}`}
                          description="This removes the game from its match slot. The game stays in the competition."
                          action={boundUnassignGame}
                          confirmLabel="Unassign"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
