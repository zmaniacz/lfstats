// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectComeback,
  detectHighlights,
  detectLastStand,
  detectMedicSaves,
  detectMissileChains,
  detectNukeChains,
  detectNukeDenied,
  detectNukeSaved,
  selectShownHighlights,
  type GameTimeline,
  type HighlightCategory,
  type TimelineEvent,
  type TimelineState,
} from "./detectors";

const COMMANDER = "red-cmd";
const ENEMY_COMMANDER = "blue-cmd";
const HEAVY = "red-hvy";
const SCOUT = "blue-sct";
const MEDIC = "red-med";

let nextId = 0;

function event(
  time: number,
  type: string,
  actor: string | null = null,
  target: string | null = null,
): TimelineEvent {
  return { id: `e${nextId++}`, time, type, actor, target };
}

function state(
  scorecardId: string,
  time: number,
  fields: { eventId?: string; score?: number; lives?: number; isNuking?: boolean } = {},
): TimelineState {
  return {
    scorecardId,
    time,
    eventId: fields.eventId ?? "none",
    score: fields.score ?? 0,
    lives: fields.lives ?? 5,
    isNuking: fields.isNuking ?? false,
  };
}

function timeline(fields: Partial<GameTimeline>): GameTimeline {
  return {
    duration: 900_000,
    outcome: "score",
    events: [],
    states: [],
    players: [
      { id: COMMANDER, position: 1, teamId: "red" },
      { id: HEAVY, position: 2, teamId: "red" },
      { id: MEDIC, position: 5, teamId: "red" },
      { id: ENEMY_COMMANDER, position: 1, teamId: "blue" },
      { id: SCOUT, position: 3, teamId: "blue" },
    ],
    teams: [
      { id: "red", tdfTeamIndex: 0, result: "win" },
      { id: "blue", tdfTeamIndex: 1, result: "loss" },
    ],
    ...fields,
  };
}

/** A nuke by `commander` from `start`, ending with `ending` at `end`. */
function nuke(commander: string, start: number, end: number, ending: TimelineEvent) {
  const activate = event(start, "0404", commander);
  return {
    events: [activate, ending],
    states: [
      state(commander, start, { eventId: activate.id, isNuking: true }),
      state(commander, end, { eventId: ending.id }),
    ],
  };
}

function detonation(commander: string, start: number, end: number) {
  return nuke(commander, start, end, event(end, "0405", commander));
}

function merge(...parts: { events: TimelineEvent[]; states: TimelineState[] }[]) {
  return {
    events: parts.flatMap((p) => p.events).sort((a, b) => a.time - b.time),
    states: parts.flatMap((p) => p.states).sort((a, b) => a.time - b.time),
  };
}

test("nuke saved needs a detonation and a prior hit from the downed opponent", () => {
  const base = detonation(COMMANDER, 100_000, 106_000);
  const hit = event(102_000, "0205", SCOUT, COMMANDER);
  const down = event(103_000, "0206", COMMANDER, SCOUT);

  const [saved] = detectNukeSaved(timeline(merge(base, { events: [hit, down], states: [] })));
  assert.equal(saved?.time, 103_000);
  assert.equal(saved?.primaryScorecardId, COMMANDER);
  assert.equal(saved?.secondaryScorecardId, SCOUT);
  assert.equal(saved?.magnitude, 1);

  // Downing someone who never hit the commander is not a defence.
  assert.deepEqual(detectNukeSaved(timeline(merge(base, { events: [down], states: [] }))), []);

  // A hit from before the nuke started does not count.
  const earlyHit = event(99_000, "0205", SCOUT, COMMANDER);
  assert.deepEqual(
    detectNukeSaved(timeline(merge(base, { events: [earlyHit, down], states: [] }))),
    [],
  );

  // A cancelled nuke saved nothing.
  const cancelled = nuke(
    COMMANDER,
    100_000,
    105_000,
    event(104_000, "0206", ENEMY_COMMANDER, COMMANDER),
  );
  assert.deepEqual(
    detectNukeSaved(timeline(merge(cancelled, { events: [hit, down], states: [] }))),
    [],
  );
});

