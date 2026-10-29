// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyLbTeamAdjustments,
  computeLbTeamStats,
  lbMatchOutcome,
  sortLbStandings,
  type LbStandingsHalfRow,
} from "./lb-match-points";

function half(
  n: number,
  team1Goals: number,
  team2Goals: number,
  opts: { match?: string; t1?: string; t2?: string; multiplier?: number } = {},
): LbStandingsHalfRow {
  return {
    competitionMatchId: opts.match ?? "m1",
    roundMultiplier: opts.multiplier ?? 1,
    team1Id: opts.t1 ?? "A",
    team2Id: opts.t2 ?? "B",
    half: n,
    team1Goals,
    team2Goals,
  };
}

test("match goes to the higher aggregate over both halves, not the halves won", () => {
  // A wins half 1 by 1, B wins half 2 by 3: B takes the match.
  const o = lbMatchOutcome([half(1, 2, 1), half(2, 0, 3)]);
  assert.equal(o.winner, 2);
  assert.equal(o.complete, true);
  assert.deepEqual([o.team1Goals, o.team2Goals], [2, 4]);
});

test("level aggregate with no overtime is a tie", () => {
  assert.equal(lbMatchOutcome([half(1, 2, 1), half(2, 1, 2)]).winner, "tie");
});

test("overtime decides a level aggregate, and its goals count towards the totals", () => {
  const o = lbMatchOutcome([half(1, 2, 1), half(2, 1, 2), half(3, 0, 1)]);
  assert.equal(o.winner, 2);
  assert.equal(o.overtime, true);
  assert.deepEqual([o.team1Goals, o.team2Goals], [3, 4]);
});

test("a lone half is incomplete, and final only once the competition is completed", () => {
  assert.equal(lbMatchOutcome([half(1, 3, 0)]).winner, null);
  const done = lbMatchOutcome([half(1, 3, 0)], true);
  assert.equal(done.winner, 1);
  assert.equal(done.complete, false);
});

test("win is 1 point, tie is 0.5 each, scaled by the round multiplier", () => {
  const stats = computeLbTeamStats([
    half(1, 3, 1, { match: "m1" }),
    half(2, 2, 2, { match: "m1" }),
    half(1, 1, 1, { match: "m2", t1: "A", t2: "C", multiplier: 2 }),
    half(2, 0, 0, { match: "m2", t1: "A", t2: "C", multiplier: 2 }),
  ]);
  const a = stats.get("A")!;
  assert.deepEqual(
    [a.matchesPlayed, a.wins, a.ties, a.losses, a.points, a.goalsFor, a.goalsAgainst],
    [2, 1, 1, 0, 2, 6, 4],
  );
  assert.equal(stats.get("B")!.points, 0);
  assert.equal(stats.get("C")!.points, 1);
});

test("an incomplete match counts goals but no result or points", () => {
  const b = computeLbTeamStats([half(1, 0, 4)]).get("B")!;
  assert.deepEqual([b.matchesPlayed, b.points, b.goalsFor, b.goalsAgainst], [0, 0, 4, 0]);
});

test("adjustments add to points and are reported separately", () => {
  const stats = computeLbTeamStats([half(1, 1, 0), half(2, 1, 0)]);
  applyLbTeamAdjustments(stats, [
    { teamId: "A", points: -0.5 },
    { teamId: "Z", points: -1 },
  ]);
  assert.equal(stats.get("A")!.points, 0.5);
  assert.equal(stats.get("A")!.adjustmentPoints, -0.5);
  assert.equal(stats.get("Z")!.points, -1);
});

test("order: points, goal difference, goals for, head to head, name", () => {
  const rows = [
    // A beats B; both finish level on points, GD and GF overall.
    half(1, 1, 0, { match: "ab", t1: "A", t2: "B" }),
    half(2, 0, 0, { match: "ab", t1: "A", t2: "B" }),
    half(1, 0, 1, { match: "ac", t1: "A", t2: "C" }),
    half(2, 0, 0, { match: "ac", t1: "A", t2: "C" }),
    half(1, 1, 0, { match: "bd", t1: "B", t2: "D" }),
    half(2, 0, 0, { match: "bd", t1: "B", t2: "D" }),
  ];
  const stats = computeLbTeamStats(rows);
  const table = ["B", "A", "C", "D"].map((id) => ({
    teamId: id,
    teamName: id,
    ...stats.get(id)!,
  }));
  const order = sortLbStandings(table, rows).map((t) => t.teamId);
  // A and B: 1 point, GD 0, GF 1 each; A won their meeting.
  assert.deepEqual(order, ["C", "A", "B", "D"]);
});
