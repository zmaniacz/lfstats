// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RosterMutationResult } from "@lfstats/db";

/**
 * Inline handicap editor for one enrolled player. Whole numbers, negatives allowed.
 * Save stays disabled until the value actually differs from what is stored.
 */
export function HandicapEditor({
  entryId,
  handicap,
  action,
}: {
  entryId: string;
  handicap: number;
  action: (entryId: string, handicap: number | string) => Promise<RosterMutationResult>;
}) {
  const [value, setValue] = useState(String(handicap));
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = value.trim() !== String(handicap);

  async function handleSave() {
    setIsPending(true);
    setError(null);
    try {
      const result = await action(entryId, value);
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
        value={value}
        disabled={isPending}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button size="sm" variant="outline" disabled={isPending || !dirty} onClick={handleSave}>
        {isPending ? "Saving…" : "Save"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
