// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { haltCaveat, halfLabel } from "@/components/laserball/lb-match-shared";
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
import { formatDateTime } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type {
  LbMatchCandidateGame,
  LbMatchDetail,
  LbMatchOvertimePairing,
  LbMatchRosterWarning,
} from "@lfstats/db";
import Link from "next/link";

type GameTeam = {
  id: string;
  name: string;
  colourEnum: number;
};

type Pairing = {
  gameSide1TeamId: string;
  gameSide2TeamId: string;
  otherSide1TeamId: string;
  otherSide2TeamId: string;
};

type Props = {
  gameId: string;
  gameTeams: GameTeam[];
  matchDetail: LbMatchDetail | null;
  rosterWarnings: LbMatchRosterWarning[];
  candidateGames: LbMatchCandidateGame[];
  otCandidateGames: LbMatchCandidateGame[];
  linkAction: (gameId: string, otherGameId: string, pairing: Pairing) => Promise<void>;
  unlinkAction: (gameId: string, matchId: string, otherGameId: string) => Promise<void>;
  addOvertimeAction: (
    gameId: string,
    matchId: string,
    otGameId: string,
    pairing: LbMatchOvertimePairing,
  ) => Promise<void>;
  removeOvertimeAction: (gameId: string, matchId: string) => Promise<void>;
};

const WARNING_LABEL: Record<LbMatchRosterWarning["kind"], string> = {
  missing_from_half1: "played half 2 only",
  missing_from_half2: "played half 1 only",
  played_opposite_side: "switched sides unexpectedly",
};

