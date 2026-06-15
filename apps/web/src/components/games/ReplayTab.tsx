// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { formatMs, formatScore, formatPct } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import { getTeamColor } from "@/lib/team-colors";
import type { ReplayData, ReplayPlayer, ReplayPlayerState } from "@lfstats/db";

const TICK_MS = 100;
const SPEEDS = [1, 2, 4, 8] as const;
type Speed = (typeof SPEEDS)[number];

const HEAVY_WEAPONS_POSITION = 2;

// Respawn cycle: state 3 (down) for 4s, then state 2 (vulnerable) for 4s, then state 0 (active).
const RESPAWN_PHASE_MS = 4000;

function RespawnIndicator({ progress, color }: { progress: number; color: "red" | "yellow" }) {
  const deg = Math.round(Math.min(Math.max(progress, 0), 1) * 360);
  const fillColor = color === "red" ? "var(--color-red-500)" : "var(--color-yellow-400)";
  return (
    <span
      className="inline-block size-2.5 rounded-full border border-border shrink-0"
      style={{
        background: `conic-gradient(${fillColor} ${deg}deg, transparent ${deg}deg)`,
      }}
      aria-hidden="true"
    />
  );
}

const MISS_EVENT_TYPES = new Set(["0201", "0202", "0301", "0304"]);

function isMissEvent(eventType: string): boolean {
  return MISS_EVENT_TYPES.has(eventType);
}

function isStateChangeEvent(eventType: string): boolean {
  return eventType.startsWith("state_");
}

function binarySearchLatestState(
  states: ReplayPlayerState[],
  atTime: number,
): ReplayPlayerState | null {
  let lo = 0;
  let hi = states.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (states[mid].time <= atTime) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result === -1 ? null : states[result];
}

type ComputedPlayer = ReplayPlayer & {
  rank: number;
  score: number;
  accuracy: number;
  lives: number;
  shots: number;
  missiles: number;
  sp: number | null;
  state: number;
  respawnProgress: number | null;
  respawnColor: "red" | "yellow" | null;
  isEliminated: boolean;
};

type ComputedTeam = {
  teamId: string;
  teamName: string;
  teamColour: number;
  totalScore: number;
  players: ComputedPlayer[];
};

