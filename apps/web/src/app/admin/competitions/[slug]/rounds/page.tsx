// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation";
import Link from "next/link";
import { getCompetitionBySlug, getCompetitionRounds } from "@lfstats/db";
import { CompetitionRoundForm } from "@/components/admin/competition/CompetitionRoundForm";
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createRoundAction, deleteRoundAction } from "./actions";

export default async function RoundsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();

  const rounds = await getCompetitionRounds(comp.id);

  const id = comp.id;
  const boundCreateRound = createRoundAction.bind(null, id);
  const boundDeleteRound = deleteRoundAction.bind(null, id);

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
        <div className="divide-y border rounded-md">
          {rounds.map((round) => (
            <div key={round.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">
                  {round.roundNumber}. {round.name}
                </span>
                <Badge variant={round.type === "finals" ? "default" : "secondary"}>
                  {round.type}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {round.matchCount} {round.matchCount === 1 ? "match" : "matches"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/competitions/${comp.slug}/rounds/${round.id}`}>
                    Manage Matches
                  </Link>
                </Button>
                <DeleteEntityButton
                  id={round.id}
                  label={`"${round.name}"`}
                  description="This removes the round and all its matches."
                  action={boundDeleteRound}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
