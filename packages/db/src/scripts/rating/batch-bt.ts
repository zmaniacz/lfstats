// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * M4 — regularised Bradley-Terry fitted in batch over every game at once:
 *
 *     P(A beats B) = sigmoid( Σ_{i∈A} θ_i − Σ_{j∈B} θ_j )
 *
 * minimising weighted log-loss plus an L2 penalty pulling θ toward 0.
 *
 * This is the statistically principled reference point. Two properties matter
 * here specifically:
 *
 *   - It has no ordering dependence, which is worth something given that
 *     `game.start_time` is center-local and the global ordering is only
 *     approximate.
 *   - The L2 penalty is what keeps a 2-game player from landing at ±∞, which
 *     is the failure mode of unregularised Bradley-Terry on a sparse graph.
 *
 * If the online models cannot get near M4's log-loss, they are leaving
 * information on the table and the batch approach is worth productionising.
 *
 * Guests share a single pooled parameter rather than being dropped. Dropping
 * them would understate whichever side they played on; pooling them estimates
 * one "average guest" strength, which is exactly what the model can identify.
 * Note this differs from the online models, where each guest is a fresh
 * prior-mean player — the batch fit gets slightly more information here.
 */

import type { GameRecord, PlayerRating, RatingModel } from "./types";

const GUEST_KEY = "__guest__";

export type BatchBtOptions = {
  /** L2 strength. Higher shrinks sparse players harder toward average. */
  l2: number;
  iterations: number;
  learningRate: number;
  /**
   * Refit cadence during prequential evaluation, in days. The fit is
   * warm-started from the previous solution, so a refit is far cheaper than the
   * initial one.
   */
  refitEveryDays: number;
};

export const DEFAULT_BATCH_BT: BatchBtOptions = {
  l2: 1.0,
  iterations: 400,
  learningRate: 0.05,
  refitEveryDays: 30,
};

/**
 * Optional per-game soft target, in [0,1], replacing the hard win/loss/draw
 * label. A batch fit can absorb margin either as a sample WEIGHT (how much this
 * game counts) or as a soft LABEL (how emphatic the result was); the second is
 * usually the more information-efficient of the two, since it tells the model
 * something about direction rather than just volume.
 *
 * Returning null keeps the hard label.
 */
export type SoftLabelFn = (g: GameRecord, hardLabel: number) => number | null;

/**
 * Bootstrap summary for one player.
 *
 * Both a RATING interval and a RANK interval, because they answer different
 * questions. The rating interval carries the uncertainty in the whole system's
 * scale and location; a resample that lifts everyone together widens it without
 * changing anybody's position. The rank interval conditions that away and asks
 * only "where does this player sit relative to the others", which is the
 * quantity a published leaderboard is actually claiming.
 */
export type BootstrapStat = {
  lo: number;
  hi: number;
  se: number;
  /** Rank among players meeting the games minimum. 1 = best. */
  rankMedian: number;
  rankLo: number;
  rankHi: number;
  pTop10: number;
};

