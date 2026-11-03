// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideAutoAssign,
  type AutoAssignGameSide,
  type AutoAssignInput,
  type AutoAssignMatch,
} from "./match-auto-assign";

const RED = 1;
const GREEN = 2;
const START = new Date("2026-11-07T19:00:00");

const roster = (prefix: string, n = 6) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function side(gameTeamId: string, colourEnum: number, playerIds: string[]): AutoAssignGameSide {
  return { gameTeamId, colourEnum, playerIds };
}

function match(overrides: Partial<AutoAssignMatch> = {}): AutoAssignMatch {
  return {
    matchId: "m1",
    roundNumber: 1,
    matchNumber: 1,
    side1Roster: roster("a"),
    side2Roster: roster("b"),
    side1TeamIds: ["A"],
    side2TeamIds: ["B"],
    game1ScheduledStartTime: null,
    game2ScheduledStartTime: null,
    slotted: [],
    ...overrides,
  };
}

function input(
  matches: AutoAssignMatch[],
  red = roster("b"),
  green = roster("a"),
  gameStartTime = START,
): AutoAssignInput {
  return {
    gameStartTime,
    sides: [side("red", RED, red), side("green", GREEN, green)],
    matches,
  };
}

test("assigns the matching game team to each match side", () => {
  const decision = decideAutoAssign(input([match()]));
  assert.deepEqual(decision, {
    kind: "assign",
    matchId: "m1",
    gameNumber: 1,
    team1GameTeamId: "green",
    team2GameTeamId: "red",
    unrostered: [],
  });
});

test("assigns with unrostered subs, and reports them by side", () => {
  const decision = decideAutoAssign(
    input([match()], ["b1", "b2", "b3", "b4", "sub1"], ["a1", "a2", "a3", "a4", "a5", "sub2"]),
  );
  assert.equal(decision.kind, "assign");
  if (decision.kind !== "assign") return;
  assert.deepEqual(decision.unrostered, [
    { playerId: "sub2", side: 1 },
    { playerId: "sub1", side: 2 },
  ]);
});

test("skips when unrostered players are not a clear minority", () => {
  const decision = decideAutoAssign(
    input([match()], ["b1", "b2", "b3", "x1", "x2", "x3"], roster("a")),
  );
  assert.equal(decision.kind, "skip");
});

test("skips when a side has fewer than three rostered players", () => {
  const decision = decideAutoAssign(input([match()], ["b1", "b2"], roster("a")));
  assert.equal(decision.kind, "skip");
});

test("a player rostered on the opposing side rules the match out", () => {
  const decision = decideAutoAssign(input([match()], [...roster("b", 5), "a6"], roster("a", 5)));
  assert.equal(decision.kind, "skip");
});

test("a player rostered on both sides is ignored rather than a conflict", () => {
  const m = match({ side1Roster: [...roster("a"), "both"], side2Roster: [...roster("b"), "both"] });
  const decision = decideAutoAssign(input([m], [...roster("b", 5), "both"], roster("a")));
  assert.equal(decision.kind, "assign");
});

test("picks the match whose rosters fit out of several", () => {
  const other = match({
    matchId: "m2",
    matchNumber: 2,
    side1Roster: roster("c"),
    side2Roster: roster("d"),
    side1TeamIds: ["C"],
    side2TeamIds: ["D"],
  });
  const decision = decideAutoAssign(input([other, match()]));
  assert.equal(decision.kind === "assign" && decision.matchId, "m1");
});

test("game 1 already assigned: takes game 2 when colours swap and it started later", () => {
  const m = match({
    slotted: [{ gameNumber: 1, startTime: new Date("2026-11-07T18:30:00"), side1ColourEnum: RED }],
  });
  // Side 1 (team A) is green now, red in game 1.
  const decision = decideAutoAssign(input([m]));
  assert.equal(decision.kind === "assign" && decision.gameNumber, 2);
});

test("game 1 already assigned: skips when the colours did not swap", () => {
  const m = match({
    slotted: [
      { gameNumber: 1, startTime: new Date("2026-11-07T18:30:00"), side1ColourEnum: GREEN },
    ],
  });
  assert.equal(decideAutoAssign(input([m])).kind, "skip");
});

