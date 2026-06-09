// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { TEAM_COLORS } from "@/lib/team-colors";
import type { CompetitionListItem, AvailableMatch, GameMatchAssignment } from "@lfstats/db";

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
  addToCompetitionAction: (gameId: string, competitionId: string) => Promise<void>;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const router = useRouter();
  const isPending = isSubmitting || isRefreshing;

  // Add-to-competition form state
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");

  // Assign-to-match form state
  const [selectedMatchId, setSelectedMatchId] = useState("");
  const [selectedGameNumber, setSelectedGameNumber] = useState("");
  const [team1GameTeamId, setTeam1GameTeamId] = useState("");
  const [team2GameTeamId, setTeam2GameTeamId] = useState("");

  // Some heavier mutations (e.g. assigning a game to a match also rewrites
  // mercenary flags across multiple scorecards via correlated-subquery UPDATEs)
  // take long enough that the resulting `router.refresh()` transition gets
  // scheduled but never gets a chance to commit — it only flushes once some
  // unrelated navigation activity (a tab switch, a sidebar Link prefetch on
  // hover) nudges React's scheduler. Firing a second refresh shortly after
  // reliably provides that nudge ourselves; both refreshes are cheap no-ops
  // once the server-side cache has already been revalidated.
  //
  // TODO: revisit when upgrading React/Next — this looks like a sibling of the
  // scheduler/transition bugs tracked in vercel/next.js#88767 (and #77504,
  // #86055, #82289). Once those land a fix, test whether a single
  // `router.refresh()` is sufficient again and drop the follow-up call.
  function refreshPage() {
    startRefreshTransition(() => {
      router.refresh();
    });
    setTimeout(() => {
      startRefreshTransition(() => {
        router.refresh();
      });
    }, 500);
  }

  const selectedMatch = availableMatches.find((m) => m.id === selectedMatchId);

  function handleMatchChange(id: string) {
    setSelectedMatchId(id);
    setSelectedGameNumber("");
    setTeam1GameTeamId("");
    setTeam2GameTeamId("");
  }

  async function handleAddToCompetition() {
    if (!selectedCompetitionId) return;
    setIsSubmitting(true);
    try {
      await addToCompetitionAction(gameId, selectedCompetitionId);
    } finally {
      setIsSubmitting(false);
    }
    refreshPage();
  }

  async function handleRemoveFromCompetition() {
    setIsSubmitting(true);
    try {
      await removeFromCompetitionAction(gameId);
    } finally {
      setIsSubmitting(false);
    }
    refreshPage();
  }

  async function handleAssignToMatch() {
    if (!selectedMatchId || !selectedGameNumber || !team1GameTeamId || !team2GameTeamId) return;
    setIsSubmitting(true);
    try {
      await assignToMatchAction(
        gameId,
        selectedMatchId,
        parseInt(selectedGameNumber, 10),
        team1GameTeamId,
        team2GameTeamId,
      );
    } finally {
      setIsSubmitting(false);
    }
    refreshPage();
  }

  async function handleRemoveFromMatch() {
    if (!matchAssignment) return;
    setIsSubmitting(true);
    try {
      await removeFromMatchAction(gameId, matchAssignment.matchGameId);
    } finally {
      setIsSubmitting(false);
    }
    refreshPage();
  }

  // ── No competition ──────────────────────────────────────────────────────
  if (!competitionId) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedCompetitionId} onValueChange={setSelectedCompetitionId}>
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
          onClick={handleAddToCompetition}
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
          onClick={handleRemoveFromCompetition}
        >
          Remove from Competition
        </Button>
      </div>

      {matchAssignment ? (
        // ── Assigned to a match ─────────────────────────────────────────
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-muted-foreground">
            {matchAssignment.roundName} · Match {matchAssignment.matchNumber} · Game{" "}
            {matchAssignment.gameNumber}
          </span>
          <span className="font-medium">
            {matchAssignment.team1Name} vs {matchAssignment.team2Name}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={handleRemoveFromMatch}
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
                      {m.roundName} · Match {m.matchNumber}: {m.team1Name} vs {m.team2Name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedMatch && (
              <div className="space-y-1">
                <Label className="text-xs">Game #</Label>
                <Select value={selectedGameNumber} onValueChange={setSelectedGameNumber}>
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
                <Label className="text-xs">{selectedMatch.team1Name} plays as</Label>
                <Select value={team1GameTeamId} onValueChange={setTeam1GameTeamId}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select color…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled={t.id === team2GameTeamId}>
                        {TEAM_COLORS[t.colourEnum]?.label ?? t.name} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">{selectedMatch.team2Name} plays as</Label>
                <Select value={team2GameTeamId} onValueChange={setTeam2GameTeamId}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select color…" />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id} disabled={t.id === team1GameTeamId}>
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
                onClick={handleAssignToMatch}
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
