// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Shared shapes for the rating bake-off. Deliberately plain data: every model,
 * the evaluator and the synthetic generator all speak `GameRecord[]`, so a
 * generated game and a real one are indistinguishable downstream.
 */

export type TeamResult = "win" | "loss" | "draw";

/**
 * One scorecard, reduced to what a rating model can use.
 *
 * `playerId` is null for guests — players with only a hardware `@NNN` id and no
 * `player` row. They cannot be rated across games, but they still occupy a team
 * slot and still have `mvpPoints`, so they must stay in the roster or team
 * strength is systematically underestimated.
 */
export type RatedPlayer = {
  playerId: string | null;
  callsign: string;
  /** 1 = Commander, 2 = Heavy, 3 = Scout, 4 = Ammo, 5 = Medic. */
  position: number;
  mvpPoints: number;
};

export type GameSide = {
  gameTeamId: string;
  /** Ordering key. Sides are always sorted ascending so "side A" never depends on the result. */
  tdfTeamIndex: number;
  result: TeamResult;
  /**
   * Raw team score, excluding `elimination_bonus` and `penalty_score`. Used only
   * as a margin-of-victory signal — the 10000-point elimination bonus would make
   * the distribution bimodal and swamp the continuous part.
   */
  score: number | null;
  players: RatedPlayer[];
};

export type GameRecord = {
  gameId: string;
  centerId: string;
  centerName: string;
  /** As stored: center-local wall time, no timezone applied. */
  startTime: Date;
  /** Epoch ms after applying `center.timezone`. The true global ordering key. */
  sortKey: number;
  competitionId: string | null;
  competitionType: "competitive" | "social" | null;
  competitionCategory: "internationals" | "tournament" | "league" | null;
  roundType: "pool" | "finals" | "split-pool" | "wildcard" | null;
  roundMultiplier: number | null;
  /** Exactly two non-neutral sides, sorted by tdfTeamIndex. */
  sides: [GameSide, GameSide];
};

/** A player's rating state. `sigma` is null for models that do not track uncertainty. */
export type PlayerRating = {
  playerId: string;
  callsign: string;
  mu: number;
  sigma: number | null;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Modal position across all rated games — used for the position-bias diagnostic. */
  positionCounts: Map<number, number>;
};

export interface RatingModel {
  readonly name: string;
  /** P(sides[0] wins). Must not consult the result. */
  predict(game: GameRecord): number;
  /** Applies the game's outcome. Always called after `predict` in the prequential loop. */
  update(game: GameRecord): void;
  /** Final state, keyed by playerId. Guests are never included. */
  ratings(): Map<string, PlayerRating>;
}
