// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
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
  CompetitionListItem,
  LbGameCompetitionMatch,
  LbOpenCompetitionMatch,
} from "@lfstats/db";

type GameTeam = { id: string; name: string; colourEnum: number; callsigns: string[] };

type Props = {
  gameId: string;
  competition: { competitionId: string; competitionName: string } | null;
  availableCompetitions: CompetitionListItem[];
  // The competition match this game's lb_match fills, if any.
  assignment: LbGameCompetitionMatch | null;
  openMatches: LbOpenCompetitionMatch[];
  gameTeams: GameTeam[];
  // This game's Side 1 in its lb_match; null while the game is not linked to its other half.
  side1GameTeamId: string | null;
  addToCompetitionAction: (gameId: string, competitionId: string) => Promise<void>;
  removeFromCompetitionAction: (gameId: string) => Promise<void>;
  assignAction: (
    gameId: string,
    competitionMatchId: string,
    swapSides: boolean,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  unassignAction: (gameId: string, competitionMatchId: string) => Promise<void>;
};

/**
 * The Laserball game page's competition controls, the counterpart of SM5's
 * GameCompetitionManager. A Laserball match slot is filled by the whole linked match (both
 * halves), so assigning needs the game linked to its other half first; the editor then says
 * which of this game's teams is the slot's team 1, and the halves' sides follow.
 */
export function LbGameCompetitionManager({
  gameId,
  competition,
  availableCompetitions,
  assignment,
  openMatches,
  gameTeams,
  side1GameTeamId,
  addToCompetitionAction,
  removeFromCompetitionAction,
  assignAction,
  unassignAction,
}: Props) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [competitionId, setCompetitionId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [team1GameTeamId, setTeam1GameTeamId] = useState("");

  const selectedMatch = openMatches.find((m) => m.id === matchId);

  async function run(fn: () => Promise<void | { ok: true } | { ok: false; error: string }>) {
    setIsPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result && !result.ok) {
        // Keep the selections so the editor can retry.
        setError(result.error);
        return;
      }
      setCompetitionId("");
      setMatchId("");
      setTeam1GameTeamId("");
    } finally {
      setIsPending(false);
    }
  }

  if (!competition) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          value={competitionId}
          onValueChange={setCompetitionId}
          disabled={availableCompetitions.length === 0}
        >
          <SelectTrigger className="w-64">
            <SelectValue
              placeholder={
                availableCompetitions.length === 0
                  ? "No Laserball competitions"
                  : "Assign to competition…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availableCompetitions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!competitionId || isPending}
          onClick={() => run(() => addToCompetitionAction(gameId, competitionId))}
        >
          {isPending ? "Assigning…" : "Assign to Competition"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="outline" className="text-sm font-normal">
          {competition.competitionName}
        </Badge>
        {!assignment && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() => run(() => removeFromCompetitionAction(gameId))}
          >
            Remove from Competition
          </Button>
        )}
      </div>

      {assignment ? (
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-muted-foreground">
            {assignment.roundName} · Match {assignment.matchNumber} ·{" "}
            {assignment.half > 2 ? `OT ${assignment.half - 2}` : `Half ${assignment.half}`}
          </span>
          <span className="font-medium">
            {assignment.team1Name ?? "TBD"} vs {assignment.team2Name ?? "TBD"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={() => run(() => unassignAction(gameId, assignment.competitionMatchId))}
          >
            Remove from Match
          </Button>
        </div>
      ) : !side1GameTeamId ? (
        <p className="text-sm text-muted-foreground">
          Link this game to its other half (below) to assign the match to a slot.
        </p>
      ) : openMatches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open match slots — every match with both teams set already has its halves.
        </p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Assign this match (both halves) to</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Match</Label>
              <Select
                value={matchId}
                onValueChange={(v) => {
                  setMatchId(v);
                  setTeam1GameTeamId("");
                }}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select match…" />
                </SelectTrigger>
                <SelectContent>
                  {openMatches.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.roundName} · Match {m.matchNumber}: {m.team1Name} vs {m.team2Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedMatch && (
              <div className="space-y-1">
                <Label className="text-xs">{selectedMatch.team1Name} played this game as</Label>
                <Select value={team1GameTeamId} onValueChange={setTeam1GameTeamId}>
                  <SelectTrigger className="w-96">
                    <SelectValue placeholder="Select team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {TEAM_COLORS[t.colourEnum]?.label ?? t.name}:{" "}
                        {t.callsigns.join(", ") || "no players"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              size="sm"
              disabled={isPending || !selectedMatch || !team1GameTeamId}
              onClick={() =>
                run(() => assignAction(gameId, matchId, team1GameTeamId !== side1GameTeamId))
              }
            >
              {isPending ? "Assigning…" : "Assign to Match"}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
