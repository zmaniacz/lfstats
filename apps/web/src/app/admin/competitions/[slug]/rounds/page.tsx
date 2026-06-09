// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getCompetitionBySlug,
  getCompetitionTeams,
  getCompetitionRounds,
  getCompetitionMatchesByRound,
} from "@lfstats/db";
import { CompetitionRoundForm } from "@/components/admin/competition/CompetitionRoundForm";
import { CompetitionMatchForm } from "@/components/admin/competition/CompetitionMatchForm";
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import { SortableMatchList } from "@/components/admin/competition/SortableMatchList";
import { GeneratePoolMatchesButton } from "@/components/admin/competition/GeneratePoolMatchesButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  createRoundAction,
  deleteRoundAction,
  createMatchAction,
  deleteMatchAction,
  reorderMatchesAction,
  generatePoolMatchesAction,
} from "./actions";

export default async function RoundsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();

  const [teams, rounds] = await Promise.all([
    getCompetitionTeams(comp.id),
    getCompetitionRounds(comp.id),
  ]);

  const matchesByRound = await Promise.all(rounds.map((r) => getCompetitionMatchesByRound(r.id)));

  const id = comp.id;
  const boundCreateRound = createRoundAction.bind(null, id);
  const boundDeleteRound = deleteRoundAction.bind(null, id);
  const boundDeleteMatch = deleteMatchAction.bind(null, id);
  const boundReorder = reorderMatchesAction.bind(null, id);

  const nextRoundNumber = rounds.length > 0 ? Math.max(...rounds.map((r) => r.roundNumber)) + 1 : 1;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${comp.slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {comp.name}
        </Link>
        <h2 className="text-xl font-semibold mt-1">Rounds & Matches</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Round</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionRoundForm nextRoundNumber={nextRoundNumber} action={boundCreateRound} />
        </CardContent>
      </Card>

      {rounds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rounds yet.</p>
      ) : (
        rounds.map((round, i) => {
          const matches = matchesByRound[i];
          const boundCreateMatch = createMatchAction.bind(null, id, round.id);

          return (
            <Card key={round.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle>
                      {round.roundNumber}. {round.name}
                    </CardTitle>
                    <Badge variant={round.type === "finals" ? "default" : "secondary"}>
                      {round.type}
                    </Badge>
                  </div>
                  <DeleteEntityButton
                    id={round.id}
                    label={`"${round.name}"`}
                    description="This removes the round and all its matches."
                    action={boundDeleteRound}
                  />
                </div>
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
                    deleteAction={boundDeleteMatch}
                    reorderAction={boundReorder}
                  />
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
