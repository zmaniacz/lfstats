// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import type { CompetitionTeamListItem } from "@lfstats/db";
import { useState } from "react";
import { MatchTeamSelects, matchSlotsFrom, setMatchSlotsOnFormData } from "./MatchTeamSelects";

type Props = {
  teams: CompetitionTeamListItem[];
  initialTeam1Id: string | null;
  initialTeam2Id: string | null;
  // Trios only.
  initialTeam1PartnerId?: string | null;
  initialTeam2PartnerId?: string | null;
  trios?: boolean;
  action: (formData: FormData) => Promise<void>;
};

export function EditMatchTeamsForm({
  teams,
  initialTeam1Id,
  initialTeam2Id,
  initialTeam1PartnerId = null,
  initialTeam2PartnerId = null,
  trios = false,
  action,
}: Props) {
  const [slots, setSlots] = useState(() =>
    matchSlotsFrom({
      team1Id: initialTeam1Id,
      team1PartnerId: initialTeam1PartnerId,
      team2Id: initialTeam2Id,
      team2PartnerId: initialTeam2PartnerId,
    }),
  );
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setMatchSlotsOnFormData(formData, slots, trios);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <MatchTeamSelects teams={teams} slots={slots} onChange={setSlots} trios={trios} labelled />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
