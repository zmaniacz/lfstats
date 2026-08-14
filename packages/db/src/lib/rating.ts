// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * The global player rating: regularised Bradley-Terry, fitted in batch.
 *
 *     P(A beats B) = sigmoid( sum_{i in A} theta_i - sum_{j in B} theta_j )
 *
 * minimising weighted log-loss plus an L2 penalty pulling theta toward 0.
 *
 * Chosen by the offline bake-off in `scripts/rating/` over 34 candidates
 * including Elo, Weng-Lin/TrueSkill-style online updates, and several MVP-
 * weighted variants. Two results drove the choice:
 *
 *   1. Best out-of-sample win prediction (log-loss 0.632 vs 0.642 for Elo and
 *      0.647 for plain Weng-Lin; a coin flip is 0.693).
 *   2. Materially lower teammate-luck bias — 0.087 against 0.211 for Weng-Lin
 *      and 0.349 for Elo. Because every player is solved for simultaneously,
 *      the fit separates a player's contribution from their teammates' without
 *      needing any per-player performance stat to do it.
 *
 * MVP is deliberately NOT an input. Splitting credit within a team by MVP made
 * predictions worse at every setting tested, and destabilised the rating badly
 * at higher weights. Margin of victory (from team score) does help, and enters
 * as a per-game sample weight.
 *
 * Pure functions over plain data — no database access, so it can be unit-tested
 * and reused by any caller.
 */

export type RatingGameSide = {
  /** Null entries are guests; they hold a team slot but carry no identity. */
  playerIds: (string | null)[];
  score: number | null;
  result: "win" | "loss" | "draw";
};

export type RatingGame = {
  gameId: string;
  /** Epoch ms, timezone-corrected. Only used to apply the rolling window. */
  sortKey: number;
  isSocial: boolean;
  /** competition_round.multiplier where the game sits in a round, else null. */
  roundMultiplier: number | null;
  sides: [RatingGameSide, RatingGameSide];
};

export type RatingParameters = {
  l2: number;
  iterations: number;
  learningRate: number;
  marginGamma: number;
  socialWeight: number;
  minGames: number;
  /** How many of the leading rows the board draws band rules across. */
  groupedHead: number;
  /** Width of a display band, in rating points. */
  bandWidth: number;
  bootstrapSamples: number;
};

export const DEFAULT_RATING_PARAMETERS: RatingParameters = {
  l2: 1.0,
  iterations: 400,
  learningRate: 0.05,
  marginGamma: 0.25,
  socialWeight: 0.25,
  minGames: 50,
  groupedHead: 25,
  bandWidth: 0.25,
  bootstrapSamples: 200,
};

export type PlayerRatingResult = {
  playerId: string;
  rating: number;
  standardError: number | null;
  rank: number;
  ratingGroup: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
};

/** Guests share one pooled parameter: an "average guest" strength. */
const GUEST_KEY = "__guest__";

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

type Row = { a: number[]; b: number[]; y: number; w: number };

function scoreMargin(g: RatingGame): number | null {
  const a = g.sides[0].score;
  const b = g.sides[1].score;
  return a === null || b === null ? null : a - b;
}

/**
 * Context weight: competition games count by their round multiplier, social and
 * nightly games count for less. Down-weighting social play measurably improved
 * calibration in testing — those games have casual rosters and noisier results.
 */
function contextWeight(g: RatingGame, params: RatingParameters): number {
  if (g.isSocial) return params.socialWeight;
  return g.roundMultiplier ?? 1;
}

/**
 * Margin-of-victory multiplier, normalised to average ~1 so that enabling it
 * does not rescale every update. `log1p` damps the tail: a blowout counts for
 * more than a nail-biter, but one freak scoreline must not dominate a career.
 */
function marginMultiplier(
  g: RatingGame,
  params: RatingParameters,
  sd: number,
  meanLog: number,
): number {
  if (params.marginGamma === 0) return 1;
  const m = scoreMargin(g);
  if (m === null) return 1;
  const shaped = Math.log1p(Math.abs(m) / sd) / meanLog;
  return Math.max(0.05, 1 + params.marginGamma * (shaped - 1));
}

export function computeRatings(
  games: RatingGame[],
  params: RatingParameters = DEFAULT_RATING_PARAMETERS,
): PlayerRatingResult[] {
  if (games.length === 0) return [];

  // -- margin scale, fitted on the same games we are about to fit -----------
  const margins: number[] = [];
  for (const g of games) {
    const m = scoreMargin(g);
    if (m !== null) margins.push(m);
  }
  const marginMean = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
  const marginSd =
    (margins.length
      ? Math.sqrt(margins.reduce((a, b) => a + (b - marginMean) ** 2, 0) / margins.length)
      : 1) || 1;
  const marginMeanLog =
    (margins.length
      ? margins.reduce((a, m) => a + Math.log1p(Math.abs(m) / marginSd), 0) / margins.length
      : 1) || 1;

  // -- build the design ----------------------------------------------------
  const index = new Map<string, number>([[GUEST_KEY, 0]]);
  const record = new Map<string, { games: number; wins: number; losses: number; draws: number }>();
  const rows: Row[] = [];

  const idxOf = (playerId: string | null): number => {
    const key = playerId ?? GUEST_KEY;
    let i = index.get(key);
    if (i === undefined) {
      i = index.size;
      index.set(key, i);
    }
    return i;
  };

  for (const g of games) {
    const a: number[] = [];
    const b: number[] = [];
    for (const [side, s] of g.sides.entries()) {
      const target = side === 0 ? a : b;
      for (const playerId of s.playerIds) {
        target.push(idxOf(playerId));
        if (playerId === null) continue;
        const r = record.get(playerId) ?? { games: 0, wins: 0, losses: 0, draws: 0 };
        r.games++;
        if (s.result === "win") r.wins++;
        else if (s.result === "loss") r.losses++;
        else r.draws++;
        record.set(playerId, r);
      }
    }

    const result = g.sides[0].result;
    rows.push({
      a,
      b,
      y: result === "win" ? 1 : result === "draw" ? 0.5 : 0,
      w: contextWeight(g, params) * marginMultiplier(g, params, marginSd, marginMeanLog),
    });
  }

  const theta = fitRows(rows, new Float64Array(index.size), index.size, params);

  // -- bootstrap -----------------------------------------------------------
  const draws =
    params.bootstrapSamples > 0 ? bootstrapDraws(rows, theta, index.size, params) : null;
  const standardError = draws ? standardErrorsFrom(draws, index.size) : null;

  // -- rank, then group ----------------------------------------------------
  const qualified: PlayerRatingResult[] = [];
  for (const [playerId, r] of record) {
    if (r.games < params.minGames) continue;
    const i = index.get(playerId);
    if (i === undefined) continue;
    qualified.push({
      playerId,
      rating: theta[i],
      standardError: standardError ? standardError[i] : null,
      rank: 0,
      ratingGroup: 0,
      gamesPlayed: r.games,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
    });
  }

  qualified.sort((x, y) => y.rating - x.rating || x.playerId.localeCompare(y.playerId));
  assignRanksAndBands(qualified, params);
  return qualified;
}

