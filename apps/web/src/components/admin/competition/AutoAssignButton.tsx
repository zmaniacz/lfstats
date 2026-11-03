// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  competitionId: string;
  action: (
    competitionId: string,
  ) => Promise<{ ok: true; assigned: number; skipped: number } | { ok: false; error: string }>;
};

/** Runs ingest auto-assignment over the unassigned queue (Pattern B: the action refreshes). */
export function AutoAssignButton({ competitionId, action }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setMessage(null);
    setError(null);
    setIsPending(true);
    try {
      const outcome = await action(competitionId);
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      const games = (n: number) => `${n} game${n === 1 ? "" : "s"}`;
      setMessage(
        outcome.skipped > 0
          ? `${games(outcome.assigned)} assigned; ${games(outcome.skipped)} need a manual look.`
          : `${games(outcome.assigned)} assigned.`,
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
      <Button variant="outline" size="sm" disabled={isPending} onClick={handleClick}>
        {isPending ? "Matching…" : "Try auto-assign"}
      </Button>
    </div>
  );
}
