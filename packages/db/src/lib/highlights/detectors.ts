// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Pure highlight detectors: each reads one game's stored replay rows and returns the moments
 * worth calling out. See docs/Highlights_Spec.md for the rules. No database access here, so
 * every rule can be tested with a hand-built timeline.
 *
 * State rows are sparse (a value holds until the next row) and sm5_game_event has no sequence
 * column, so nothing here may rely on row order within a single millisecond.
 */

const POSITION_COMMANDER = 1;
const POSITION_HEAVY = 2;
const POSITION_MEDIC = 5;

const COMEBACK_DEFICIT = 10_000;
const LAST_STAND_MS = 60_000;
const MISSILE_CHAIN_COUNT = 3;
const MISSILE_CHAIN_MS = 15_000;
const NUKE_CHAIN_COUNT = 5;
const NUKE_CHAIN_MS = 35_000;
// A detonation costs 3 lives, so a player on this many or fewer is eliminated by it.
const NUKE_LETHAL_LIVES = 3;

// Everything that ends a nuke by deactivating its commander and names a target.
const NUKE_ENDING_EVENT_TYPES = new Set(["0206", "0306", "0308", "0500", "0502", "0209"]);

/** Most prestigious first: the fixed display order, which follows observed rarity. */
export const HIGHLIGHT_CATEGORIES = [
  "nuke_chain",
  "comeback",
  "medic_save",
  "missile_chain",
  "nuke_saved",
  "nuke_denied",
  "last_stand",
] as const;

export type HighlightCategory = (typeof HIGHLIGHT_CATEGORIES)[number];

export type HighlightDetails = {
  /** The event that ended the nuke, for nuke_denied. */
  eventType?: string;
  /** First to last missile, for missile_chain. */
  spanMs?: number;
  /** Lives before the resupply of the teammate closest to elimination, for medic_save. */
  livesBefore?: number;
};

export type TimelineEvent = {
  id: string;
  time: number;
  type: string;
  actor: string | null;
  target: string | null;
};

export type TimelineState = {
  scorecardId: string;
  eventId: string;
  time: number;
  score: number;
  lives: number;
  isNuking: boolean;
};

export type TimelinePlayer = { id: string; position: number; teamId: string };

export type TimelineTeam = {
  id: string;
  tdfTeamIndex: number;
  result: "win" | "loss" | "draw" | null;
};

export type GameTimeline = {
  duration: number;
  outcome: string;
  events: TimelineEvent[];
  /** Sorted by time. */
  states: TimelineState[];
  /** Competing players only: neutral-team scorecards are left out. */
  players: TimelinePlayer[];
  /** Competing teams only. */
  teams: TimelineTeam[];
};

export type HighlightCandidate = {
  category: HighlightCategory;
  detectorVersion: number;
  time: number;
  windowStart: number;
  windowEnd: number;
  primaryScorecardId: string | null;
  secondaryScorecardId: string | null;
  tdfTeamIndex: number | null;
  magnitude: number;
  details: HighlightDetails;
};

type NukeAttempt = {
  commander: TimelinePlayer;
  start: number;
  end: number;
  detonated: boolean;
};

function statesByPlayer(states: TimelineState[]): Map<string, TimelineState[]> {
  const byPlayer = new Map<string, TimelineState[]>();
  for (const s of states) {
    const rows = byPlayer.get(s.scorecardId) ?? [];
    rows.push(s);
    byPlayer.set(s.scorecardId, rows);
  }
  return byPlayer;
}

function opponentCheck(timeline: GameTimeline) {
  const teamOf = new Map(timeline.players.map((p) => [p.id, p.teamId]));
  return (a: string | null, b: string | null): boolean => {
    const teamA = a === null ? undefined : teamOf.get(a);
    const teamB = b === null ? undefined : teamOf.get(b);
    return teamA !== undefined && teamB !== undefined && teamA !== teamB;
  };
}

function findNukeAttempts(timeline: GameTimeline): NukeAttempt[] {
  const eventById = new Map(timeline.events.map((e) => [e.id, e]));
  const byPlayer = statesByPlayer(timeline.states);
  const attempts: NukeAttempt[] = [];

  for (const commander of timeline.players) {
    if (commander.position !== POSITION_COMMANDER) continue;
    let start: number | null = null;
    for (const row of byPlayer.get(commander.id) ?? []) {
      if (row.isNuking && start === null) start = row.time;
      if (!row.isNuking && start !== null) {
        const endEvent = eventById.get(row.eventId);
        attempts.push({
          commander,
          start,
          end: row.time,
          detonated: endEvent?.type === "0405" && endEvent.actor === commander.id,
        });
        start = null;
      }
    }
  }
  return attempts;
}

