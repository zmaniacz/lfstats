// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Prequential ("predict-then-update") evaluation.
 *
 * Games are walked in chronological order. Every game after the training cutoff
 * is predicted using the ratings as they stand *just before* that game, scored,
 * and only then used to update. That is both leak-free and the honest simulation
 * of how the rating would behave in production, and it scores every test game
 * rather than a single held-out slice.
 *
 * The cross-center metrics come from the same pass: predictions are always made
 * on every game, but a second set of accumulators only counts games where
 * visitors are present. That answers the question that decides whether a global
 * rating is meaningful at all — can ratings learned inside center pools predict
 * matchups between them? — without a separate training run.
 */

import { awayFraction, homeCenterByPlayer } from "./load";
import type { GameRecord, PlayerRating, RatingModel } from "./types";

/** A game counts as cross-center once this share of its players are visitors. */
export const CROSS_CENTER_THRESHOLD = 0.3;

const CALIBRATION_BUCKETS = 10;

export type Metrics = {
  n: number;
  logLoss: number;
  brier: number;
  /** Excludes draws — there is no correct call on a draw. */
  accuracy: number;
  decided: number;
  /** Mean |predicted − observed| over occupied calibration buckets. */
  calibrationError: number;
  buckets: { lo: number; hi: number; n: number; meanPredicted: number; observedRate: number }[];
};

export type ModelEvaluation = {
  name: string;
  overall: Metrics;
  crossCenter: Metrics;
  /** Mean final rating by modal position — a check that position normalisation worked. */
  ratingByPosition: Map<number, { n: number; meanRating: number }>;
  /** Mean sigma bucketed by games played. Empty for models that do not track it. */
  sigmaByGames: { games: number; meanSigma: number; n: number }[];
};

class Accumulator {
  n = 0;
  private logLossSum = 0;
  private brierSum = 0;
  private correct = 0;
  private decided = 0;
  private readonly bucketN = Array.from({ length: CALIBRATION_BUCKETS }, () => 0);
  private readonly bucketP = Array.from({ length: CALIBRATION_BUCKETS }, () => 0);
  private readonly bucketY = Array.from({ length: CALIBRATION_BUCKETS }, () => 0);

  add(predicted: number, observed: number): void {
    // Clamp away from 0/1 so a single confident miss cannot produce infinite loss.
    const p = Math.min(Math.max(predicted, 1e-9), 1 - 1e-9);
    this.n++;
    this.logLossSum -= observed * Math.log(p) + (1 - observed) * Math.log(1 - p);
    this.brierSum += (p - observed) ** 2;

    if (observed !== 0.5) {
      this.decided++;
      if ((p >= 0.5 && observed === 1) || (p < 0.5 && observed === 0)) this.correct++;
    }

    const b = Math.min(CALIBRATION_BUCKETS - 1, Math.floor(p * CALIBRATION_BUCKETS));
    this.bucketN[b]++;
    this.bucketP[b] += p;
    this.bucketY[b] += observed;
  }

  finish(): Metrics {
    const buckets = [];
    let calibrationErrorSum = 0;
    let occupied = 0;
    for (let b = 0; b < CALIBRATION_BUCKETS; b++) {
      const n = this.bucketN[b];
      if (n === 0) continue;
      const meanPredicted = this.bucketP[b] / n;
      const observedRate = this.bucketY[b] / n;
      buckets.push({
        lo: b / CALIBRATION_BUCKETS,
        hi: (b + 1) / CALIBRATION_BUCKETS,
        n,
        meanPredicted,
        observedRate,
      });
      calibrationErrorSum += Math.abs(meanPredicted - observedRate);
      occupied++;
    }

    return {
      n: this.n,
      logLoss: this.n === 0 ? NaN : this.logLossSum / this.n,
      brier: this.n === 0 ? NaN : this.brierSum / this.n,
      accuracy: this.decided === 0 ? NaN : this.correct / this.decided,
      decided: this.decided,
      calibrationError: occupied === 0 ? NaN : calibrationErrorSum / occupied,
      buckets,
    };
  }
}

export type EvaluateOptions = {
  /** Share of games used to warm up ratings before scoring begins. */
  trainFraction: number;
};

export const DEFAULT_EVALUATE: EvaluateOptions = { trainFraction: 0.6 };

