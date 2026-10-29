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
import { formatDateTime } from "@/lib/format";
import { TEAM_COLORS } from "@/lib/team-colors";
import type { LbAssignableMatch, LbAssignableSide, LbCompetitionGame } from "@lfstats/db";
import { useState } from "react";

type Result = { ok: true } | { ok: false; error: string };

type Props = {
  team1Name: string;
  team2Name: string;
  assignableMatches: LbAssignableMatch[];
  unlinkedGames: LbCompetitionGame[];
  assignAction: (formData: FormData) => Promise<Result>;
  linkAction: (formData: FormData) => Promise<Result>;
};

function sideLabel(side: Pick<LbAssignableSide, "colourEnum" | "name" | "callsigns">): string {
  const colour = TEAM_COLORS[side.colourEnum]?.label ?? side.name;
  return `${colour}: ${side.callsigns.join(", ") || "no players"}`;
}

/**
 * Fills a Laserball competition match: either with halves already linked as a match (from the
 * game page or a previous assignment), or by linking two of the competition's games here.
 * Teams are identified by who played, since the TDF only knows colours.
 */
export function LbMatchAssignForm({
  team1Name,
  team2Name,
  assignableMatches,
  unlinkedGames,
  assignAction,
  linkAction,
}: Props) {
  const [mode, setMode] = useState<"linked" | "games">(
    assignableMatches.length > 0 ? "linked" : "games",
  );
  const [lbMatchId, setLbMatchId] = useState("");
  const [team1Side, setTeam1Side] = useState<"1" | "2">("1");
  const [half1GameId, setHalf1GameId] = useState("");
  const [half1Team1, setHalf1Team1] = useState("");
  const [half2GameId, setHalf2GameId] = useState("");
  const [half2Team1, setHalf2Team1] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMatch = assignableMatches.find((m) => m.lbMatchId === lbMatchId);
  const half1Game = unlinkedGames.find((g) => g.id === half1GameId);
  const half2Game = unlinkedGames.find((g) => g.id === half2GameId);

  async function submit(action: (formData: FormData) => Promise<Result>, formData: FormData) {
    setIsPending(true);
    setError(null);
    try {
      const result = await action(formData);
      // On success the page re-renders without this form; keep selections on failure.
      if (!result.ok) setError(result.error);
    } finally {
      setIsPending(false);
    }
  }

  function submitLinked(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("lbMatchId", lbMatchId);
    formData.set("swapSides", String(team1Side === "2"));
    void submit(assignAction, formData);
  }

  function submitGames(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    formData.set("half1GameId", half1GameId);
    formData.set("half1Team1GameTeamId", half1Team1);
    formData.set("half2GameId", half2GameId);
    formData.set("half2Team1GameTeamId", half2Team1);
    void submit(linkAction, formData);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "linked" ? "default" : "outline"}
          onClick={() => setMode("linked")}
        >
          Linked halves ({assignableMatches.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "games" ? "default" : "outline"}
          onClick={() => setMode("games")}
        >
          Link two games ({unlinkedGames.length})
        </Button>
      </div>

      {mode === "linked" ? (
        <form onSubmit={submitLinked} className="space-y-4">
          {assignableMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No linked halves in this competition are waiting for a match.
            </p>
          ) : (
            <div className="space-y-1">
              <Label>Halves</Label>
              <Select value={lbMatchId} onValueChange={setLbMatchId}>
                <SelectTrigger className="w-full max-w-2xl">
                  <SelectValue placeholder="Select linked halves…" />
                </SelectTrigger>
                <SelectContent>
                  {assignableMatches.map((m) => {
                    const h1 = m.halves[0];
                    return (
                      <SelectItem key={m.lbMatchId} value={m.lbMatchId}>
                        {formatDateTime(h1.startTime)} · {h1.side1.callsigns[0] ?? "?"}… vs{" "}
                        {h1.side2.callsigns[0] ?? "?"}… ·{" "}
                        {m.halves
                          .map((h) => `${h.side1.score ?? 0}–${h.side2.score ?? 0}`)
                          .join(", ")}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedMatch && (
            <>
              <div className="text-sm space-y-2 border rounded-md p-3">
                {selectedMatch.halves.map((h) => (
                  <div key={h.half}>
                    <span className="font-medium">
                      {h.half > 2 ? `OT ${h.half - 2}` : `Half ${h.half}`}
                    </span>{" "}
                    <span className="text-muted-foreground">{formatDateTime(h.startTime)}</span>
                    <div className="pl-4">Side 1 — {sideLabel(h.side1)}</div>
                    <div className="pl-4">Side 2 — {sideLabel(h.side2)}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <Label>{team1Name} is</Label>
                <Select value={team1Side} onValueChange={(v) => setTeam1Side(v as "1" | "2")}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Side 1 ({team2Name} is Side 2)</SelectItem>
                    <SelectItem value="2">Side 2 ({team2Name} is Side 1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={isPending || !selectedMatch}>
            {isPending ? "Assigning…" : "Assign Halves"}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitGames} className="space-y-4">
          {unlinkedGames.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Fewer than two of this competition&apos;s games are unlinked.
            </p>
          ) : (
            <>
              {(
                [
                  [1, half1GameId, setHalf1GameId, half1Game, half1Team1, setHalf1Team1],
                  [2, half2GameId, setHalf2GameId, half2Game, half2Team1, setHalf2Team1],
                ] as const
              ).map(([n, gameId, setGameId, selected, team1, setTeam1]) => (
                <div key={n} className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label>Half {n}</Label>
                    <Select
                      value={gameId}
                      onValueChange={(v) => {
                        setGameId(v);
                        setTeam1("");
                      }}
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder="Select game…" />
                      </SelectTrigger>
                      <SelectContent>
                        {unlinkedGames.map((g) => (
                          <SelectItem
                            key={g.id}
                            value={g.id}
                            disabled={g.id === (n === 1 ? half2GameId : half1GameId)}
                          >
                            {formatDateTime(g.startTime)} ·{" "}
                            {g.teams.map((t) => t.score ?? 0).join("–")}
                            {g.excluded ? " (excluded)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selected && (
                    <div className="space-y-1">
                      <Label>{team1Name} played as</Label>
                      <Select value={team1} onValueChange={setTeam1}>
                        <SelectTrigger className="w-96">
                          <SelectValue placeholder="Select team…" />
                        </SelectTrigger>
                        <SelectContent>
                          {selected.teams.map((t) => (
                            <SelectItem key={t.gameTeamId} value={t.gameTeamId}>
                              {sideLabel(t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {team2Name} is the other team in each game. The earlier game becomes half 1.
              </p>
            </>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={isPending || !half1GameId || !half2GameId || !half1Team1 || !half2Team1}
          >
            {isPending ? "Linking…" : "Link and Assign"}
          </Button>
        </form>
      )}
    </div>
  );
}