export function detectNukeSaved(timeline: GameTimeline): HighlightCandidate[] {
  const isOpponent = opponentCheck(timeline);
  const out: HighlightCandidate[] = [];

  for (const a of findNukeAttempts(timeline)) {
    if (!a.detonated) continue;
    const attackersDowned = timeline.events.filter(
      (down) =>
        (down.type === "0206" || down.type === "0306") &&
        down.actor === a.commander.id &&
        isOpponent(down.actor, down.target) &&
        down.time >= a.start &&
        down.time < a.end &&
        // Only 0205 can be the attacker's hit: a deactivating hit would have cancelled the nuke.
        timeline.events.some(
          (hit) =>
            hit.type === "0205" &&
            hit.actor === down.target &&
            hit.target === a.commander.id &&
            hit.time >= a.start &&
            hit.time <= down.time,
        ),
    );
    const first = attackersDowned.reduce<TimelineEvent | null>(
      (earliest, e) => (earliest === null || e.time < earliest.time ? e : earliest),
      null,
    );
    if (!first) continue;
    out.push({
      category: "nuke_saved",
      detectorVersion: 1,
      time: first.time,
      windowStart: a.start,
      windowEnd: a.end,
      primaryScorecardId: a.commander.id,
      secondaryScorecardId: first.target,
      tdfTeamIndex: null,
      magnitude: attackersDowned.length,
      details: {},
    });
  }
  return out;
}

export function detectNukeDenied(timeline: GameTimeline): HighlightCandidate[] {
  const isOpponent = opponentCheck(timeline);
  const out: HighlightCandidate[] = [];

  for (const a of findNukeAttempts(timeline)) {
    if (a.detonated) continue;
    // The simulator snapshots the commander before clearing is_nuking, so the false row lands
    // on an event after the cancel. Look back through the attempt for what actually ended it.
    const cause = timeline.events
      .filter(
        (e) =>
          e.time >= a.start &&
          e.time <= a.end &&
          ((e.target === a.commander.id && NUKE_ENDING_EVENT_TYPES.has(e.type)) ||
            (e.type === "0405" && isOpponent(e.actor, a.commander.id))),
      )
      .reduce<TimelineEvent | null>(
        (earliest, e) => (earliest === null || e.time < earliest.time ? e : earliest),
        null,
      );
    if (!cause || !isOpponent(cause.actor, a.commander.id)) continue;
    out.push({
      category: "nuke_denied",
      detectorVersion: 1,
      time: cause.time,
      windowStart: a.start,
      windowEnd: cause.time,
      primaryScorecardId: cause.actor,
      secondaryScorecardId: a.commander.id,
      tdfTeamIndex: null,
      magnitude: 1,
      details: { eventType: cause.type },
    });
  }
  return out;
}

export function detectComeback(timeline: GameTimeline): HighlightCandidate[] {
  if (timeline.outcome !== "score" && timeline.outcome !== "elimination") return [];
  const winner = timeline.teams.find((t) => t.result === "win");
  if (!winner) return [];

  const teamOf = new Map(timeline.players.map((p) => [p.id, p.teamId]));
  const totals = new Map(timeline.teams.map((t) => [t.id, 0]));
  const latest = new Map<string, number>();
  let worst = 0;
  let worstTime = 0;

  for (const s of timeline.states) {
    const teamId = teamOf.get(s.scorecardId);
    if (teamId === undefined) continue;
    totals.set(teamId, (totals.get(teamId) ?? 0) + s.score - (latest.get(s.scorecardId) ?? 0));
    latest.set(s.scorecardId, s.score);

    let bestOther = Number.NEGATIVE_INFINITY;
    for (const [id, total] of totals) {
      if (id !== winner.id) bestOther = Math.max(bestOther, total);
    }
    const deficit = bestOther - (totals.get(winner.id) ?? 0);
    if (deficit > worst) {
      worst = deficit;
      worstTime = s.time;
    }
  }

  if (worst <= COMEBACK_DEFICIT) return [];
  return [
    {
      category: "comeback",
      detectorVersion: 1,
      time: worstTime,
      windowStart: worstTime,
      windowEnd: timeline.duration,
      primaryScorecardId: null,
      secondaryScorecardId: null,
      tdfTeamIndex: winner.tdfTeamIndex,
      magnitude: worst,
      details: {},
    },
  ];
}

