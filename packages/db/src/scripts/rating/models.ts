// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * The online rating candidates. Each implements `RatingModel`, so the evaluator
 * can drive them all through one prequential pass.
 *
 * Guests (`playerId === null`) are handled uniformly: they contribute the prior
 * mean to their team's strength — pretending a 5-player side had 4 players would
 * systematically understate it — but no state is written back for them, since
 * there is nothing to carry to another game.
 */

import { teamMvpContrasts, type PositionStats } from "./normalize";
import type { GameRecord, GameSide, PlayerRating, RatedPlayer, RatingModel } from "./types";

function scoreOf(result: GameSide["result"]): number {
  return result === "win" ? 1 : result === "draw" ? 0.5 : 0;
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** A player's slot in one game: persistent state when known, prior values when a guest. */
type Slot = {
  player: RatedPlayer;
  rating: PlayerRating | null;
  mu: number;
  sigmaSq: number;
};

abstract class BaseModel implements RatingModel {
  abstract readonly name: string;
  protected readonly state = new Map<string, PlayerRating>();

  protected constructor(
    protected readonly priorMu: number,
    protected readonly priorSigma: number | null,
  ) {}

  abstract predict(game: GameRecord): number;
  abstract update(game: GameRecord): void;

  ratings(): Map<string, PlayerRating> {
    return this.state;
  }

  protected ensure(p: RatedPlayer): PlayerRating | null {
    if (p.playerId === null) return null;
    let r = this.state.get(p.playerId);
    if (!r) {
      r = {
        playerId: p.playerId,
        callsign: p.callsign,
        mu: this.priorMu,
        sigma: this.priorSigma,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        positionCounts: new Map(),
      };
      this.state.set(p.playerId, r);
    }
    // Callsigns change over time; the latest one seen is the useful label.
    r.callsign = p.callsign;
    return r;
  }

  protected slots(side: GameSide): Slot[] {
    return side.players.map((p) => {
      const rating = this.ensure(p);
      return {
        player: p,
        rating,
        mu: rating ? rating.mu : this.priorMu,
        sigmaSq: rating?.sigma != null ? rating.sigma ** 2 : (this.priorSigma ?? 0) ** 2,
      };
    });
  }

  protected recordAppearances(game: GameRecord): void {
    for (const side of game.sides) {
      for (const p of side.players) {
        const r = this.ensure(p);
        if (!r) continue;
        r.games++;
        if (side.result === "win") r.wins++;
        else if (side.result === "loss") r.losses++;
        else r.draws++;
        r.positionCounts.set(p.position, (r.positionCounts.get(p.position) ?? 0) + 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// M0 — baselines
// ---------------------------------------------------------------------------

/** Predicts 0.5 always. Log-loss 0.6931; the bar every real model must clear. */
export class CoinFlipModel extends BaseModel {
  readonly name = "M0a coin-flip";
  constructor() {
    super(0, null);
  }
  predict(): number {
    return 0.5;
  }
  update(game: GameRecord): void {
    this.recordAppearances(game);
  }
}

/**
 * Team mean of each player's Laplace-smoothed career win rate, combined
 * Bradley-Terry style. Parameter-free, and it captures "good players win a lot"
 * without any notion of who they played.
 */
export class WinRateModel extends BaseModel {
  readonly name = "M0b career win-rate";
  constructor() {
    super(0.5, null);
  }

  private teamRate(side: GameSide): number {
    let sum = 0;
    for (const p of side.players) {
      const r = p.playerId === null ? null : this.state.get(p.playerId);
      // +1/+2 Laplace prior: an unseen player is a 50% player.
      sum += r ? (r.wins + 0.5 * r.draws + 1) / (r.games + 2) : 0.5;
    }
    return side.players.length === 0 ? 0.5 : sum / side.players.length;
  }

  predict(game: GameRecord): number {
    const a = this.teamRate(game.sides[0]);
    const b = this.teamRate(game.sides[1]);
    return a + b === 0 ? 0.5 : a / (a + b);
  }

  update(game: GameRecord): void {
    this.recordAppearances(game);
    for (const side of game.sides) {
      for (const p of side.players) {
        if (p.playerId === null) continue;
        const r = this.state.get(p.playerId);
        if (r) r.mu = (r.wins + 0.5 * r.draws + 1) / (r.games + 2);
      }
    }
  }
}

/**
 * Team mean of each player's running average position-normalised MVP.
 *
 * This is the "is MVP alone enough?" control. Its scale is fixed at 1.0 rather
 * than fitted, so treat its log-loss as a floor for what MVP can do, not a
 * tuned result.
 */
export class MvpMeanModel extends BaseModel {
  readonly name = "M0c mean MVP z";
  private readonly totals = new Map<string, { sum: number; n: number }>();

  constructor(private readonly positionStats: Map<number, PositionStats>) {
    super(0, null);
  }

  private teamZ(side: GameSide): number {
    let sum = 0;
    for (const p of side.players) {
      const t = p.playerId === null ? undefined : this.totals.get(p.playerId);
      sum += t && t.n > 0 ? t.sum / t.n : 0;
    }
    return side.players.length === 0 ? 0 : sum / side.players.length;
  }

  predict(game: GameRecord): number {
    return logistic(this.teamZ(game.sides[0]) - this.teamZ(game.sides[1]));
  }

  update(game: GameRecord): void {
    this.recordAppearances(game);
    for (const side of game.sides) {
      // Absolute z here, not the within-team contrast: this model is measuring
      // raw individual output, which is the thing being tested.
      const zs = side.players.map((p) => {
        const s = this.positionStats.get(p.position);
        return s ? (p.mvpPoints - s.mean) / s.sd : 0;
      });
      side.players.forEach((p, i) => {
        if (p.playerId === null) return;
        const t = this.totals.get(p.playerId) ?? { sum: 0, n: 0 };
        t.sum += zs[i]!;
        t.n++;
        this.totals.set(p.playerId, t);
        const r = this.state.get(p.playerId);
        if (r) r.mu = t.sum / t.n;
      });
    }
  }
}

// ---------------------------------------------------------------------------
// M1 — team Elo
// ---------------------------------------------------------------------------

export type EloOptions = { k: number; scale: number; initial: number };
export const DEFAULT_ELO: EloOptions = { k: 24, scale: 400, initial: 1500 };

/**
 * Classic Elo with the team rating taken as the mean of its members, and the
 * whole team sharing one update. Note this is only strictly zero-sum when the
 * two sides are the same size; with uneven sides total rating drifts slightly.
 */
export class EloModel extends BaseModel {
  readonly name: string;

  constructor(
    private readonly opts: EloOptions,
    private readonly weightOf: (g: GameRecord) => number,
  ) {
    super(opts.initial, null);
    this.name = `M1 Elo (K=${opts.k})`;
  }

  private teamRating(side: GameSide): number {
    if (side.players.length === 0) return this.opts.initial;
    let sum = 0;
    for (const p of side.players) {
      const r = p.playerId === null ? null : this.state.get(p.playerId);
      sum += r ? r.mu : this.opts.initial;
    }
    return sum / side.players.length;
  }

  predict(game: GameRecord): number {
    const a = this.teamRating(game.sides[0]);
    const b = this.teamRating(game.sides[1]);
    return 1 / (1 + 10 ** ((b - a) / this.opts.scale));
  }

  update(game: GameRecord): void {
    const expectedA = this.predict(game);
    this.recordAppearances(game);

    const w = this.weightOf(game);
    const deltaA = this.opts.k * w * (scoreOf(game.sides[0].result) - expectedA);

    for (const [i, side] of game.sides.entries()) {
      const delta = i === 0 ? deltaA : -deltaA;
      for (const p of side.players) {
        if (p.playerId === null) continue;
        const r = this.state.get(p.playerId);
        if (r) r.mu += delta;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// M2 / M3 — Weng-Lin, plain and MVP-weighted
// ---------------------------------------------------------------------------

export type WengLinOptions = {
  mu: number;
  sigma: number;
  /** Skill-class width: how much performance varies around true skill. */
  beta: number;
  /** Additive per-game variance, so a player's rating can drift as they improve. */
  tau: number;
  /** Floor on the variance multiplier, preventing sigma collapsing to zero. */
  kappa: number;
  /**
   * How strongly within-team MVP influences the update. 0 collapses this model
   * exactly to plain Weng-Lin under either mode.
   */
  lambda: number;
  /**
   * How MVP enters the update:
   *
   * - `delta` adds a zero-sum correction on top of each player's share of the
   *   team's rating movement. Conserves total team movement, but the correction
   *   is UNBOUNDED and has no restoring force, so it accumulates as a random
   *   walk over a long career.
   * - `score` instead gives each player a personal effective outcome, blending
   *   the team result toward their within-team MVP contrast and clamping to
   *   [0,1]. Bounded by construction, and it stays inside the Bayesian update
   *   rather than being bolted on after it.
   */
  mvpMode: "delta" | "score";
};

export const DEFAULT_WENG_LIN: WengLinOptions = {
  mu: 25,
  sigma: 25 / 3,
  beta: 25 / 6,
  tau: 25 / 300,
  kappa: 0.0001,
  lambda: 0,
  mvpMode: "delta",
};

/**
 * Weng & Lin (2011), "A Bayesian Approximation Method for Online Ranking" —
 * the Bradley-Terry full-pairing update, which is what OpenSkill implements.
 * Closed-form, so no factor graph and no message passing.
 *
 * Team skill is the SUM of member skills (not the mean), with team variance the
 * sum of member variances; each player then absorbs a share of the team's update
 * proportional to their own variance, so uncertain players move furthest. That
 * is the property Elo lacks and the reason this converges in far fewer games.
 *
 * With `lambda > 0` the per-player shares are additionally redistributed by
 * within-team MVP contrast:
 *
 *     delta_i* = delta_i + lambda * (|delta_T| / n) * (z_i - z̄_T)
 *
 * The correction sums to zero over the team, so the side's total movement is
 * unchanged and the system cannot inflate. Using |delta_T| rather than delta_T
 * is what makes it correct in both directions: a strong performer gains more on
 * a win AND loses less on a loss.
 */
export class WengLinModel extends BaseModel {
  readonly name: string;

  constructor(
    private readonly opts: WengLinOptions,
    private readonly weightOf: (g: GameRecord) => number,
    private readonly positionStats: Map<number, PositionStats>,
    label?: string,
  ) {
    super(opts.mu, opts.sigma);
    this.name = label ?? (opts.lambda === 0 ? "M2 Weng-Lin" : `M3 Weng-Lin+MVP (λ=${opts.lambda})`);
  }

  private aggregate(slots: Slot[]): { mu: number; sigmaSq: number } {
    let mu = 0;
    let sigmaSq = 0;
    for (const s of slots) {
      mu += s.mu;
      sigmaSq += s.sigmaSq;
    }
    return { mu, sigmaSq };
  }

  private probability(a: { mu: number; sigmaSq: number }, b: { mu: number; sigmaSq: number }) {
    const c = Math.sqrt(a.sigmaSq + b.sigmaSq + 2 * this.opts.beta ** 2);
    return { c, pA: logistic((a.mu - b.mu) / c) };
  }

  predict(game: GameRecord): number {
    const a = this.aggregate(this.peek(game.sides[0]));
    const b = this.aggregate(this.peek(game.sides[1]));
    return this.probability(a, b).pA;
  }

  /** Like `slots`, but never creates state — `predict` must stay side-effect free. */
  private peek(side: GameSide): Slot[] {
    return side.players.map((p) => {
      const rating = p.playerId === null ? null : (this.state.get(p.playerId) ?? null);
      return {
        player: p,
        rating,
        mu: rating ? rating.mu : this.opts.mu,
        sigmaSq: rating?.sigma != null ? rating.sigma ** 2 : this.opts.sigma ** 2,
      };
    });
  }

  update(game: GameRecord): void {
    const sideSlots = game.sides.map((s) => this.slots(s));

    // Dynamics: nudge variance up before observing, so ratings stay responsive.
    for (const slots of sideSlots) {
      for (const s of slots) {
        if (s.rating) s.sigmaSq += this.opts.tau ** 2;
      }
    }

    const teams = sideSlots.map((slots) => this.aggregate(slots));
    const { c, pA } = this.probability(teams[0]!, teams[1]!);
    const probs = [pA, 1 - pA];

    const w = this.weightOf(game);
    this.recordAppearances(game);

    for (const [i, slots] of sideSlots.entries()) {
      const team = teams[i]!;
      if (team.sigmaSq <= 0) continue;

      const s = scoreOf(game.sides[i]!.result);
      const p = probs[i]!;
      const omega = w * (team.sigmaSq / c) * (s - p);
      const gamma = Math.sqrt(team.sigmaSq) / c;
      const eta = w * gamma * (team.sigmaSq / (c * c)) * probs[0]! * probs[1]!;

      // Each player's share of the team update, proportional to their variance.
      const shares = slots.map((slot) => slot.sigmaSq / team.sigmaSq);
      const deltas = shares.map((share) => share * omega);

      const useMvp = this.opts.lambda !== 0 && slots.length > 0;
      const contrasts = useMvp
        ? teamMvpContrasts(this.positionStats, game.sides[i]!.players)
        : null;

      if (contrasts && this.opts.mvpMode === "delta") {
        const magnitude = Math.abs(omega) / slots.length;
        for (let j = 0; j < deltas.length; j++) {
          deltas[j] += this.opts.lambda * magnitude * (contrasts[j] ?? 0);
        }
      } else if (contrasts) {
        // Personal effective outcome. Note share_j * omega reduces exactly to
        // w * (sigmaSq_j / c) * (s - p), so swapping in a per-player s_j is a
        // clean generalisation of the same update rather than an addition to it.
        for (let j = 0; j < deltas.length; j++) {
          const personal = Math.min(Math.max(s + this.opts.lambda * (contrasts[j] ?? 0), 0), 1);
          deltas[j] = w * (slots[j]!.sigmaSq / c) * (personal - p);
        }
      }

      slots.forEach((slot, j) => {
        if (!slot.rating) return;
        slot.rating.mu += deltas[j]!;
        const scale = Math.max(1 - shares[j]! * eta, this.opts.kappa);
        slot.rating.sigma = Math.sqrt(slot.sigmaSq * scale);
      });
    }
  }
}