test("nuke denied finds the cancel before the late is_nuking row", () => {
  const cancel = event(104_000, "0206", SCOUT, COMMANDER);
  // The false row sits on a later state event, not on the cancel itself.
  const data = nuke(COMMANDER, 100_000, 108_000, event(108_000, "state_0", COMMANDER));

  const [denied] = detectNukeDenied(timeline(merge(data, { events: [cancel], states: [] })));
  assert.equal(denied?.time, 104_000);
  assert.equal(denied?.primaryScorecardId, SCOUT);
  assert.equal(denied?.secondaryScorecardId, COMMANDER);
  assert.deepEqual(denied?.details, { eventType: "0206" });
});

test("an enemy nuke counts as a denial; friendly endings do not", () => {
  const data = nuke(COMMANDER, 100_000, 108_000, event(108_000, "state_0", COMMANDER));

  const enemyNuke = event(103_000, "0405", ENEMY_COMMANDER);
  const [denied] = detectNukeDenied(timeline(merge(data, { events: [enemyNuke], states: [] })));
  assert.equal(denied?.primaryScorecardId, ENEMY_COMMANDER);

  const resupply = event(103_000, "0502", MEDIC, COMMANDER);
  assert.deepEqual(detectNukeDenied(timeline(merge(data, { events: [resupply], states: [] }))), []);
});

test("comeback needs strictly more than 10,000 and a score or elimination outcome", () => {
  const swing = (deficit: number) => [
    state(HEAVY, 100_000, { score: 1_000 }),
    state(SCOUT, 200_000, { score: 1_000 + deficit }),
    state(HEAVY, 800_000, { score: 50_000 }),
  ];

  const [comeback] = detectComeback(timeline({ states: swing(10_001) }));
  assert.equal(comeback?.time, 200_000);
  assert.equal(comeback?.magnitude, 10_001);
  assert.equal(comeback?.tdfTeamIndex, 0);

  assert.deepEqual(detectComeback(timeline({ states: swing(10_000) })), []);
  assert.equal(
    detectComeback(timeline({ states: swing(20_000), outcome: "elimination" })).length,
    1,
  );
  assert.deepEqual(detectComeback(timeline({ states: swing(20_000), outcome: "forfeit" })), []);
});

test("comeback produces nothing for a draw", () => {
  const teams = [
    { id: "red", tdfTeamIndex: 0, result: "draw" as const },
    { id: "blue", tdfTeamIndex: 1, result: "draw" as const },
  ];
  assert.deepEqual(
    detectComeback(timeline({ teams, states: [state(SCOUT, 100, { score: 20_000 })] })),
    [],
  );
});

test("last stand needs more than 60 seconds on exactly one life", () => {
  const run = (end: number) => [
    state(MEDIC, 100_000, { lives: 1 }),
    state(MEDIC, 110_000, { lives: 1 }),
    state(MEDIC, end, { lives: 4 }),
  ];

  const [stand] = detectLastStand(timeline({ states: run(160_001) }));
  assert.equal(stand?.time, 100_000);
  assert.equal(stand?.magnitude, 60_001);
  assert.deepEqual(detectLastStand(timeline({ states: run(160_000) })), []);
});

test("last stand runs to game end, and counts when the run ends in elimination", () => {
  const toEnd = detectLastStand(timeline({ states: [state(SCOUT, 800_000, { lives: 1 })] }));
  assert.equal(toEnd[0]?.magnitude, 100_000);

  const eliminated = detectLastStand(
    timeline({
      states: [state(SCOUT, 100_000, { lives: 1 }), state(SCOUT, 200_000, { lives: 0 })],
    }),
  );
  assert.equal(eliminated[0]?.magnitude, 100_000);
});

