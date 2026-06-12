// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeams,
  getCompetitionRoundById,
  getCompetitionMatchesByRound,
} from "@lfstats/db";
import { CompetitionMatchForm } from "@/components/admin/competition/CompetitionMatchForm";
import { EditRoundForm } from "@/components/admin/competition/EditRoundForm";
import { SortableMatchList } from "@/components/admin/competition/SortableMatchList";
import { GeneratePoolMatchesButton } from "@/components/admin/competition/GeneratePoolMatchesButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createMatchAction,
  deleteMatchAction,
  reorderMatchesAction,
  generatePoolMatchesAction,
  updateRoundAction,
  updateMatchTeamsAction,
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
          <Badge variant={round.type === "finals" ? "default" : "secondary"}>{round.type}</Badge>
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
              <p className="text-sm text-muted-foreground mb-2">Add Match</p>
              <CompetitionMatchForm
                roundId={round.id}
                teams={teams}
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