type Row = { a: number[]; b: number[]; y: number; w: number };

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export class BatchBtModel implements RatingModel {
  readonly name: string;

  private readonly index = new Map<string, number>();
  private readonly callsigns = new Map<string, string>();
  private readonly state = new Map<string, PlayerRating>();
  private readonly rows: Row[] = [];
  private theta: Float64Array = new Float64Array(0);
  private lastFitSortKey = -Infinity;
  private dirty = false;

  constructor(
    private readonly opts: BatchBtOptions,
    private readonly weightOf: (g: GameRecord) => number,
    private readonly softLabel: SoftLabelFn | null = null,
    label?: string,
  ) {
    this.name = label ?? `M4 batch Bradley-Terry (L2=${opts.l2})`;
    this.index.set(GUEST_KEY, 0);
  }

  private idxOf(playerId: string | null): number {
    const key = playerId ?? GUEST_KEY;
    let i = this.index.get(key);
    if (i === undefined) {
      i = this.index.size;
      this.index.set(key, i);
    }
    return i;
  }

  predict(game: GameRecord): number {
    let sum = 0;
    for (const [side, s] of game.sides.entries()) {
      for (const p of s.players) {
        const i = this.index.get(p.playerId ?? GUEST_KEY);
        const theta = i !== undefined && i < this.theta.length ? this.theta[i] : 0;
        sum += side === 0 ? theta : -theta;
      }
    }
    return logistic(sum);
  }

  update(game: GameRecord): void {
    const a: number[] = [];
    const b: number[] = [];
    for (const [side, s] of game.sides.entries()) {
      const target = side === 0 ? a : b;
      for (const p of s.players) {
        target.push(this.idxOf(p.playerId));
        if (p.playerId !== null) this.callsigns.set(p.playerId, p.callsign);
        this.trackAppearance(p.playerId, p.callsign, p.position, s.result);
      }
    }

    const result = game.sides[0].result;
    const hard = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
    const soft = this.softLabel?.(game, hard) ?? null;
    this.rows.push({
      a,
      b,
      y: soft === null ? hard : Math.min(Math.max(soft, 0), 1),
      w: this.weightOf(game),
    });
    this.dirty = true;

    const elapsedDays = (game.sortKey - this.lastFitSortKey) / 86_400_000;
    if (elapsedDays >= this.opts.refitEveryDays) {
      this.fit();
      this.lastFitSortKey = game.sortKey;
    }
  }

  private trackAppearance(
    playerId: string | null,
    callsign: string,
    position: number,
    result: GameRecord["sides"][number]["result"],
  ): void {
    if (playerId === null) return;
    let r = this.state.get(playerId);
    if (!r) {
      r = {
        playerId,
        callsign,
        mu: 0,
        sigma: null,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        positionCounts: new Map(),
      };
      this.state.set(playerId, r);
    }
    r.callsign = callsign;
    r.games++;
    if (result === "win") r.wins++;
    else if (result === "loss") r.losses++;
    else r.draws++;
    r.positionCounts.set(position, (r.positionCounts.get(position) ?? 0) + 1);
  }

  /** Full-batch Adam. Warm-starts from the previous θ, so refits converge fast. */
  fit(): void {
    const n = this.index.size;
    if (n === 0 || this.rows.length === 0) return;
    this.theta = this.fitRows(this.rows, this.theta, this.opts.iterations);
    this.dirty = false;
  }

  /**
   * Solves for θ on an arbitrary row multiset.
   *
   * The objective is logistic loss plus an L2 penalty, which is strictly convex,
   * so there is a single optimum and the warm start only affects how fast it is
   * reached — not where it lands. That is what makes it safe to warm-start each
   * bootstrap replicate from the full-data solution without biasing the spread.
   */
  private fitRows(rows: Row[], warmStart: Float64Array, iterations: number): Float64Array {
    const n = this.index.size;
    const theta = new Float64Array(n);
    theta.set(warmStart.subarray(0, Math.min(warmStart.length, n)));

    const grad = new Float64Array(n);
    const m = new Float64Array(n);
    const v = new Float64Array(n);
    const beta1 = 0.9;
    const beta2 = 0.999;
    const eps = 1e-8;
    const { l2, learningRate } = this.opts;

    for (let t = 1; t <= iterations; t++) {
      grad.fill(0);

      for (const row of rows) {
        let s = 0;
        for (const i of row.a) s += theta[i];
        for (const i of row.b) s -= theta[i];
        const g = row.w * (logistic(s) - row.y);
        for (const i of row.a) grad[i] += g;
        for (const i of row.b) grad[i] -= g;
      }
      for (let i = 0; i < n; i++) grad[i] += l2 * theta[i];

      const bc1 = 1 - beta1 ** t;
      const bc2 = 1 - beta2 ** t;
      for (let i = 0; i < n; i++) {
        const gi = grad[i];
        m[i] = beta1 * m[i] + (1 - beta1) * gi;
        v[i] = beta2 * v[i] + (1 - beta2) * gi * gi;
        theta[i] -= (learningRate * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + eps);
      }
    }

    return theta;
  }

  /**
   * Nonparametric bootstrap over GAMES: resample the game list with replacement,
   * refit, and read the spread of each player's rating across replicates.
   *
   * The unit of resampling is the game because that is the unit that was
   * sampled from the world — resampling scorecards instead would break up the
   * team structure the model is built on.
   *
   * Returns a percentile interval per player, plus the bootstrap standard error.
   */
  bootstrapIntervals(
    samples: number,
    seed: number,
    minGames: number,
    iterations = 250,
  ): Map<string, BootstrapStat> {
    if (this.dirty) this.fit();
    const base = this.theta;
    const n = this.index.size;
    const draws: Float64Array[] = [];

    let a = seed >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let b = 0; b < samples; b++) {
      const resampled: Row[] = Array.from(
        { length: this.rows.length },
        () => this.rows[Math.floor(rand() * this.rows.length)],
      );
      draws.push(this.fitRows(resampled, base, iterations));
    }

    // Qualified players only: a rank is meaningless against people who would
    // never appear on the board.
    const qualified: { key: string; idx: number }[] = [];
    for (const [key, idx] of this.index) {
      if (key === GUEST_KEY || idx >= n) continue;
      if ((this.state.get(key)?.games ?? 0) < minGames) continue;
      qualified.push({ key, idx });
    }

    // Re-rank within every replicate, so the recorded rank reflects that
    // replicate's own ordering rather than the full-data one.
    const ranksByKey = new Map<string, number[]>(qualified.map((q) => [q.key, []]));
    for (let b = 0; b < samples; b++) {
      const theta = draws[b];
      const order = [...qualified].sort((x, y) => theta[y.idx] - theta[x.idx]);
      order.forEach((q, i) => ranksByKey.get(q.key)!.push(i + 1));
    }

    const out = new Map<string, BootstrapStat>();
    const buffer = new Float64Array(samples);
    for (const [key, idx] of this.index) {
      if (key === GUEST_KEY || idx >= n) continue;
      for (let b = 0; b < samples; b++) buffer[b] = draws[b][idx];
      const sorted = Float64Array.from(buffer).sort();
      const mean = sorted.reduce((x, y) => x + y, 0) / samples;
      const variance = sorted.reduce((x, y) => x + (y - mean) ** 2, 0) / samples;

      const ranks = ranksByKey.get(key);
      const sortedRanks = ranks ? [...ranks].sort((x, y) => x - y) : null;

      out.set(key, {
        lo: sorted[Math.floor(0.025 * (samples - 1))],
        hi: sorted[Math.ceil(0.975 * (samples - 1))],
        se: Math.sqrt(variance),
        rankMedian: sortedRanks ? sortedRanks[Math.floor(0.5 * (sortedRanks.length - 1))] : NaN,
        rankLo: sortedRanks ? sortedRanks[Math.floor(0.025 * (sortedRanks.length - 1))] : NaN,
        rankHi: sortedRanks ? sortedRanks[Math.ceil(0.975 * (sortedRanks.length - 1))] : NaN,
        pTop10: sortedRanks ? sortedRanks.filter((r) => r <= 10).length / sortedRanks.length : NaN,
      });
    }
    return out;
  }

  ratings(): Map<string, PlayerRating> {
    if (this.dirty) this.fit();
    for (const [playerId, r] of this.state) {
      const i = this.index.get(playerId);
      r.mu = i !== undefined && i < this.theta.length ? this.theta[i] : 0;
    }
    return this.state;
  }
}
