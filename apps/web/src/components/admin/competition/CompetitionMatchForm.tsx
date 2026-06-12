// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CompetitionPoolListItem,
  CompetitionPoolTeamAssignment,
  CompetitionTeamListItem,
} from "@lfstats/db";
import { useState } from "react";

type Props = {
  roundId: string;
  teams: CompetitionTeamListItem[];
  pools?: CompetitionPoolListItem[];
  teamPoolAssignments?: CompetitionPoolTeamAssignment[];
  action: (roundId: string, formData: FormData) => Promise<void>;
};

export function CompetitionMatchForm({
  roundId,
  teams,
  pools,
  teamPoolAssignments,
  action,
}: Props) {
  const [team1Id, setTeam1Id] = useState("tbd");
  const [team2Id, setTeam2Id] = useState("tbd");
  const [poolId, setPoolId] = useState(pools && pools.length > 0 ? pools[0].id : "none");
  const [isPending, setIsPending] = useState(false);

  const teamOptions =
    pools && poolId !== "none" && teamPoolAssignments
      ? teams.filter((t) =>
          teamPoolAssignments.some((a) => a.teamId === t.id && a.poolId === poolId),
        )
      : teams;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("team1Id", team1Id === "tbd" ? "" : team1Id);
    formData.set("team2Id", team2Id === "tbd" ? "" : team2Id);
    if (pools) formData.set("poolId", poolId === "none" ? "" : poolId);
    setIsPending(true);
    try {
      await action(roundId, formData);
    } finally {
      window.location.reload();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      {pools && pools.length > 1 && (
        <div className="space-y-1">
          <Label>Pool</Label>
          <Select value={poolId} onValueChange={setPoolId}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Select pool…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {pools.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label>Team 1</Label>
        <Select value={team1Id} onValueChange={setTeam1Id}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tbd">TBD</SelectItem>
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled={t.id === team2Id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-sm text-muted-foreground pb-2">vs</span>
      <div className="space-y-1">
        <Label>Team 2</Label>
        <Select value={team2Id} onValueChange={setTeam2Id}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tbd">TBD</SelectItem>
            {teamOptions.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled={t.id === team1Id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add Match"}
      </Button>
    </form>
  );
}
