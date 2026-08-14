// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Turns raw `mvp_points` into a signal a rating model can use, and assigns each
 * game a context weight.
 *
 * MVP is not comparable across positions — a Scout routinely outscores a Medic
 * because the MVP model's `score_bonus` thresholds and `elimination_bonus` are
 * both position-specific (docs/Core_Schema.md). It is also not independent of
 * the team result, since `elimination_bonus` pays out to the whole winning side.
 *
 * Both confounds are removed by the pair of transforms used here:
 *
 *   - z-scoring within position removes the "Scouts score more" effect;
 *   - taking the within-team contrast (z_i − z̄_T) removes every team-level
 *     effect, because a team-level bonus is by definition constant across that
 *     team's players and so cancels in the deviation from the team mean.
 *
 * What survives is a player's contribution relative to their own side in that
 * game — which is exactly the quantity the outcome term does not already know.
 */

import type { GameRecord } from "./types";

export type PositionStats = { mean: number; sd: number; n: number };

/** Fallback when a position has too few samples to estimate a spread. */
const MIN_SAMPLES = 30;
const FALLBACK_SD = 1;

/**
 * Per-position mean and sd of `mvp_points`.
 *
 * Must be computed from TRAINING games only — fitting it on the full set leaks
 * test-period information into every prediction.
 */
export function computePositionMvpStats(games: GameRecord[]): Map<number, PositionStats> {
  const sums = new Map<number, { n: number; sum: number; sumSq: number }>();

  for (const g of games) {
    for (const side of g.sides) {
      for (const p of side.players) {
        let acc = sums.get(p.position);
        if (!acc) {
          acc = { n: 0, sum: 0, sumSq: 0 };
          sums.set(p.position, acc);
        }
        acc.n++;
        acc.sum += p.mvpPoints;
        acc.sumSq += p.mvpPoints * p.mvpPoints;
      }
    }
  }

  const stats = new Map<number, PositionStats>();
  for (const [position, acc] of sums) {
    const mean = acc.sum / acc.n;
    const variance = Math.max(0, acc.sumSq / acc.n - mean * mean);
    const sd = Math.sqrt(variance);
    stats.set(position, {
      mean,
      sd: acc.n >= MIN_SAMPLES && sd > 1e-9 ? sd : FALLBACK_SD,
      n: acc.n,
    });
  }
  return stats;
}

export function mvpZ(
  stats: Map<number, PositionStats>,
  position: number,
  mvpPoints: number,
): number {
  const s = stats.get(position);
  if (!s) return 0;
  return (mvpPoints - s.mean) / s.sd;
}

/**
 * Within-team MVP contrasts for one side, in roster order.
 *
 * Guests are included in the team mean — they contributed to the game, so
 * excluding them would bias every teammate's contrast — but the caller decides
 * whether to act on a guest's own value.
 */
export function teamMvpContrasts(
  stats: Map<number, PositionStats>,
  players: readonly { position: number; mvpPoints: number }[],
): number[] {
  if (players.length === 0) return [];
  const zs = players.map((p) => mvpZ(stats, p.position, p.mvpPoints));
  const mean = zs.reduce((a, b) => a + b, 0) / zs.length;
  return zs.map((z) => z - mean);
}

// ---------------------------------------------------------------------------
// Margin of victory
// ---------------------------------------------------------------------------

export type MarginSource = "mvp" | "score";

/**
 * How dominant a win was, as a signed quantity from side A's perspective.
 *
 * `mvp` sums each side's raw MVP points — MVP is a combined per-player
 * performance stat, so the team total is a reasonable read on how strongly that
 * side played as a unit. `score` uses the raw team score instead.
 *
 * Returns null when the inputs are missing, so the caller can fall back to
 * treating the game as marginless rather than inventing a zero.
 */
export function rawMargin(g: GameRecord, source: MarginSource): number | null {
  if (source === "score") {
    const a = g.sides[0].score;
    const b = g.sides[1].score;
    return a === null || b === null ? null : a - b;
  }
  const total = (side: GameRecord["sides"][number]) =>
    side.players.reduce((s, p) => s + p.mvpPoints, 0);
  return total(g.sides[0]) - total(g.sides[1]);
}

export type MarginScale = { sd: number; meanLog: number };

/**
 * Fits the margin distribution on TRAINING games so the multiplier below can be
 * normalised to average 1 — otherwise turning margin on would silently rescale
 * every update and confound the comparison with plain Weng-Lin.
 */
export function fitMarginScale(games: GameRecord[], source: MarginSource): MarginScale {
  const margins: number[] = [];
  for (const g of games) {
    const m = rawMargin(g, source);
    if (m !== null) margins.push(m);
  }
  if (margins.length === 0) return { sd: 1, meanLog: 1 };

  const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
  const sd = Math.sqrt(margins.reduce((a, b) => a + (b - mean) ** 2, 0) / margins.length) || 1;
  const meanLog =
    margins.reduce((a, m) => a + Math.log1p(Math.abs(m) / sd), 0) / margins.length || 1;
  return { sd, meanLog };
}

/**
 * Margin-of-victory multiplier on the update size, averaging ~1 across games.
 *
 * `log1p` damps the tail: a blowout should count for more than a nail-biter, but
 * a freak result must not be allowed to dominate a player's whole history. This
 * is the standard shape used for MOV-adjusted Elo in other sports.
 *
 * `gamma` interpolates: 0 disables margin entirely and recovers the base model.
 */
export function marginMultiplier(
  g: GameRecord,
  source: MarginSource,
  scale: MarginScale,
  gamma: number,
): number {
  if (gamma === 0) return 1;
  const m = rawMargin(g, source);
  if (m === null) return 1;
  const shaped = Math.log1p(Math.abs(m) / scale.sd) / scale.meanLog;
  return Math.max(0.05, 1 + gamma * (shaped - 1));
}

export type ContextWeightOptions = {
  /** Applied to social/nightly games and to competitions flagged `type = 'social'`. */
  socialWeight: number;
};

export const DEFAULT_CONTEXT_WEIGHTS: ContextWeightOptions = { socialWeight: 0.5 };

/**
 * How much a game moves ratings.
 *
 * Competition games are weighted by `competition_round.multiplier`, which is
 * already the domain's own statement of how much a round counts (finals are
 * routinely scored higher than pool play) — reusing it avoids inventing a
 * second, competing set of numbers. Everything else is social.
 */
export function contextWeight(g: GameRecord, opts: ContextWeightOptions): number {
  if (g.competitionId === null) return opts.socialWeight;
  if (g.competitionType === "social") return opts.socialWeight;
  return g.roundMultiplier ?? 1;
}
