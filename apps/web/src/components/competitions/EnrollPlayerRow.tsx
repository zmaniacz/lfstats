// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RosterMutationResult } from "@lfstats/db";

/**
 * Handicap entry + enroll button for one unenrolled player. Follows Pattern B: the
 * server action calls refresh() itself, since enrolling moves the row out of this block
 * and into the standings table elsewhere on the page.
 */
export function EnrollPlayerRow({
  playerId,
  enrollAction,
}: {
  playerId: string;
  enrollAction: (playerId: string, handicap: number | string) => Promise<RosterMutationResult>;
}) {
  const [handicap, setHandicap] = useState("0");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnroll() {
    setIsPending(true);
    setError(null);
    try {
      const result = await enrollAction(playerId, handicap);
      if (!result.ok) setError(result.error);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Input
        type="number"
        step="1"
        aria-label="Handicap"
        className="w-20"
        value={handicap}
        disabled={isPending}
        onChange={(e) => setHandicap(e.target.value)}
      />
      <Button size="sm" variant="outline" disabled={isPending} onClick={handleEnroll}>
        {isPending ? "Adding…" : "Add"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
