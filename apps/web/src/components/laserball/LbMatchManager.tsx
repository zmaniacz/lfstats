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
import { formatDateTime, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { LbMatchCandidateGame, LbMatchDetail, LbMatchRosterWarning } from "@lfstats/db";
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
  linkAction: (gameId: string, otherGameId: string, pairing: Pairing) => Promise<void>;
  unlinkAction: (gameId: string, matchId: string, otherGameId: string) => Promise<void>;
};

const WARNING_LABEL: Record<LbMatchRosterWarning["kind"], string> = {
  missing_from_half1: "played half 2 only",
  missing_from_half2: "played half 1 only",
  played_opposite_side: "switched sides unexpectedly",
};

function haltCaveat(outcome: string, excluded: boolean): string | null {
  if (excluded) return "Excluded from Stats";
  if (outcome === "replay") return "Replay";
  if (outcome === "aborted") return "Aborted";
  if (outcome === "forfeit") return "Forfeit";
  return null;
}

export function LbMatchManager({
  gameId,
  gameTeams,
  matchDetail,
  rosterWarnings,
  candidateGames,
  linkAction,
  unlinkAction,
}: Props) {
  const [isPending, setIsPending] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [gameSide1TeamId, setGameSide1TeamId] = useState("");
  const [otherSide1TeamId, setOtherSide1TeamId] = useState("");

  const selectedCandidate = candidateGames.find((c) => c.id === selectedCandidateId);

  function handleCandidateChange(id: string) {
    setSelectedCandidateId(id);
    setGameSide1TeamId("");
    setOtherSide1TeamId("");
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
  if (matchDetail.halves.length !== 2) {
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
  const [half1, half2] = matchDetail.halves;
  const sides = [
    { side: 1 as const, total: matchDetail.side1TotalScore, h1: half1!.side1, h2: half2!.side1 },
    { side: 2 as const, total: matchDetail.side2TotalScore, h1: half1!.side2, h2: half2!.side2 },
  ];

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {sides.map(({ side, total, h1, h2 }) => {
          const isWinner = matchDetail.winnerSide === side;
          return (
            <div
              key={side}
              className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md bg-muted/40"
            >
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className={`font-medium ${getTeamColor(h1.colourEnum)?.text ?? ""}`}>
                  {h1.name}
                </span>
                <span className="text-muted-foreground">→</span>
                <span className={`font-medium ${getTeamColor(h2.colourEnum)?.text ?? ""}`}>
                  {h2.name}
                </span>
                {isWinner && <Badge variant="default">Winner</Badge>}
                {matchDetail.winnerSide === "draw" && <Badge variant="secondary">Draw</Badge>}
              </div>
              <span className="tabular-nums font-semibold">{formatScore(total)}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        {matchDetail.halves.map((h) => {
          const caveat = haltCaveat(h.gameOutcome, h.gameExcluded);
          return (
            <span key={h.gameId} className="flex items-center gap-1.5">
              Half {h.half}:{" "}
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
