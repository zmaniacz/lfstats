// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlayerPicture } from "@/components/players/PlayerPicture";
import { Button } from "@/components/ui/button";
import {
  getPlayerPictureUploadUrlAction,
  confirmPlayerPictureUploadAction,
  removePlayerPictureAction,
} from "./actions";

interface PlayerPictureUploadProps {
  competitionId: string;
  teamId: string;
  entryId: string;
  callsign: string;
  hasProfilePicture: boolean;
}

export function PlayerPictureUpload({
  competitionId,
  teamId,
  entryId,
  callsign,
  hasProfilePicture,
}: PlayerPictureUploadProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isRefreshing, startRefreshTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const isPending = isSubmitting || isRefreshing;

  function refresh() {
    startRefreshTransition(() => {
      router.refresh();
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const url = await getPlayerPictureUploadUrlAction(competitionId, teamId, entryId, file.type);
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error("Failed to upload picture");
      await confirmPlayerPictureUploadAction(competitionId, teamId, entryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
    refresh();
  }

  async function handleRemove() {
    setIsSubmitting(true);
    setError(null);
    try {
      await removePlayerPictureAction(competitionId, teamId, entryId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove picture");
    } finally {
      setIsSubmitting(false);
    }
    refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <PlayerPicture
        entryId={entryId}
        hasProfilePicture={hasProfilePicture}
        name={callsign}
        size={32}
      />
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            {isPending ? "Working…" : hasProfilePicture ? "Replace" : "Add Profile Picture"}
          </Button>
          {hasProfilePicture && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={handleRemove}
            >
              Remove
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