test("game 1 already assigned: skips a game that started before it", () => {
  const m = match({
    slotted: [{ gameNumber: 1, startTime: new Date("2026-11-07T19:30:00"), side1ColourEnum: RED }],
  });
  assert.equal(decideAutoAssign(input([m])).kind, "skip");
});

test("only game 2 assigned: takes game 1 when it started earlier", () => {
  const m = match({
    slotted: [{ gameNumber: 2, startTime: new Date("2026-11-07T19:30:00"), side1ColourEnum: RED }],
  });
  assert.equal(decideAutoAssign(input([m])).kind === "assign", true);
});

test("a full match is never a candidate", () => {
  const m = match({
    slotted: [
      { gameNumber: 1, startTime: new Date("2026-11-07T18:00:00"), side1ColourEnum: RED },
      { gameNumber: 2, startTime: new Date("2026-11-07T18:30:00"), side1ColourEnum: GREEN },
    ],
  });
  assert.equal(decideAutoAssign(input([m])).kind, "skip");
});

test("a rematch goes to the nearest scheduled match", () => {
  const early = match({ game1ScheduledStartTime: new Date("2026-11-07T10:00:00") });
  const late = match({
    matchId: "m2",
    roundNumber: 2,
    game1ScheduledStartTime: new Date("2026-11-07T19:10:00"),
  });
  const decision = decideAutoAssign(input([early, late]));
  assert.equal(decision.kind === "assign" && decision.matchId, "m2");
});

test("a slot refusal never falls through to another match of the same pairing", () => {
  const refused = match({
    slotted: [{ gameNumber: 2, startTime: new Date("2026-11-07T18:30:00"), side1ColourEnum: RED }],
  });
  const rematch = match({ matchId: "m2", roundNumber: 2 });
  const decision = decideAutoAssign(input([refused, rematch]));
  assert.deepEqual(decision, { kind: "skip", reason: "out of order with the match's other game" });
});

test("a rematch with no schedule prefers a match already half played", () => {
  const r1 = match();
  const r2 = match({
    matchId: "m2",
    roundNumber: 2,
    slotted: [{ gameNumber: 1, startTime: new Date("2026-11-07T18:30:00"), side1ColourEnum: RED }],
  });
  const decision = decideAutoAssign(input([r1, r2]));
  assert.equal(decision.kind === "assign" && decision.matchId, "m2");
});

test("a rematch with no schedule goes to the earliest round", () => {
  const r2 = match({ matchId: "m2", roundNumber: 2 });
  const decision = decideAutoAssign(input([r2, match()]));
  assert.equal(decision.kind === "assign" && decision.matchId, "m1");
});

test("a match scheduled far from the game's start is not a candidate", () => {
  const m = match({ game1ScheduledStartTime: new Date("2026-11-08T19:00:00") });
  assert.equal(decideAutoAssign(input([m])).kind, "skip");
});

test("skips a game that fits two different pairings", () => {
  // Team C's roster is a superset of team A's, so A-vs-B and C-vs-B both fit.
  const other = match({
    matchId: "m2",
    side1Roster: [...roster("a"), "c1"],
    side1TeamIds: ["C"],
  });
  assert.equal(decideAutoAssign(input([match(), other])).kind, "skip");
});

test("trios: each side's roster is both trios together", () => {
  const m = match({
    side1Roster: [...roster("a", 3), ...roster("e", 3)],
    side2Roster: [...roster("b", 3), ...roster("f", 3)],
    side1TeamIds: ["A", "E"],
    side2TeamIds: ["B", "F"],
  });
  const decision = decideAutoAssign(
    input([m], [...roster("b", 3), ...roster("f", 3)], [...roster("a", 3), ...roster("e", 3)]),
  );
  assert.equal(decision.kind, "assign");
});

test("no open matches", () => {
  assert.deepEqual(decideAutoAssign(input([])), { kind: "skip", reason: "no open matches" });
});
