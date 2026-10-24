// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import { compareStandings, computeTeamStats, type StandingsGameRow } from "./match-points";

function game(
  gameNumber: number,
  team1Score: number,
  team2Score: number,
  opts: { trios?: boolean; duos?: boolean; matchId?: string; multiplier?: number } = {},
): StandingsGameRow {
  const result1 = team1Score > team2Score ? "win" : team1Score < team2Score ? "loss" : "draw";
  const result2 = result1 === "win" ? "loss" : result1 === "loss" ? "win" : "draw";
  return {
    matchId: opts.matchId ?? "m1",
    gameNumber,
    roundMultiplier: opts.multiplier ?? 1,
    team1Id: "A",
    team1PartnerId: opts.trios || opts.duos ? "B" : null,
    team1Partner2Id: opts.duos ? "E" : null,
    team1Score,
    team1Result: result1,
    team1EliminatedOpponent: false,
    team2Id: "C",
    team2PartnerId: opts.trios || opts.duos ? "D" : null,
    team2Partner2Id: opts.duos ? "F" : null,
    team2Score,
    team2Result: result2,
    team2EliminatedOpponent: false,
  };
}

test("standard match: a 2-0 sweep is 6 points to the winner", () => {
  const stats = computeTeamStats([game(1, 100, 50), game(2, 100, 50)]);
  assert.equal(stats.get("A")!.matchPoints, 6);
  assert.equal(stats.get("C")!.matchPoints, 0);
  assert.equal(stats.has("B"), false);
});

test("trios sweep credits both trios on the winning side with 6 points", () => {
  const stats = computeTeamStats([
    game(1, 100, 50, { trios: true }),
    game(2, 100, 50, { trios: true }),
  ]);
  for (const id of ["A", "B"]) {
    const s = stats.get(id)!;
    assert.equal(s.matchPoints, 6);
    assert.equal(s.gameWins, 2);
    assert.equal(s.matchWins, 1);
  }
  for (const id of ["C", "D"]) {
    const s = stats.get(id)!;
    assert.equal(s.matchPoints, 0);
    assert.equal(s.gameLosses, 2);
    assert.equal(s.matchLosses, 1);
  }
});

test("trios split: game points shared, match bonus to the higher combined side", () => {
  const stats = computeTeamStats([
    game(1, 100, 50, { trios: true }),
    game(2, 60, 80, { trios: true }),
  ]);
  // Side 1: 2 (game 1) + 2 (combined 160 vs 130) = 4; side 2: 2 (game 2).
  assert.equal(stats.get("A")!.matchPoints, 4);
  assert.equal(stats.get("B")!.matchPoints, 4);
  assert.equal(stats.get("C")!.matchPoints, 2);
  assert.equal(stats.get("D")!.matchPoints, 2);
});

test("trios draw gives every trio a point per draw, scaled by the multiplier", () => {
  const stats = computeTeamStats([
    game(1, 50, 50, { trios: true, multiplier: 2 }),
    game(2, 50, 50, { trios: true, multiplier: 2 }),
  ]);
  for (const id of ["A", "B", "C", "D"]) {
    const s = stats.get(id)!;
    assert.equal(s.matchPoints, 6); // (1 + 1 + 1) × 2
    assert.equal(s.gameDraws, 2);
    assert.equal(s.matchDraws, 1);
  }
});

test("an incomplete trios match earns game points but no match bonus", () => {
  const stats = computeTeamStats([game(1, 100, 50, { trios: true })]);
  assert.equal(stats.get("B")!.matchPoints, 2);
  assert.equal(stats.get("B")!.matchWins, 0);
});

test("duos sweep credits all three duos on the winning side with 6 points", () => {
  const stats = computeTeamStats([
    game(1, 100, 50, { duos: true }),
    game(2, 100, 50, { duos: true }),
  ]);
  for (const id of ["A", "B", "E"]) {
    const s = stats.get(id)!;
    assert.equal(s.matchPoints, 6);
    assert.equal(s.gameWins, 2);
    assert.equal(s.matchWins, 1);
  }
  for (const id of ["C", "D", "F"]) {
    const s = stats.get(id)!;
    assert.equal(s.matchPoints, 0);
    assert.equal(s.gameLosses, 2);
    assert.equal(s.matchLosses, 1);
  }
});

test("duos split: every duo on a side shares its game points and match bonus", () => {
  const stats = computeTeamStats([
    game(1, 100, 50, { duos: true }),
    game(2, 60, 80, { duos: true }),
  ]);
  for (const id of ["A", "B", "E"]) assert.equal(stats.get(id)!.matchPoints, 4);
  for (const id of ["C", "D", "F"]) assert.equal(stats.get(id)!.matchPoints, 2);
});

test("standings sort on points, then score ratio, then game wins", () => {
  const base = { matchPoints: 6, gameWins: 2 };
  const high = { ...base, scoreFor: 30000, scoreAgainst: 20000 };
  const low = { ...base, scoreFor: 20000, scoreAgainst: 20000 };
  assert.ok(compareStandings(high, low) < 0);
  assert.ok(compareStandings({ ...low, matchPoints: 7 }, high) < 0);
  assert.equal(compareStandings(high, high), 0);
});