test("missile chain uses a rolling window and merges overlaps", () => {
  const missile = (time: number) => event(time, "0306", HEAVY, SCOUT);

  // 15s window, exactly on the limit.
  assert.equal(
    detectMissileChains(timeline({ events: [0, 7_000, 15_000].map(missile) })).length,
    1,
  );
  assert.deepEqual(detectMissileChains(timeline({ events: [0, 7_000, 15_001].map(missile) })), []);

  // Every three in a row fit, so five merge even though the whole chain takes 24s.
  const [chain] = detectMissileChains(
    timeline({ events: [0, 6_000, 12_000, 18_000, 24_000].map(missile) }),
  );
  assert.equal(chain?.magnitude, 5);
  assert.equal(chain?.windowEnd, 24_000);
  assert.deepEqual(chain?.details, { spanMs: 24_000 });
});

test("missile chain ignores friendly fire and other positions", () => {
  const friendly = [0, 1_000, 2_000].map((t) => event(t, "0306", HEAVY, COMMANDER));
  assert.deepEqual(detectMissileChains(timeline({ events: friendly })), []);

  const scout = [0, 1_000, 2_000].map((t) => event(t, "0306", SCOUT, HEAVY));
  assert.deepEqual(detectMissileChains(timeline({ events: scout })), []);
});

test("5 chain needs five straight detonations within 35 seconds", () => {
  const five = (gap: number) =>
    merge(
      ...[0, 1, 2, 3, 4].map((i) => detonation(COMMANDER, 100_000 + i * gap, 105_000 + i * gap)),
    );

  // Span is first activation to fifth detonation.
  const [chain] = detectNukeChains(timeline(five(7_500)));
  assert.equal(chain?.magnitude, 35_000);
  assert.equal(chain?.time, 135_000);
  assert.deepEqual(detectNukeChains(timeline(five(7_501))), []);
});

test("a cancelled nuke breaks a 5 chain", () => {
  const cancelled = nuke(COMMANDER, 112_000, 116_000, event(113_000, "0206", SCOUT, COMMANDER));
  const data = merge(
    detonation(COMMANDER, 100_000, 104_000),
    detonation(COMMANDER, 105_000, 109_000),
    cancelled,
    detonation(COMMANDER, 117_000, 121_000),
    detonation(COMMANDER, 122_000, 126_000),
    detonation(COMMANDER, 127_000, 131_000),
  );
  assert.deepEqual(detectNukeChains(timeline(data)), []);
});

function medicSaveData(
  fields: { before?: number; after?: number; actor?: string; time?: number } = {},
  nuke = detonation(ENEMY_COMMANDER, 100_000, 106_000),
) {
  const time = fields.time ?? 102_000;
  return merge(nuke, {
    events: [event(time, "0502", fields.actor ?? MEDIC, HEAVY)],
    states: [
      state(HEAVY, 90_000, { lives: fields.before ?? 3 }),
      state(HEAVY, time, { lives: fields.after ?? 8 }),
    ],
  });
}

test("medic save needs a lethal life count before the resupply", () => {
  const [save] = detectMedicSaves(timeline(medicSaveData({ before: 3 })));
  assert.equal(save?.time, 102_000);
  assert.equal(save?.primaryScorecardId, MEDIC);
  assert.equal(save?.secondaryScorecardId, HEAVY);
  assert.equal(save?.magnitude, 1);
  assert.deepEqual(save?.details, { livesBefore: 3 });

  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({ before: 4 }))), []);
});

function teamBoost(lives: Record<string, [number, number]>, medic = MEDIC) {
  const boost = event(102_000, "0512", medic);
  return merge(detonation(ENEMY_COMMANDER, 100_000, 106_000), {
    events: [boost],
    states: [
      state(medic, 102_000, { eventId: boost.id }),
      ...Object.entries(lives).flatMap(([id, [before, after]]) => [
        state(id, 90_000, { lives: before }),
        state(id, 102_000, { eventId: boost.id, lives: after }),
      ]),
    ],
  });
}