export function LbMatchManager({
  gameId,
  gameTeams,
  matchDetail,
  rosterWarnings,
  candidateGames,
  otCandidateGames,
  linkAction,
  unlinkAction,
  addOvertimeAction,
  removeOvertimeAction,
}: Props) {
  const [isPending, setIsPending] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [gameSide1TeamId, setGameSide1TeamId] = useState("");
  const [otherSide1TeamId, setOtherSide1TeamId] = useState("");
  const [selectedOtCandidateId, setSelectedOtCandidateId] = useState("");
  const [otSide1TeamId, setOtSide1TeamId] = useState("");

  const selectedCandidate = candidateGames.find((c) => c.id === selectedCandidateId);
  const selectedOtCandidate = otCandidateGames.find((c) => c.id === selectedOtCandidateId);

  function handleCandidateChange(id: string) {
    setSelectedCandidateId(id);
    setGameSide1TeamId("");
    setOtherSide1TeamId("");
  }

  function handleOtCandidateChange(id: string) {
    setSelectedOtCandidateId(id);
    setOtSide1TeamId("");
  }

  async function handleLink() {
    if (!selectedCandidate || !gameSide1TeamId || !otherSide1TeamId) return;
    const gameSide2 = gameTeams.find((t) => t.id !== gameSide1TeamId);
    const otherSide2 = selectedCandidate.teams.find((t) => t.id !== otherSide1TeamId);
    if (!gameSide2 || !otherSide2) return;

    setIsPending(true);
    try {
      await linkAction(gameId, selectedCandidate.id, {
        gameSide1TeamId,
        gameSide2TeamId: gameSide2.id,
        otherSide1TeamId,
        otherSide2TeamId: otherSide2.id,
      });
    } finally {
      window.location.reload();
    }
  }

  async function handleUnlink() {
    if (!matchDetail) return;
    const otherGameId = matchDetail.halves.find((h) => h.gameId !== gameId)?.gameId ?? gameId;
    setIsPending(true);
    try {
      await unlinkAction(gameId, matchDetail.id, otherGameId);
    } finally {
      window.location.reload();
    }
  }

  async function handleAddOvertime() {
    if (!matchDetail || !selectedOtCandidate || !otSide1TeamId) return;
    const otSide2 = selectedOtCandidate.teams.find((t) => t.id !== otSide1TeamId);
    if (!otSide2) return;

    setIsPending(true);
    try {
      await addOvertimeAction(gameId, matchDetail.id, selectedOtCandidate.id, {
        side1TeamId: otSide1TeamId,
        side2TeamId: otSide2.id,
      });
    } finally {
      window.location.reload();
    }
  }

  async function handleRemoveOvertime() {
    if (!matchDetail) return;
    setIsPending(true);
    try {
      await removeOvertimeAction(gameId, matchDetail.id);
    } finally {
      window.location.reload();
    }
  }

  // ── Not linked ───────────────────────────────────────────────────────────
  if (!matchDetail) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Link as a Laserball match (first/second half)
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Other half</Label>
            <Select value={selectedCandidateId} onValueChange={handleCandidateChange}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Select the other game…" />
              </SelectTrigger>
              <SelectContent>
                {candidateGames.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No eligible Laserball games at this center
                  </SelectItem>
                ) : (
                  candidateGames.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {formatDateTime(c.startTime)}
                      {c.description ? ` — ${c.description}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedCandidate && (
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">This game&apos;s Side 1 team</Label>
              <Select value={gameSide1TeamId} onValueChange={setGameSide1TeamId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select team…" />
                </SelectTrigger>
                <SelectContent>
                  {gameTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {getTeamColor(t.colourEnum)?.label ?? t.name} ({t.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Other game&apos;s Side 1 team</Label>
              <Select value={otherSide1TeamId} onValueChange={setOtherSide1TeamId}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select team…" />
                </SelectTrigger>
                <SelectContent>
                  {selectedCandidate.teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {getTeamColor(t.colourEnum)?.label ?? t.name} ({t.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              size="sm"
              disabled={isPending || !gameSide1TeamId || !otherSide1TeamId}
              onClick={handleLink}
            >
              {isPending ? "Linking…" : "Link as Match"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Defensive fallback ───────────────────────────────────────────────────
  const half1 = matchDetail.halves.find((h) => h.half === 1);
  const half2 = matchDetail.halves.find((h) => h.half === 2);
  const overtime = matchDetail.halves.find((h) => h.half === 3);
  if (!half1 || !half2 || matchDetail.halves.length > 3) {
    return (
      <div className="flex items-center gap-3">
        <Badge variant="destructive">Match data incomplete</Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={handleUnlink}
        >
          Unlink Match
        </Button>
      </div>
    );
  }

  // ── Linked ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        {matchDetail.halves.map((h) => {
          const caveat = haltCaveat(h.gameOutcome, h.gameExcluded);
          return (
            <span key={h.gameId} className="flex items-center gap-1.5">
              {halfLabel(h.half)}:{" "}
              <Link href={`/laserball/games/${h.gameSlug}`} className="hover:underline">
                {formatDateTime(h.gameStartTime)}
              </Link>
              {caveat && (
                <Badge variant="destructive" className="text-xs px-1 py-0">
                  {caveat}
                </Badge>
              )}
            </span>
          );
        })}
      </div>

      {rosterWarnings.length > 0 && (
        <details className="text-sm border border-amber-400/50 bg-amber-500/10 rounded-md p-2">
          <summary className="cursor-pointer font-medium text-amber-700 dark:text-amber-300">
            Roster Notes ({rosterWarnings.length})
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {rosterWarnings.map((w, i) => (
              <li key={i}>
                Side {w.side} · {w.callsign} — {WARNING_LABEL[w.kind]}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!overtime && (
        <div className="space-y-3 border-t pt-3">
          <p className="text-sm text-muted-foreground">Add an overtime tiebreaker game</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Overtime game</Label>
              <Select value={selectedOtCandidateId} onValueChange={handleOtCandidateChange}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Select the overtime game…" />
                </SelectTrigger>
                <SelectContent>
                  {otCandidateGames.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No eligible Laserball games at this center
                    </SelectItem>
                  ) : (
                    otCandidateGames.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {formatDateTime(c.startTime)}
                        {c.description ? ` — ${c.description}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedOtCandidate && (
              <div className="space-y-1">
                <Label className="text-xs">Overtime game&apos;s Side 1 team</Label>
                <Select value={otSide1TeamId} onValueChange={setOtSide1TeamId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select team…" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedOtCandidate.teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {getTeamColor(t.colourEnum)?.label ?? t.name} ({t.name})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedOtCandidate && (
              <Button size="sm" disabled={isPending || !otSide1TeamId} onClick={handleAddOvertime}>
                {isPending ? "Adding…" : "Add Overtime"}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {overtime && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={isPending}
            onClick={handleRemoveOvertime}
          >
            Remove Overtime
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={isPending}
          onClick={handleUnlink}
        >
          Unlink Match
        </Button>
      </div>
    </div>
  );
}