export function detectLastStand(timeline: GameTimeline): HighlightCandidate[] {
  const byPlayer = statesByPlayer(timeline.states);
  const out: HighlightCandidate[] = [];

  for (const player of timeline.players) {
    let start: number | null = null;
    const closeRun = (end: number) => {
      if (start !== null && end - start > LAST_STAND_MS) {
        out.push({
          category: "last_stand",
          detectorVersion: 1,
          time: start,
          windowStart: start,
          windowEnd: end,
          primaryScorecardId: player.id,
          secondaryScorecardId: null,
          tdfTeamIndex: null,
          magnitude: end - start,
          details: {},
        });
      }
      start = null;
    };

    for (const row of byPlayer.get(player.id) ?? []) {
      if (row.lives === 1) start ??= row.time;
      else closeRun(row.time);
    }
    closeRun(timeline.duration);
  }
  return out;
}

export function detectMissileChains(timeline: GameTimeline): HighlightCandidate[] {
  const isOpponent = opponentCheck(timeline);
  const out: HighlightCandidate[] = [];

  for (const player of timeline.players) {
    if (player.position !== POSITION_COMMANDER && player.position !== POSITION_HEAVY) continue;
    const hits = timeline.events
      .filter((e) => e.type === "0306" && e.actor === player.id && isOpponent(e.actor, e.target))
      .map((e) => e.time)
      .sort((a, b) => a - b);

    // The window rolls: overlapping qualifying windows merge into a single chain.
    let first = 0;
    while (first + MISSILE_CHAIN_COUNT <= hits.length) {
      let last = first + MISSILE_CHAIN_COUNT - 1;
      if (hits[last]! - hits[first]! > MISSILE_CHAIN_MS) {
        first++;
        continue;
      }
      while (
        last + 1 < hits.length &&
        hits[last + 1]! - hits[last + 2 - MISSILE_CHAIN_COUNT]! <= MISSILE_CHAIN_MS
      ) {
        last++;
      }
      out.push({
        category: "missile_chain",
        detectorVersion: 1,
        time: hits[first]!,
        windowStart: hits[first]!,
        windowEnd: hits[last]!,
        primaryScorecardId: player.id,
        secondaryScorecardId: null,
        tdfTeamIndex: null,
        magnitude: last - first + 1,
        details: { spanMs: hits[last]! - hits[first]! },
      });
      first = last + 1;
    }
  }
  return out;
}

export function detectNukeChains(timeline: GameTimeline): HighlightCandidate[] {
  const attempts = findNukeAttempts(timeline);
  const out: HighlightCandidate[] = [];

  for (const commander of timeline.players) {
    if (commander.position !== POSITION_COMMANDER) continue;
    const own = attempts
      .filter((a) => a.commander.id === commander.id)
      .sort((a, b) => a.start - b.start);

    let fastest: { start: number; end: number } | null = null;
    for (let i = 0; i + NUKE_CHAIN_COUNT <= own.length; i++) {
      const run = own.slice(i, i + NUKE_CHAIN_COUNT);
      if (!run.every((a) => a.detonated)) continue;
      const start = run[0]!.start;
      const end = run.at(-1)!.end;
      if (!fastest || end - start < fastest.end - fastest.start) fastest = { start, end };
    }
    if (!fastest || fastest.end - fastest.start > NUKE_CHAIN_MS) continue;

    out.push({
      category: "nuke_chain",
      detectorVersion: 1,
      time: fastest.end,
      windowStart: fastest.start,
      windowEnd: fastest.end,
      primaryScorecardId: commander.id,
      secondaryScorecardId: null,
      tdfTeamIndex: null,
      magnitude: fastest.end - fastest.start,
      details: {},
    });
  }
  return out;
}

