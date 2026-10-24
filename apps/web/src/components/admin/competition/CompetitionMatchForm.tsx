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
import {
  EMPTY_MATCH_SLOTS,
  MatchTeamSelects,
  setMatchSlotsOnFormData,
  type TeamsPerSide,
} from "./MatchTeamSelects";

type Props = {
  roundId: string;
  teams: CompetitionTeamListItem[];
  pools?: CompetitionPoolListItem[];
  teamPoolAssignments?: CompetitionPoolTeamAssignment[];
  // Trios competitions pick two trios per side, duos competitions three duos.
  teamsPerSide?: TeamsPerSide;
  action: (roundId: string, formData: FormData) => Promise<void>;
};

export function CompetitionMatchForm({
  roundId,
  teams,
  pools,
  teamPoolAssignments,
  teamsPerSide = 1,
  action,
}: Props) {
  const [slots, setSlots] = useState(EMPTY_MATCH_SLOTS);
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
    setMatchSlotsOnFormData(formData, slots, teamsPerSide);
    if (pools) formData.set("poolId", poolId === "none" ? "" : poolId);
    setIsPending(true);
    try {
      await action(roundId, formData);
      setSlots(EMPTY_MATCH_SLOTS);
      setPoolId(pools && pools.length > 0 ? pools[0].id : "none");
    } finally {
      setIsPending(false);
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
      <MatchTeamSelects
        teams={teamOptions}
        slots={slots}
        onChange={setSlots}
        teamsPerSide={teamsPerSide}
        labelled
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add Match"}
      </Button>
    </form>
  );
}
