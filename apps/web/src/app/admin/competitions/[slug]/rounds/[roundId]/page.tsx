// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeams,
  getCompetitionRoundById,
  getCompetitionMatchesByRound,
  getCompetitionPoolsByRound,
  getCompetitionRoundTeamPoolAssignments,
} from "@lfstats/db";
import { CompetitionMatchForm } from "@/components/admin/competition/CompetitionMatchForm";
import { EditRoundForm } from "@/components/admin/competition/EditRoundForm";
import { SortableMatchList } from "@/components/admin/competition/SortableMatchList";
import { GeneratePoolMatchesButton } from "@/components/admin/competition/GeneratePoolMatchesButton";
import { PoolManager } from "@/components/admin/competition/PoolManager";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createMatchAction,
  deleteMatchAction,
  reorderMatchesAction,
  generatePoolMatchesAction,
  generateSplitPoolMatchesAction,
  updateRoundAction,
  updateMatchTeamsAction,
  createPoolAction,
  renamePoolAction,
  deletePoolAction,
  assignTeamToPoolAction,
} from "../actions";

export default async function RoundMatchesPage({
  params,
}: {
  params: Promise<{ slug: string; roundId: string }>;
}) {
  const { slug, roundId } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();

  const round = await getCompetitionRoundById(roundId);
  if (!round || round.competitionId !== comp.id) notFound();

  const [teams, matches] = await Promise.all([
    getCompetitionTeams(comp.id),
    getCompetitionMatchesByRound(round.id),
  ]);

  const isSplitPool = round.type === "split-pool";
  const [pools, teamPoolAssignments] = isSplitPool
    ? await Promise.all([
        getCompetitionPoolsByRound(round.id),
        getCompetitionRoundTeamPoolAssignments(comp.id, round.id),
      ])
    : [[], []];

  const id = comp.id;
  const boundDeleteMatch = deleteMatchAction.bind(null, id, round.id);
  const boundReorder = reorderMatchesAction.bind(null, id, round.id);
  const boundUpdateTeams = updateMatchTeamsAction.bind(null, id, round.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${comp.slug}/rounds`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Rounds & Matches
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h2 className="text-xl font-semibold">
            {round.roundNumber}. {round.name}
          </h2>
          <Badge
            variant={
              round.type === "finals"
                ? "default"
                : round.type === "split-pool"
                  ? "outline"
                  : "secondary"
            }
          >
            {round.type}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Round Details</CardTitle>
        </CardHeader>
        <CardContent>
          <EditRoundForm
            initialName={round.name}
            initialRoundNumber={round.roundNumber}
            initialType={round.type}
            action={updateRoundAction.bind(null, id, round.id)}
          />
        </CardContent>
      </Card>

      {isSplitPool && (
        <Card>
          <CardHeader>
            <CardTitle>Pools</CardTitle>
          </CardHeader>
          <CardContent>
            <PoolManager
              pools={pools}
              assignments={teamPoolAssignments}
              createPoolAction={createPoolAction.bind(null, id, round.id)}
              renamePoolAction={renamePoolAction.bind(null, id, round.id)}
              deletePoolAction={deletePoolAction.bind(null, id, round.id)}
              assignTeamAction={assignTeamToPoolAction.bind(null, id, round.id)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Matches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {teams.length >= 2 ? (
            <div>
              {round.type === "pool" && (
                <div className="mb-4">
                  <GeneratePoolMatchesButton
                    action={generatePoolMatchesAction.bind(null, id, round.id)}
                  />
                </div>
              )}
              {isSplitPool && (
                <div className="mb-4">
                  <GeneratePoolMatchesButton
                    action={generateSplitPoolMatchesAction.bind(null, id, round.id)}
                  />
                </div>
              )}
              <p className="text-sm text-muted-foreground mb-2">Add Match</p>
              <CompetitionMatchForm
                roundId={round.id}
                teams={teams}
                pools={isSplitPool ? pools : undefined}
                teamPoolAssignments={isSplitPool ? teamPoolAssignments : undefined}
                action={createMatchAction.bind(null, id)}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Add at least 2 teams before creating matches.{" "}
              <Link href={`/admin/competitions/${comp.slug}/teams`} className="underline">
                Manage teams
              </Link>
            </p>
          )}

          {matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches yet.</p>
          ) : (
            <SortableMatchList
              competitionSlug={comp.slug}
              roundId={round.id}
              matches={matches}
              teams={teams}
              pools={isSplitPool ? pools : undefined}
              deleteAction={boundDeleteMatch}
              reorderAction={boundReorder}
              updateTeamsAction={boundUpdateTeams}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
