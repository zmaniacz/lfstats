// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { PlayerGameListItem } from "@lfstats/db";
import { formatDateTime } from "@/lib/format";

export type PlayerStatPoint = {
  gameId: string;
  label: string;
  all: number;
  pos1: number | null;
  pos2: number | null;
  pos3: number | null;
  pos4: number | null;
  pos5: number | null;
};

export type PlayerStatKey = "mvpPoints" | "score" | "accuracy" | "hitDiff" | "medicHits";

const SERIES_KEYS = ["all", "pos1", "pos2", "pos3", "pos4", "pos5"] as const;
type SeriesKey = (typeof SERIES_KEYS)[number];

export function buildStatSeries(
  games: PlayerGameListItem[],
  statKey: PlayerStatKey,
): PlayerStatPoint[] {
  const sorted = [...games].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id),
  );

  return sorted.map((g) => {
    const value = g[statKey];
    return {
      gameId: g.id,
      label: formatDateTime(g.startTime),
      all: value,
      pos1: g.position === 1 ? value : null,
      pos2: g.position === 2 ? value : null,
      pos3: g.position === 3 ? value : null,
      pos4: g.position === 4 ? value : null,
      pos5: g.position === 5 ? value : null,
    };
  });
}

const MIN_SMOOTHING_WINDOW = 3;
const MAX_SMOOTHING_WINDOW = 40;
const SMOOTHING_WINDOW_FRACTION = 0.08;

// Scales with how many games actually feed a given line, so a 20-game competition
// isn't flattened by the same window that a 1000+ game career needs to read as a trend.
function windowSizeFor(sampleCount: number): number {
  return Math.min(
    MAX_SMOOTHING_WINDOW,
    Math.max(MIN_SMOOTHING_WINDOW, Math.round(sampleCount * SMOOTHING_WINDOW_FRACTION)),
  );
}

// Trailing moving average, computed per key over that key's own present (non-null)
// values in order — so a sparse position line is smoothed across its own games,
// not skewed by gaps where a different position was played that game.
export function smoothStatSeries(series: PlayerStatPoint[]): PlayerStatPoint[] {
  const smoothedByKey = {} as Record<SeriesKey, (number | null)[]>;

  for (const key of SERIES_KEYS) {
    const presentIndices: number[] = [];
    const presentValues: number[] = [];
    series.forEach((point, i) => {
      const value = point[key];
      if (typeof value === "number") {
        presentIndices.push(i);
        presentValues.push(value);
      }
    });

    const windowSize = windowSizeFor(presentValues.length);
    const smoothedValues = presentValues.map((_, i) => {
      const windowStart = Math.max(0, i - windowSize + 1);
      const window = presentValues.slice(windowStart, i + 1);
      return window.reduce((sum, v) => sum + v, 0) / window.length;
    });

    const column: (number | null)[] = new Array(series.length).fill(null);
    presentIndices.forEach((idx, i) => {
      column[idx] = smoothedValues[i];
    });
    smoothedByKey[key] = column;
  }

  return series.map((point, i) => ({
    ...point,
    all: smoothedByKey.all[i] as number,
    pos1: smoothedByKey.pos1[i],
    pos2: smoothedByKey.pos2[i],
    pos3: smoothedByKey.pos3[i],
    pos4: smoothedByKey.pos4[i],
    pos5: smoothedByKey.pos5[i],
  }));
}
