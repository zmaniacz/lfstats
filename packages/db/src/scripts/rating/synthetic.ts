// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Generates games from KNOWN player skills, so every model can be checked
 * against ground truth before any real-data number is trusted.
 *
 * Without this, a poor result on real data is uninterpretable: it could mean the
 * model is wrong for laser tag, or it could mean the implementation has a sign
 * error. This separates the two.
 *
 * The generator deliberately reproduces the two confounds that the real MVP
 * column has, so the normalisation is tested and not just the update rule:
 *
 *   1. a large position effect — Scouts score far more than Medics;
 *   2. a team-level win bonus paid to everyone on the winning side, standing in
 *      for the MVP model's `elimination_bonus` and `score_bonus`.
 *
 * If `teamMvpContrasts` works, both cancel and only the individual component
 * survives.
 */

import type { GameRecord, GameSide, RatedPlayer, TeamResult } from "./types";

/** Mean MVP by position, roughly mirroring the real spread across positions. */
const POSITION_MVP_MEAN: Record<number, number> = { 1: 12, 2: 10, 3: 14, 4: 8, 5: 7 };
const POSITION_MVP_SD = 3;
/** Paid to every player on the winning side — the team-level confound. */
const WIN_MVP_BONUS = 2.5;
/** How much of a player's MVP is driven by true skill rather than noise. */
const SKILL_TO_MVP = 0.7;
/** Converts a summed skill difference into a win probability. */
const SKILL_TO_LOGIT = 0.5;
const DRAW_RATE = 0.02;

export type SyntheticOptions = {
  players: number;
  games: number;
  teamSize: number;
  seed: number;
};

export const DEFAULT_SYNTHETIC: SyntheticOptions = {
  players: 300,
  games: 5000,
  teamSize: 5,
  seed: 20260814,
};

export type SyntheticResult = {
  games: GameRecord[];
  trueSkill: Map<string, number>;
};

/** Deterministic PRNG — the self-test must give the same answer every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  // Box-Muller. The 1e-12 floor keeps log() finite when rand() returns 0.
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function generateSynthetic(opts: SyntheticOptions): SyntheticResult {
  const rand = mulberry32(opts.seed);

  const playerIds: string[] = [];
  const trueSkill = new Map<string, number>();
  for (let i = 0; i < opts.players; i++) {
    const id = `synthetic-player-${String(i).padStart(4, "0")}`;
    playerIds.push(id);
    trueSkill.set(id, gaussian(rand));
  }

  const games: GameRecord[] = [];
  const baseTime = Date.UTC(2020, 0, 1);
  const perGame = opts.teamSize * 2;

  for (let g = 0; g < opts.games; g++) {
    // Partial Fisher-Yates: shuffle only the slots we need.
    const pool = playerIds.slice();
    for (let i = 0; i < perGame; i++) {
      const j = i + Math.floor(rand() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picked = pool.slice(0, perGame);
    const sideAIds = picked.slice(0, opts.teamSize);
    const sideBIds = picked.slice(opts.teamSize);

    const strength = (ids: string[]) => ids.reduce((s, id) => s + trueSkill.get(id)!, 0);
    const pA = logistic(SKILL_TO_LOGIT * (strength(sideAIds) - strength(sideBIds)));

    let resultA: TeamResult;
    if (rand() < DRAW_RATE) resultA = "draw";
    else resultA = rand() < pA ? "win" : "loss";
    const resultB: TeamResult = resultA === "draw" ? "draw" : resultA === "win" ? "loss" : "win";

    const buildSide = (ids: string[], result: TeamResult, tdfTeamIndex: number): GameSide => {
      const players: RatedPlayer[] = ids.map((id, slot) => {
        const position = (slot % 5) + 1;
        const skill = trueSkill.get(id)!;
        const mvp =
          POSITION_MVP_MEAN[position] +
          POSITION_MVP_SD * (SKILL_TO_MVP * skill + (1 - SKILL_TO_MVP) * gaussian(rand)) +
          (result === "win" ? WIN_MVP_BONUS : 0);
        return { playerId: id, callsign: id, position, mvpPoints: mvp };
      });
      const score = players.reduce((s, p) => s + p.mvpPoints, 0) * 100;
      return {
        gameTeamId: `synthetic-team-${g}-${tdfTeamIndex}`,
        tdfTeamIndex,
        result,
        score,
        players,
      };
    };

    const startTime = new Date(baseTime + g * 3_600_000);
    games.push({
      gameId: `synthetic-game-${g}`,
      centerId: "synthetic-center",
      centerName: "Synthetic Center",
      startTime,
      sortKey: startTime.getTime(),
      competitionId: null,
      competitionType: null,
      competitionCategory: null,
      roundType: null,
      roundMultiplier: null,
      sides: [buildSide(sideAIds, resultA, 1), buildSide(sideBIds, resultB, 2)],
    });
  }

  return { games, trueSkill };
}