test("a team boost saves every confirmed recipient in one highlight", () => {
  const saves = detectMedicSaves(timeline(teamBoost({ [HEAVY]: [2, 7], [COMMANDER]: [1, 6] })));
  assert.equal(saves.length, 1);
  assert.equal(saves[0]?.primaryScorecardId, MEDIC);
  assert.equal(saves[0]?.secondaryScorecardId, COMMANDER);
  assert.equal(saves[0]?.magnitude, 2);
  assert.deepEqual(saves[0]?.details, { livesBefore: 1 });
});

test("a team boost needs a confirmed gain for a teammate on lethal lives", () => {
  // No lives gained, so this row does not confirm a recipient.
  assert.deepEqual(detectMedicSaves(timeline(teamBoost({ [HEAVY]: [3, 3] }))), []);

  // The boost reached them, but they were never in danger.
  assert.deepEqual(detectMedicSaves(timeline(teamBoost({ [HEAVY]: [4, 9] }))), []);

  // Recipients are only those with a row on the boost: the bare teammate gets no credit.
  const data = teamBoost({});
  data.states.push(state(HEAVY, 90_000, { lives: 2 }));
  data.states.sort((a, b) => a.time - b.time);
  assert.deepEqual(detectMedicSaves(timeline(data)), []);
});

test("a team boost needs the teammate to survive the detonation", () => {
  assert.deepEqual(detectMedicSaves(timeline(teamBoost({ [HEAVY]: [1, 3] }))), []);
});

test("medic save needs the nuke to detonate", () => {
  const cancelled = nuke(
    ENEMY_COMMANDER,
    100_000,
    105_000,
    event(104_000, "0206", HEAVY, ENEMY_COMMANDER),
  );
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({}, cancelled))), []);
});

test("medic save needs the resupply to fall inside the nuke", () => {
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({ time: 99_000 }))), []);
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({ time: 106_000 }))), []);
});

test("medic save needs the teammate to survive the detonation", () => {
  // Still on 3 lives after the resupply, so the nuke eliminates them anyway.
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({ after: 3 }))), []);

  // Pushed back to 3 by a hit after the resupply.
  const data = medicSaveData({ after: 8 });
  data.states.push(state(HEAVY, 104_000, { lives: 3 }));
  data.states.sort((a, b) => a.time - b.time);
  assert.deepEqual(detectMedicSaves(timeline(data)), []);
});

test("medic save ignores non-medics and a friendly nuke", () => {
  // The beacon and other positions can also log 0502.
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({ actor: COMMANDER }))), []);

  const friendlyNuke = detonation(COMMANDER, 100_000, 106_000);
  assert.deepEqual(detectMedicSaves(timeline(medicSaveData({}, friendlyNuke))), []);
});

test("a timeline with no events finds nothing", () => {
  assert.deepEqual(detectHighlights(timeline({})), []);
});

test("shown highlights are capped, sorted by category, and limited per category", () => {
  const h = (category: HighlightCategory, magnitude: number, time = 0) => ({
    category,
    magnitude,
    time,
  });

  const shown = selectShownHighlights([
    h("last_stand", 300_000),
    h("nuke_denied", 1, 30),
    h("nuke_denied", 1, 10),
    h("nuke_denied", 1, 20),
    h("nuke_saved", 1),
    h("missile_chain", 3),
    h("missile_chain", 5),
    h("comeback", 11_000),
    h("nuke_chain", 30_000),
  ]);

  assert.deepEqual(
    shown.map((s) => [s.category, s.magnitude, s.time]),
    [
      ["nuke_chain", 30_000, 0],
      ["comeback", 11_000, 0],
      ["missile_chain", 5, 0],
      ["missile_chain", 3, 0],
      ["nuke_saved", 1, 0],
    ],
  );
});

test("the faster 5 chain ranks first", () => {
  const shown = selectShownHighlights([
    { category: "nuke_chain" as const, magnitude: 34_000, time: 0 },
    { category: "nuke_chain" as const, magnitude: 27_000, time: 0 },
  ]);
  assert.equal(shown[0]?.magnitude, 27_000);
});
