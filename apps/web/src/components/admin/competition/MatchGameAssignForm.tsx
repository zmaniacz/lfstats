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
import { formatDateTime, formatGameName } from "@/lib/format";
import { TEAM_COLORS } from "@/lib/team-colors";
import type { UnassignedCompetitionGame } from "@lfstats/db";
import { useState } from "react";

type Props = {
  team1Name: string;
  team2Name: string;
  availableGameNumbers: number[]; // e.g. [1] or [2] or [1,2]
  unassignedGames: UnassignedCompetitionGame[];
  action: (formData: FormData) => Promise<void>;
};

export function MatchGameAssignForm({
  team1Name,
  team2Name,
  availableGameNumbers,
  unassignedGames,
  action,
}: Props) {
  const [gameNumber, setGameNumber] = useState<string>(String(availableGameNumbers[0] ?? 1));
  const [gameId, setGameId] = useState("");
  const [team1GameTeamId, setTeam1GameTeamId] = useState("");
  const [team2GameTeamId, setTeam2GameTeamId] = useState("");
  const [isPending, setIsPending] = useState(false);

  const selectedGame = unassignedGames.find((g) => g.id === gameId);

  function handleGameChange(id: string) {
    setGameId(id);
    setTeam1GameTeamId("");
    setTeam2GameTeamId("");
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("gameNumber", gameNumber);
    formData.set("gameId", gameId);
    formData.set("team1GameTeamId", team1GameTeamId);
    formData.set("team2GameTeamId", team2GameTeamId);
    setIsPending(true);
    try {
      await action(formData);
    } finally {
      window.location.reload();
    }
  }

  const canSubmit =
    gameId && team1GameTeamId && team2GameTeamId && team1GameTeamId !== team2GameTeamId;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label>Game #</Label>
          <Select value={gameNumber} onValueChange={setGameNumber}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableGameNumbers.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Game {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Game</Label>
          <Select value={gameId} onValueChange={handleGameChange}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select game…" />
            </SelectTrigger>
            <SelectContent>
              {unassignedGames.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No unassigned games
                </SelectItem>
              ) : (
                unassignedGames.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {formatGameName(g.description, g.startTime)} — {g.centerName} (
                    {formatDateTime(g.startTime)})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedGame && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label>{team1Name} plays as</Label>
            <Select value={team1GameTeamId} onValueChange={setTeam1GameTeamId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select color…" />
              </SelectTrigger>
              <SelectContent>
                {selectedGame.teams.map((t) => {
                  const color = TEAM_COLORS[t.colourEnum];
                  return (
                    <SelectItem key={t.id} value={t.id} disabled={t.id === team2GameTeamId}>
                      {color?.label ?? t.name} ({t.name})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>{team2Name} plays as</Label>
            <Select value={team2GameTeamId} onValueChange={setTeam2GameTeamId}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select color…" />
              </SelectTrigger>
              <SelectContent>
                {selectedGame.teams.map((t) => {
                  const color = TEAM_COLORS[t.colourEnum];
                  return (
                    <SelectItem key={t.id} value={t.id} disabled={t.id === team1GameTeamId}>
                      {color?.label ?? t.name} ({t.name})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <Button type="submit" disabled={isPending || !canSubmit}>
        {isPending ? "Assigning…" : "Assign Game"}
      </Button>
    </form>
  );
}
