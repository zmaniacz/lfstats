// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import * as React from "react";
import { TeamLogo } from "@/components/teams/TeamLogo";
import { Button } from "@/components/ui/button";
import {
  getTeamLogoUploadUrlAction,
  confirmTeamLogoUploadAction,
  removeTeamLogoAction,
} from "./actions";

interface TeamLogoUploadProps {
  competitionId: string;
  teamId: string;
  teamName: string;
  hasLogo: boolean;
  logoVersion: number;
}

export function TeamLogoUpload({
  competitionId,
  teamId,
  teamName,
  hasLogo,
  logoVersion,
}: TeamLogoUploadProps) {
  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsPending(true);
    setError(null);
    try {
      const url = await getTeamLogoUploadUrlAction(competitionId, teamId, file.type);
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error("Failed to upload logo");
      await confirmTeamLogoUploadAction(competitionId, teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  async function handleRemove() {
    setIsPending(true);
    setError(null);
    try {
      await removeTeamLogoAction(competitionId, teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove logo");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <div className="flex items-center gap-4">
      <TeamLogo
        teamId={teamId}
        hasLogo={hasLogo}
        logoVersion={logoVersion}
        name={teamName}
        size={64}
      />
      <div className="space-y-2">
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
            {isPending ? "Working…" : hasLogo ? "Replace logo" : "Upload logo"}
          </Button>
          {hasLogo && (
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
        <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP.</p>
      </div>
    </div>
  );
}