export function evaluatePrequential(
  games: GameRecord[],
  models: RatingModel[],
  opts: EvaluateOptions,
): ModelEvaluation[] {
  const home = homeCenterByPlayer(games);
  const cutoff = Math.floor(games.length * opts.trainFraction);

  const overall = models.map(() => new Accumulator());
  const cross = models.map(() => new Accumulator());

  for (const [gi, game] of games.entries()) {
    const scoring = gi >= cutoff;
    const observed = game.sides[0].result === "win" ? 1 : game.sides[0].result === "draw" ? 0.5 : 0;
    const isCross = scoring && awayFraction(game, home) > CROSS_CENTER_THRESHOLD;

    for (const [mi, model] of models.entries()) {
      if (scoring) {
        const p = model.predict(game);
        overall[mi].add(p, observed);
        if (isCross) cross[mi].add(p, observed);
      }
      model.update(game);
    }
  }

  return models.map((model, mi) => ({
    name: model.name,
    overall: overall[mi].finish(),
    crossCenter: cross[mi].finish(),
    ratingByPosition: valueByModalPosition(model.ratings(), (r) => r.mu),
    sigmaByGames: sigmaByGames(model),
  }));
}

/**
 * Mean of some per-player value, grouped by that player's most-played position.
 *
 * Note this groups by MODAL position, which is a noisy label when players rotate
 * — the groups themselves can differ in genuine skill. A tilt here is therefore
 * only evidence of leaked position effects when compared against a baseline (in
 * the synthetic self-test, the same table computed over known true skill).
 */
export function valueByModalPosition(
  ratings: Map<string, PlayerRating>,
  valueOf: (r: PlayerRating) => number,
  minGames = 5,
): Map<number, { n: number; meanRating: number }> {
  const sums = new Map<number, { n: number; sum: number }>();
  for (const r of ratings.values()) {
    if (r.games < minGames) continue;
    let modal = 0;
    let best = -1;
    for (const [position, count] of r.positionCounts) {
      if (count > best) {
        best = count;
        modal = position;
      }
    }
    const acc = sums.get(modal) ?? { n: 0, sum: 0 };
    acc.n++;
    acc.sum += valueOf(r);
    sums.set(modal, acc);
  }
  return new Map(
    [...sums.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([position, acc]) => [position, { n: acc.n, meanRating: acc.sum / acc.n }]),
  );
}

/**
 * Mean sigma against games played, which is what should set the display
 * threshold: the point where the curve flattens is where a rating has converged.
 */
function sigmaByGames(model: RatingModel): { games: number; meanSigma: number; n: number }[] {
  const edges = [1, 2, 3, 5, 8, 12, 20, 30, 50, 100, 200];
  const acc = edges.map(() => ({ sum: 0, n: 0 }));

  for (const r of model.ratings().values()) {
    if (r.sigma === null) return [];
    let bucket = 0;
    for (let i = 0; i < edges.length; i++) {
      if (r.games >= edges[i]) bucket = i;
    }
    acc[bucket].sum += r.sigma;
    acc[bucket].n++;
  }

  return edges
    .map((games, i) => ({ games, meanSigma: acc[i].n ? acc[i].sum / acc[i].n : NaN, n: acc[i].n }))
    .filter((row) => row.n > 0);
}

// ---------------------------------------------------------------------------
// Connectivity
// ---------------------------------------------------------------------------

export type ConnectivityReport = {
  players: number;
  /** Distinct components in the "played against" graph. */
  components: number;
  largestComponent: number;
  /** Share of players reachable from the largest component. */
  largestComponentShare: number;
  opponentPairs: number;
  crossCenterPairs: number;
  crossCenterShare: number;
  perCenter: { centerId: string; centerName: string; players: number; games: number }[];
};

/**
 * Union-find over the "played against" graph.
 *
 * Ratings are only comparable between players joined by some chain of games. If
 * the graph fragments, a single global number is comparing quantities that were
 * never measured against each other — and the fragments will still each look
 * internally sensible, which is what makes this failure mode easy to miss.
 */