/**
 * Assigns 1-based ranks and a fixed-width display band.
 *
 * The band is `floor(rating / bandWidth)` — a plain slice of the rating scale,
 * NOT a claim that adjacent bands are statistically distinct.
 *
 * That distinction matters, because the obvious alternative does not work here.
 * Grouping only where the gap between two players exceeds the noise in their
 * ratings was tried first and collapses to a single boundary: across the top 25
 * the median gap between neighbours is about 0.02 while the median standard
 * error is about 0.13, so only the leader is separable and everyone else forms
 * one undifferentiated block. Bootstrapping the DIFFERENCE between adjacent
 * players rather than combining their individual errors — correct, since the two
 * estimates are positively correlated through the joint fit — does not change
 * that, as the gaps are roughly six times smaller than the noise either way.
 *
 * So the bands are presentational: they give the eye somewhere to rest and make
 * the rating scale legible. They must be labelled as rating ranges in the UI and
 * never described as tiers of demonstrated difference.
 */
function assignRanksAndBands(ranked: PlayerRatingResult[], params: RatingParameters): void {
  const width = params.bandWidth > 0 ? params.bandWidth : 0.25;
  for (const [i, entry] of ranked.entries()) {
    entry.rank = i + 1;
    // Assigned for every player, not just the banded head: the band is a fact
    // about the rating, and the board decides where it draws rules.
    entry.ratingGroup = Math.floor(entry.rating / width);
  }
}

/** Full-batch Adam. The objective is convex, so the optimum is unique. */
function fitRows(
  rows: Row[],
  warmStart: Float64Array,
  n: number,
  params: RatingParameters,
): Float64Array {
  const theta = new Float64Array(n);
  theta.set(warmStart.subarray(0, Math.min(warmStart.length, n)));

  const grad = new Float64Array(n);
  const m = new Float64Array(n);
  const v = new Float64Array(n);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  for (let t = 1; t <= params.iterations; t++) {
    grad.fill(0);

    for (const row of rows) {
      let s = 0;
      for (const i of row.a) s += theta[i];
      for (const i of row.b) s -= theta[i];
      const g = row.w * (logistic(s) - row.y);
      for (const i of row.a) grad[i] += g;
      for (const i of row.b) grad[i] -= g;
    }
    for (let i = 0; i < n; i++) grad[i] += params.l2 * theta[i];

    const bc1 = 1 - beta1 ** t;
    const bc2 = 1 - beta2 ** t;
    for (let i = 0; i < n; i++) {
      const gi = grad[i];
      m[i] = beta1 * m[i] + (1 - beta1) * gi;
      v[i] = beta2 * v[i] + (1 - beta2) * gi * gi;
      theta[i] -= (params.learningRate * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + eps);
    }
  }

  return theta;
}

/**
 * Nonparametric bootstrap over GAMES — the unit that was actually sampled from
 * the world. Resampling scorecards instead would tear apart the team structure
 * the model is built on.
 *
 * Warm-starting each replicate from the full-data solution is safe here because
 * the objective is strictly convex: the start affects only how fast the optimum
 * is reached, not where it lands, so the spread is not shrunk toward the centre.
 */
function bootstrapDraws(
  rows: Row[],
  base: Float64Array,
  n: number,
  params: RatingParameters,
): Float64Array[] {
  // Fewer iterations per replicate: warm-started from the full fit, each one is
  // already close, and this runs `bootstrapSamples` times.
  const replicateParams = { ...params, iterations: Math.max(100, params.iterations / 2) };
  const draws: Float64Array[] = [];

  let a = 0x9e3779b9;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let b = 0; b < params.bootstrapSamples; b++) {
    const resampled = Array.from(
      { length: rows.length },
      () => rows[Math.floor(rand() * rows.length)],
    );
    draws.push(fitRows(resampled, base, n, replicateParams));
  }

  return draws;
}

/** Per-player bootstrap standard error, for display and for the player page. */
function standardErrorsFrom(draws: Float64Array[], n: number): Float64Array {
  const se = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let sumSq = 0;
    for (const draw of draws) {
      sum += draw[i];
      sumSq += draw[i] * draw[i];
    }
    const mean = sum / draws.length;
    se[i] = Math.sqrt(Math.max(0, sumSq / draws.length - mean * mean));
  }
  return se;
}