export function detectMedicSaves(timeline: GameTimeline): HighlightCandidate[] {
  const isOpponent = opponentCheck(timeline);
  const positionOf = new Map(timeline.players.map((p) => [p.id, p.position]));
  const byPlayer = statesByPlayer(timeline.states);
  const detonated = findNukeAttempts(timeline).filter((a) => a.detonated);
  const out: HighlightCandidate[] = [];

  // State rows hold their value until the next row, so "lives at t" is the last row before t.
  const livesBefore = (scorecardId: string, time: number): number | null => {
    let lives: number | null = null;
    for (const row of byPlayer.get(scorecardId) ?? []) {
      if (row.time >= time) break;
      lives = row.lives;
    }
    return lives;
  };

  // A 0512 names no target. The simulator writes a row on it for each teammate who received
  // lives: exactly the hardware's recipients when the file logs resources, and teammates known
  // to be active otherwise. Teammates whose boost is uncertain get no row, so never count.
  const boostRecipients = (boost: TimelineEvent, medic: string): string[] =>
    timeline.states
      .filter((row) => row.eventId === boost.id && row.scorecardId !== medic)
      .filter((row) => row.lives > (livesBefore(row.scorecardId, boost.time) ?? row.lives))
      .map((row) => row.scorecardId);

  for (const resupply of timeline.events) {
    const { actor: medic } = resupply;
    if (resupply.type !== "0502" && resupply.type !== "0512") continue;
    if (medic === null || positionOf.get(medic) !== POSITION_MEDIC) continue;

    const nuke = detonated.find(
      (a) => isOpponent(a.commander.id, medic) && resupply.time >= a.start && resupply.time < a.end,
    );
    if (!nuke) continue;

    const recipients =
      resupply.type === "0512"
        ? boostRecipients(resupply, medic)
        : resupply.target === null || isOpponent(medic, resupply.target)
          ? []
          : [resupply.target];

    const saved = recipients
      .map((id) => ({ id, before: livesBefore(id, resupply.time) }))
      .filter(
        (r): r is { id: string; before: number } =>
          r.before !== null &&
          r.before <= NUKE_LETHAL_LIVES &&
          // Otherwise the nuke still eliminated them, or a later hit undid the save first.
          (livesBefore(r.id, nuke.end) ?? 0) > NUKE_LETHAL_LIVES,
      )
      .sort((a, b) => a.before - b.before);

    const closest = saved[0];
    if (!closest) continue;
    out.push({
      category: "medic_save",
      detectorVersion: 1,
      time: resupply.time,
      windowStart: nuke.start,
      windowEnd: nuke.end,
      primaryScorecardId: medic,
      secondaryScorecardId: closest.id,
      tdfTeamIndex: null,
      magnitude: saved.length,
      details: { livesBefore: closest.before },
    });
  }
  return out;
}

export function detectHighlights(timeline: GameTimeline): HighlightCandidate[] {
  return [
    ...detectNukeChains(timeline),
    ...detectComeback(timeline),
    ...detectMissileChains(timeline),
    ...detectNukeSaved(timeline),
    ...detectMedicSaves(timeline),
    ...detectNukeDenied(timeline),
    ...detectLastStand(timeline),
  ];
}

/** Lower is better only for nuke_chain, whose magnitude is a time span. */
function betterMagnitude(category: HighlightCategory, a: number, b: number): number {
  return category === "nuke_chain" ? a - b : b - a;
}

export function sortHighlights<
  T extends { category: HighlightCategory; magnitude: number; time: number },
>(highlights: T[]): T[] {
  return [...highlights].sort(
    (a, b) =>
      HIGHLIGHT_CATEGORIES.indexOf(a.category) - HIGHLIGHT_CATEGORIES.indexOf(b.category) ||
      betterMagnitude(a.category, a.magnitude, b.magnitude) ||
      a.time - b.time,
  );
}

const MAX_SHOWN = 5;
const MAX_SHOWN_PER_CATEGORY = 2;

/** The highlights the game page lists; the replay slider marks all of them. */
export function selectShownHighlights<
  T extends { category: HighlightCategory; magnitude: number; time: number },
>(highlights: T[]): T[] {
  const perCategory = new Map<HighlightCategory, number>();
  const shown: T[] = [];
  for (const h of sortHighlights(highlights)) {
    const count = perCategory.get(h.category) ?? 0;
    if (count >= MAX_SHOWN_PER_CATEGORY) continue;
    perCategory.set(h.category, count + 1);
    shown.push(h);
    if (shown.length === MAX_SHOWN) break;
  }
  return shown;
}
