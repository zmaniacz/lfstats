// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_COLORS } from "@/lib/team-colors";
import type {
  AvailableMatch,
  CompetitionListItem,
  GameMatchAssignment,
} from "@lfstats/db";
import { useState, useTransition } from "react";

type GameTeam = {
  id: string;
  name: string;
  colourEnum: number;
};

type Props = {
  gameId: string;
  gameTeams: GameTeam[];
  competitionId: string | null;
  competitionName: string | null;
  matchAssignment: GameMatchAssignment | null;
  availableCompetitions: CompetitionListItem[];
  availableMatches: AvailableMatch[];
  addToCompetitionAction: (
    gameId: string,
    competitionId: string,
  ) => Promise<void>;
  removeFromCompetitionAction: (gameId: string) => Promise<void>;
  assignToMatchAction: (
    gameId: string,
    matchId: string,
    gameNumber: number,
    team1GameTeamId: string,
    team2GameTeamId: string,
  ) => Promise<void>;
  removeFromMatchAction: (gameId: string, matchGameId: string) => Promise<void>;
};

export function GameCompetitionManager({
  gameId,
  gameTeams,
  competitionId,
  competitionName,
  matchAssignment,
  availableCompetitions,
  availableMatches,
  addToCompetitionAction,
  removeFromCompetitionAction,
  assignToMatchAction,
  removeFromMatchAction,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // Add-to-competition form state
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");

  // Assign-to-match form state
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedGameNumber, setSelectedGameNumber] = useState("");
  const [team1GameTeamId, setTeam1GameTeamId] = useState("");
  const [team2GameTeamId, setTeam2GameTeamId] = useState("");

  const selectedMatch = availableMatches.find((m) => m.id === selectedMatchId);

  function handleMatchChange(id: string) {
    setSelectedMatchId(id);
    setSelectedGameNumber("");
    setTeam1GameTeamId("");
    setTeam2GameTeamId("");
  }

  // ── No competition ──────────────────────────────────────────────────────
  if (!competitionId) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={selectedCompetitionId}
          onValueChange={setSelectedCompetitionId}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Assign to competition…" />
          </SelectTrigger>
          <SelectContent>
            {availableCompetitions.length === 0 ? (
              <SelectItem value="__none" disabled>
                No competitions available
              </SelectItem>
            ) : (
              availableCompetitions.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!selectedCompetitionId || isPending}
          onClick={() =>
            startTransition(() =>
              addToCompetitionAction(gameId, selectedCompetitionId),
            )
          }
        >
          {isPending ? "Assigning…" : "Assign to Competition"}
        </Button>
      </div>
    );
  }

  // ── In competition ──────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm font-normal">
          {competitionName}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={() =>
            startTransition(() => removeFromCompetitionAction(gameId))
          }
        >
          Remove from Competition
        </Button>
      </div>

      {matchAssignment ? (
        // ── Assigned to a match ─────────────────────────────────────────
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-muted-foreground">
            {matchAssignment.roundName} · Match {matchAssignment.matchNumber} ·
            Game {matchAssignment.gameNumber}
          </span>
          <span className="font-medium">
            {matchAssignment.team1Name} vs {matchAssignment.team2Name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(() =>
                removeFromMatchAction(gameId, matchAssignment.matchGameId),
              )
            }
          >
            Remove from Match
          </Button>
        </div>
      ) : availableMatches.length === 0 ? (
        // ── No open match slots ──────────────────────────────────────────
        <p className="text-sm text-muted-foreground">
          No open match slots — all matches have both games assigned.
        </p>
      ) : (
        // ── Assign to match form ─────────────────────────────────────────
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Assign to match</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Match</Label>
              <Select value={selectedMatchId} onValueChange={handleMatchChange}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select match…" />
                </SelectTrigger>
                <SelectContent>
                  {availableMatches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.roundName} · Match {m.matchNumber}: {m.team1Name} vs{" "}
                      {m.team2Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMatch && (
              <div className="space-y-1">
                <Label className="text-xs">Game #</Label>
                <Select
                  value={selectedGameNumber}
                  onValueChange={setSelectedGameNumber}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Game…" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedMatch.availableGameNumbers.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Game {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {selectedMatch && selectedGameNumber && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">
                  {selectedMatch.team1Name} plays as
                </Label>
                <Select
                  value={team1GameTeamId}
                  onValueChange={setTeam1GameTeamId}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select color…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTeams.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        disabled={t.id === team2GameTeamId}
                      >
                        {TEAM_COLORS[t.colourEnum]?.label ?? t.name} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">
                  {selectedMatch.team2Name} plays as
                </Label>
                <Select
                  value={team2GameTeamId}
                  onValueChange={setTeam2GameTeamId}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select color…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTeams.map((t) => (
                      <SelectItem
                        key={t.id}
                        value={t.id}
                        disabled={t.id === team1GameTeamId}
                      >
                        {TEAM_COLORS[t.colourEnum]?.label ?? t.name} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="sm"
                disabled={
                  isPending ||
                  !team1GameTeamId ||
                  !team2GameTeamId ||
                  team1GameTeamId === team2GameTeamId
                }
                onClick={() => {
                  let gameNumber = parseInt(selectedGameNumber, 10);
                  startTransition(() =>
                    assignToMatchAction(
                      gameId,
                      selectedMatchId,
                      gameNumber,
                      team1GameTeamId,
                      team2GameTeamId,
                    ),
                  );
                }}
              >
                {isPending ? "Assigning…" : "Assign to Match"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