export function ReplayTab({ gameId, duration }: { gameId: string; duration: number }) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [showMisses, setShowMisses] = useState(false);
  const [showStateChanges, setShowStateChanges] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`/api/games/${gameId}/replay`)
      .then((r) => r.json())
      .then((d: ReplayData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [gameId]);

  // Pre-process: build per-player state arrays (already sorted by time from query)
  const statesByPlayer = useMemo(() => {
    if (!data) return new Map<string, ReplayPlayerState[]>();
    const map = new Map<string, ReplayPlayerState[]>();
    for (const s of data.playerStates) {
      const arr = map.get(s.scorecardId) ?? [];
      arr.push(s);
      map.set(s.scorecardId, arr);
    }
    return map;
  }, [data]);

  // Pre-process: callsign + team color lookup for event stream
  const playerMap = useMemo(() => {
    if (!data) return new Map<string, { callsign: string; teamColour: number }>();
    const map = new Map<string, { callsign: string; teamColour: number }>();
    for (const p of data.players)
      map.set(p.scorecardId, { callsign: p.callsign, teamColour: p.teamColour });
    return map;
  }, [data]);

  // Pre-process: non-player actor name lookup (warbots, resupply beacons)
  const nonPlayerActorMap = useMemo(() => {
    if (!data) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const a of data.nonPlayerActors) map.set(a.gameTargetId, a.name);
    return map;
  }, [data]);

  // Timer management
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (!isPlaying) return;

    intervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + TICK_MS * speed;
        if (next >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return next;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, duration]);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  // Scoreboard computation
  const computedTeams = useMemo((): ComputedTeam[] => {
    if (!data) return [];

    const teamMap = new Map<string, ComputedTeam>();
    for (const player of data.players) {
      if (!teamMap.has(player.teamId)) {
        teamMap.set(player.teamId, {
          teamId: player.teamId,
          teamName: player.teamName,
          teamColour: player.teamColour,
          totalScore: 0,
          players: [],
        });
      }
    }

    for (const player of data.players) {
      const states = statesByPlayer.get(player.scorecardId) ?? [];
      const state = binarySearchLatestState(states, currentTime);
      const score = state?.score ?? 0;
      const team = teamMap.get(player.teamId)!;
      team.totalScore += score;

      let respawnProgress: number | null = null;
      let respawnColor: "red" | "yellow" | null = null;
      if (state?.state === 3) {
        respawnProgress = (currentTime - state.time) / RESPAWN_PHASE_MS / 2;
        respawnColor = "red";
      } else if (state?.state === 2) {
        respawnProgress = 0.5 + (currentTime - state.time) / RESPAWN_PHASE_MS / 2;
        respawnColor = "yellow";
      }

      team.players.push({
        ...player,
        rank: 0,
        score,
        accuracy: state?.accuracy ?? 0,
        lives: state?.lives ?? 0,
        shots: state?.shots ?? 0,
        missiles: state?.missiles ?? 0,
        sp: player.position === HEAVY_WEAPONS_POSITION ? null : (state?.sp ?? 0),
        state: state?.state ?? 0,
        respawnProgress,
        respawnColor,
        isEliminated: state?.isEliminated ?? false,
      });
    }

    const teams = Array.from(teamMap.values());
    for (const team of teams) {
      team.players.sort((a, b) => b.score - a.score);
      team.players.forEach((p, i) => {
        p.rank = i + 1;
      });
    }
    teams.sort((a, b) => b.totalScore - a.totalScore);
    return teams;
  }, [data, statesByPlayer, currentTime]);

  // Event stream computation
  const visibleEvents = useMemo(() => {
    if (!data) return [];
    const visible = data.events.filter((e) => {
      if (e.time > currentTime) return false;
      if (!showMisses && isMissEvent(e.eventType)) return false;
      if (!showStateChanges && isStateChangeEvent(e.eventType)) return false;
      return true;
    });
    return visible.slice(-20).reverse();
  }, [data, currentTime, showMisses, showStateChanges]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-6 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-muted-foreground text-sm">Replay data not available for this game.</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Playback controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={handleReset} aria-label="Reset">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {SPEEDS.map((s) => (
              <Button
                key={s}
                variant={speed === s ? "default" : "outline"}
                size="sm"
                onClick={() => setSpeed(s)}
              >
                {s}x
              </Button>
            ))}
          </div>
          <span className="ml-auto tabular-nums text-sm text-muted-foreground">
            {formatMs(currentTime)} / {formatMs(duration)}
          </span>
        </div>
        <Slider
          min={0}
          max={duration}
          step={TICK_MS}
          value={[currentTime]}
          onValueChange={([v]) => {
            setIsPlaying(false);
            setCurrentTime(v);
          }}
        />
      </div>

      {/* Scoreboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {computedTeams.map((team) => {
          const color = getTeamColor(team.teamColour);
          return (
            <div key={team.teamId} className="space-y-0">
              <div
                className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
              >
                <span className={`font-bold ${color?.text ?? ""}`}>{team.teamName}</span>
                <span className="tabular-nums font-semibold">{formatScore(team.totalScore)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead>Callsign</TableHead>
                    <TableHead className="w-4 px-0" />
                    <TableHead className="text-center">Pos</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Acc</TableHead>
                    <TableHead className="text-right">Lives</TableHead>
                    <TableHead className="text-right">Shots</TableHead>
                    <TableHead className="text-right">Msls</TableHead>
                    <TableHead className="text-right">SP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.players.map((player) => (
                    <TableRow
                      key={player.scorecardId}
                      className={player.isEliminated ? "opacity-50" : ""}
                    >
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {player.rank}
                      </TableCell>
                      <TableCell
                        className={`font-medium flex items-center gap-1.5 ${
                          player.isEliminated
                            ? "text-muted-foreground"
                            : player.state === 2 || player.state === 3
                              ? `${color?.text ?? ""} opacity-50`
                              : (color?.text ?? "")
                        }`}
                      >
                        {player.callsign}
                        {player.isEliminated && (
                          <Badge variant="destructive" className="text-xs px-1 py-0">
                            OUT
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="px-0">
                        {!player.isEliminated &&
                          player.respawnProgress !== null &&
                          player.respawnColor && (
                            <RespawnIndicator
                              progress={player.respawnProgress}
                              color={player.respawnColor}
                            />
                          )}
                      </TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">
                        {getPosition(player.position)?.abbr ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatScore(player.score)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPct(player.accuracy)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{player.lives}</TableCell>
                      <TableCell className="text-right tabular-nums">{player.shots}</TableCell>
                      <TableCell className="text-right tabular-nums">{player.missiles}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {player.sp === null ? "—" : player.sp}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          );
        })}
      </div>

      {/* Event stream */}
      <div className="space-y-1">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Events
          </h3>
          <div className="flex items-center gap-1">
            <Toggle
              variant="outline"
              size="sm"
              pressed={showMisses}
              onPressedChange={setShowMisses}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              Misses
            </Toggle>
            <Toggle
              variant="outline"
              size="sm"
              pressed={showStateChanges}
              onPressedChange={setShowStateChanges}
              className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              State Changes
            </Toggle>
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-3 space-y-1 min-h-[80px] max-h-64 overflow-y-auto">
          {visibleEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet.</p>
          ) : (
            visibleEvents.map((event) => {
              const actorPlayer = event.actorScorecardId
                ? playerMap.get(event.actorScorecardId)
                : null;
              const actorName = actorPlayer
                ? actorPlayer.callsign
                : event.actorGameTargetId
                  ? nonPlayerActorMap.get(event.actorGameTargetId)
                  : null;
              const actorColor = actorPlayer
                ? getTeamColor(actorPlayer.teamColour)?.text
                : undefined;

              const targetPlayer =
                event.isPlayerTarget && event.targetScorecardId
                  ? playerMap.get(event.targetScorecardId)
                  : null;
              const targetName = targetPlayer
                ? targetPlayer.callsign
                : event.targetGameTargetId
                  ? (nonPlayerActorMap.get(event.targetGameTargetId) ?? "a target")
                  : null;
              const targetColor = targetPlayer
                ? getTeamColor(targetPlayer.teamColour)?.text
                : undefined;

              return (
                <div key={event.id} className="flex items-baseline gap-2 text-sm">
                  <span className="tabular-nums text-xs text-muted-foreground shrink-0 w-12">
                    {formatMs(event.time)}
                  </span>
                  <span>
                    {actorName && <span className={actorColor}>{actorName}</span>}
                    {actorName && " "}
                    {event.description.trim()}
                    {targetName && " "}
                    {targetName && <span className={targetColor}>{targetName}</span>}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