export function analyseConnectivity(games: GameRecord[]): ConnectivityReport {
  const home = homeCenterByPlayer(games);
  const parent = new Map<string, string>();

  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) ?? root;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  const ensure = (x: string): void => {
    if (!parent.has(x)) parent.set(x, x);
  };

  const pairs = new Set<string>();
  let crossCenterPairs = 0;
  const centerPlayers = new Map<string, Set<string>>();
  const centerGames = new Map<string, number>();
  const centerNames = new Map<string, string>();

  for (const g of games) {
    centerNames.set(g.centerId, g.centerName);
    centerGames.set(g.centerId, (centerGames.get(g.centerId) ?? 0) + 1);
    const seen = centerPlayers.get(g.centerId) ?? new Set<string>();

    const a = g.sides[0].players.filter((p) => p.playerId !== null);
    const b = g.sides[1].players.filter((p) => p.playerId !== null);
    for (const p of [...a, ...b]) {
      ensure(p.playerId!);
      seen.add(p.playerId!);
    }
    centerPlayers.set(g.centerId, seen);

    for (const pa of a) {
      for (const pb of b) {
        union(pa.playerId!, pb.playerId!);
        const key =
          pa.playerId! < pb.playerId!
            ? `${pa.playerId}|${pb.playerId}`
            : `${pb.playerId}|${pa.playerId}`;
        if (!pairs.has(key)) {
          pairs.add(key);
          if (home.get(pa.playerId!) !== home.get(pb.playerId!)) crossCenterPairs++;
        }
      }
    }
  }

  const sizes = new Map<string, number>();
  for (const p of parent.keys()) {
    const root = find(p);
    sizes.set(root, (sizes.get(root) ?? 0) + 1);
  }
  const largest = sizes.size === 0 ? 0 : Math.max(...sizes.values());
  const players = parent.size;

  return {
    players,
    components: sizes.size,
    largestComponent: largest,
    largestComponentShare: players === 0 ? 0 : largest / players,
    opponentPairs: pairs.size,
    crossCenterPairs,
    crossCenterShare: pairs.size === 0 ? 0 : crossCenterPairs / pairs.size,
    perCenter: [...centerGames.entries()]
      .map(([centerId, gameCount]) => ({
        centerId,
        centerName: centerNames.get(centerId) ?? centerId,
        players: centerPlayers.get(centerId)?.size ?? 0,
        games: gameCount,
      }))
      .sort((x, y) => y.games - x.games),
  };
}

// ---------------------------------------------------------------------------
// Teammate luck
// ---------------------------------------------------------------------------

export type TeammateLuck = {
  model: string;
  /**
   * Correlation between how strong a player's teammates were and how far the
   * model's rating of that player departs from their true skill.
   *
   * 0 means teammate quality does not leak into the rating: carrying a weak team
   * costs you nothing in the long run. Positive means players with strong
   * teammates get over-rated and players stuck on weak ones get under-rated,
   * which is exactly the unfairness worth worrying about.
   *
   * Only meaningful on synthetic data, where team assignment is random. On real
   * data strong players genuinely cluster together, so the same correlation
   * would confound real skill with luck and could not be read this way.
   */
  correlation: number;
  n: number;
};

export function teammateLuckBias(
  games: GameRecord[],
  model: RatingModel,
  trueSkill: Map<string, number>,
  minGames: number,
): TeammateLuck {
  const mateSum = new Map<string, { sum: number; n: number }>();

  for (const g of games) {
    for (const side of g.sides) {
      const ids = side.players.map((p) => p.playerId).filter((id): id is string => id !== null);
      const total = ids.reduce((s, id) => s + (trueSkill.get(id) ?? 0), 0);
      for (const id of ids) {
        // Mean of this player's TEAMMATES, so a player's own skill is excluded.
        if (ids.length < 2) continue;
        const mates = (total - (trueSkill.get(id) ?? 0)) / (ids.length - 1);
        const acc = mateSum.get(id) ?? { sum: 0, n: 0 };
        acc.sum += mates;
        acc.n++;
        mateSum.set(id, acc);
      }
    }
  }

  const avgMate: number[] = [];
  const rating: number[] = [];
  const truth: number[] = [];
  for (const [id, acc] of mateSum) {
    const r = model.ratings().get(id);
    if (!r || r.games < minGames || acc.n === 0) continue;
    avgMate.push(acc.sum / acc.n);
    rating.push(r.sigma === null ? r.mu : r.mu - 3 * r.sigma);
    truth.push(trueSkill.get(id) ?? 0);
  }

  if (avgMate.length < 3) return { model: model.name, correlation: NaN, n: avgMate.length };

  // Standardise both scales so the error is comparable across models whose
  // ratings live on completely different ranges (Elo's 1500 vs Weng-Lin's 25).
  const z = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    return xs.map((x) => (x - m) / sd);
  };
  const zr = z(rating);
  const zt = z(truth);
  const error = zr.map((v, i) => v - zt[i]);

  return { model: model.name, correlation: pearson(avgMate, error), n: avgMate.length };
}

function pearson(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / a.length;
  const mb = b.reduce((x, y) => x + y, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db);
}

/** Spearman rank correlation. Used by the synthetic self-test. */
export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) return NaN;
  const rank = (xs: number[]): number[] => {
    const order = xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v);
    const ranks = Array.from<number>({ length: xs.length });
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
      // Average rank across ties, so ties do not bias the correlation.
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[order[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };

  const ra = rank(a);
  const rb = rank(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < ra.length; i++) {
    const x = ra[i] - ma;
    const y = rb[i] - mb;
    num += x * y;
    da += x * x;
    dbb += y * y;
  }
  return da === 0 || dbb === 0 ? NaN : num / Math.sqrt(da * dbb);
}
