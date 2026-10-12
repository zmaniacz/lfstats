// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { PlayerTimeline } from "@lfstats/db";

export type TimelineRow = {
  time: number;
  score: number;
  shots: number;
  lives: number;
  steps: number | null;
};

export type TimelineStatus = "up" | "down" | "resupply" | "eliminated";

/**
 * Merges the sparse state and step streams onto one shared time index so the
 * stacked lanes can sync their hover cursor by row index. Each stream is
 * forward-filled, and a final row at elimination (or game end) carries the last
 * values out so the step lines reach the edge.
 */
export function buildTimelineSeries(timeline: PlayerTimeline): {
  rows: TimelineRow[];
  statusAt: (time: number) => TimelineStatus;
} {
  const { points, steps, intervals, eliminatedAt, duration } = timeline;
  const endTime = eliminatedAt ?? duration;
  const first = points[0];

  const times = new Set<number>([0, endTime]);
  for (const p of points) if (p.time <= endTime) times.add(p.time);
  for (const s of steps ?? []) if (s.time <= endTime) times.add(s.time);
  const sorted = [...times].sort((a, b) => a - b);

  const rows: TimelineRow[] = [];
  let pi = 0;
  let si = 0;
  let cur = { score: 0, shots: first?.shots ?? 0, lives: first?.lives ?? 0 };
  let stepTotal: number | null = steps === null ? null : 0;
  for (const time of sorted) {
    while (pi < points.length && points[pi]!.time <= time) {
      const p = points[pi++]!;
      cur = { score: p.score, shots: p.shots, lives: p.lives };
    }
    if (steps !== null) {
      while (si < steps.length && steps[si]!.time <= time) stepTotal = steps[si++]!.total;
    }
    rows.push({ time, ...cur, steps: stepTotal });
  }

  function statusAt(time: number): TimelineStatus {
    if (eliminatedAt !== null && time >= eliminatedAt) return "eliminated";
    const iv = intervals.find((i) => time >= i.start && time < i.end);
    return iv ? iv.kind : "up";
  }

  return { rows, statusAt };
}
