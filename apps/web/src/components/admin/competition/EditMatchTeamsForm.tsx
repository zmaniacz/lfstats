// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import type { CompetitionTeamListItem } from "@lfstats/db";
import { useState } from "react";
import {
  MatchTeamSelects,
  matchSlotsFrom,
  setMatchSlotsOnFormData,
  type TeamsPerSide,
} from "./MatchTeamSelects";

type Props = {
  teams: CompetitionTeamListItem[];
  initialTeam1Id: string | null;
  initialTeam2Id: string | null;
  // Trios and duos only (partner2: duos only).
  initialTeam1PartnerId?: string | null;
  initialTeam1Partner2Id?: string | null;
  initialTeam2PartnerId?: string | null;
  initialTeam2Partner2Id?: string | null;
  teamsPerSide?: TeamsPerSide;
  action: (formData: FormData) => Promise<void>;
};

export function EditMatchTeamsForm({
  teams,
  initialTeam1Id,
  initialTeam2Id,
  initialTeam1PartnerId = null,
  initialTeam1Partner2Id = null,
  initialTeam2PartnerId = null,
  initialTeam2Partner2Id = null,
  teamsPerSide = 1,
  action,
}: Props) {
  const [slots, setSlots] = useState(() =>
    matchSlotsFrom({
      team1Id: initialTeam1Id,
      team1PartnerId: initialTeam1PartnerId,
      team1Partner2Id: initialTeam1Partner2Id,
      team2Id: initialTeam2Id,
      team2PartnerId: initialTeam2PartnerId,
      team2Partner2Id: initialTeam2Partner2Id,
    }),
  );
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMatchSlotsOnFormData(formData, slots, teamsPerSide);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <MatchTeamSelects
        teams={teams}
        slots={slots}
        onChange={setSlots}
        teamsPerSide={teamsPerSide}
        labelled
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
