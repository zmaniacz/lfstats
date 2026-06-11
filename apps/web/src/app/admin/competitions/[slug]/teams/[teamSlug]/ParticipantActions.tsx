// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  playerId: string;
  isMercenary: boolean;
  addAction: (playerId: string) => Promise<void>;
  mercAction: (playerId: string, isMercenary: boolean) => Promise<void>;
};

export function ParticipantActions({ playerId, isMercenary, addAction, mercAction }: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddToRoster() {
    setIsPending(true);
    setError(null);
    try {
      await addAction(playerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add player");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  async function handleMercAction() {
    setIsPending(true);
    setError(null);
    try {
      await mercAction(playerId, !isMercenary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mercenary status");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1 justify-end">
        {!isMercenary && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={isPending}
            onClick={handleAddToRoster}
          >
            Add to Roster
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isPending}
          onClick={handleMercAction}
        >
          {isMercenary ? "Unmark Merc" : "Mark as Merc"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
