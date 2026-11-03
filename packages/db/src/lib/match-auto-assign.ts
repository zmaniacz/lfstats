// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Picks the competition match slot an ingested SM5 game belongs to, from who played on each
 * side against the known rosters. Pure: the loader in queries/competition-auto-assign.ts feeds
 * it, and match-auto-assign.test.ts covers it. See docs/Competition_Structure.md,
 * "Auto-assignment".
 */

/** Each game side needs at least this many players found on its match side's roster. */
export const MIN_MATCHED_PER_SIDE = 3;

/** A match whose scheduled start is further than this from the game's start is not a candidate. */
export const MAX_SCHEDULE_DRIFT_MS = 12 * 3_600_000;

export type AutoAssignGameSide = {
  gameTeamId: string;
  colourEnum: number;
  // Identified players only: guests have no player id and can never be rostered.
  playerIds: string[];
};

/** A game already sitting in one of the match's slots. */
export type AutoAssignSlottedGame = {
  gameNumber: number;
  startTime: Date;
  // The colour match side 1 played in that game.
  side1ColourEnum: number;
};

export type AutoAssignMatch = {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  // Union of every rostered player (mercs included) on each side's teams.
  side1Roster: string[];
  side2Roster: string[];
  // The competition team ids on each side; candidates for different pairings make a game ambiguous.
  side1TeamIds: string[];
  side2TeamIds: string[];
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
  slotted: AutoAssignSlottedGame[];
};

export type AutoAssignInput = {
  gameStartTime: Date;
  sides: [AutoAssignGameSide, AutoAssignGameSide];
  matches: AutoAssignMatch[];
};

export type UnrosteredPlayer = { playerId: string; side: 1 | 2 };

export type AutoAssignDecision =
  | {
      kind: "assign";
      matchId: string;
      gameNumber: number;
      team1GameTeamId: string;
      team2GameTeamId: string;
      // Players who are on neither side's roster: assigned anyway, and flagged to admins.
      unrostered: UnrosteredPlayer[];
    }
  | { kind: "skip"; reason: string };

type SideFit = { matched: number; conflicts: number; unrostered: string[] };

// How one game side's players line up against the match side it would play as.
function fitSide(
  playerIds: string[],
  own: Set<string>,
  opposing: Set<string>,
  ambiguous: Set<string>,
): SideFit {
  const fit: SideFit = { matched: 0, conflicts: 0, unrostered: [] };
  for (const id of playerIds) {
    if (ambiguous.has(id)) continue;
    if (own.has(id)) fit.matched += 1;
    else if (opposing.has(id)) fit.conflicts += 1;
    else fit.unrostered.push(id);
  }
  return fit;
}

function sideAccepts(fit: SideFit): boolean {
  return (
    fit.conflicts === 0 &&
    fit.matched >= MIN_MATCHED_PER_SIDE &&
    fit.matched > fit.unrostered.length
  );
}

type Candidate = {
  match: AutoAssignMatch;
  gameNumber: number;
  side1: AutoAssignGameSide;
  side2: AutoAssignGameSide;
  unrostered: UnrosteredPlayer[];
  scheduleDriftMs: number | null;
};

// The free slot this game would take, or why the match can't take it. A full match is just not
// a candidate; any other refusal means the rosters point here but the slot doesn't fit.
function pickGameNumber(
  match: AutoAssignMatch,
  gameStartTime: Date,
  side1ColourEnum: number,
): number | { reason: string; blocking: boolean } {
  const taken = new Map(match.slotted.map((g) => [g.gameNumber, g]));
  if (taken.has(1) && taken.has(2))
    return { reason: "both games already assigned", blocking: false };
  const gameNumber = taken.has(1) ? 2 : 1;
  const other = taken.get(gameNumber === 1 ? 2 : 1);
  if (other) {
    // Teams swap colours between the two games of a match.
    if (other.side1ColourEnum === side1ColourEnum) {
      return { reason: "teams did not swap colours", blocking: true };
    }
    const inOrder =
      gameNumber === 2
        ? other.startTime.getTime() < gameStartTime.getTime()
        : gameStartTime.getTime() < other.startTime.getTime();
    if (!inOrder) return { reason: "out of order with the match's other game", blocking: true };
  }
  return gameNumber;
}

type Rejection = { reason: string; blocking: boolean };

function evaluate(
  match: AutoAssignMatch,
  input: AutoAssignInput,
): { candidate: Candidate } | Rejection {
  const roster1 = new Set(match.side1Roster);
  const roster2 = new Set(match.side2Roster);
  const ambiguous = new Set(match.side1Roster.filter((id) => roster2.has(id)));
  const [a, b] = input.sides;

  const orientations = [
    { side1: a, side2: b },
    { side1: b, side2: a },
  ].flatMap(({ side1, side2 }) => {
    const fit1 = fitSide(side1.playerIds, roster1, roster2, ambiguous);
    const fit2 = fitSide(side2.playerIds, roster2, roster1, ambiguous);
    if (!sideAccepts(fit1) || !sideAccepts(fit2)) return [];
    const unrostered: UnrosteredPlayer[] = [
      ...fit1.unrostered.map((playerId) => ({ playerId, side: 1 as const })),
      ...fit2.unrostered.map((playerId) => ({ playerId, side: 2 as const })),
    ];
    return [{ side1, side2, unrostered }];
  });

  if (orientations.length === 0) return { reason: "rosters do not match", blocking: false };
  if (orientations.length > 1) return { reason: "both orientations fit", blocking: true };
  const { side1, side2, unrostered } = orientations[0]!;

  const gameNumber = pickGameNumber(match, input.gameStartTime, side1.colourEnum);
  if (typeof gameNumber !== "number") return gameNumber;

  const scheduled =
    gameNumber === 1 ? match.game1ScheduledStartTime : match.game2ScheduledStartTime;
  const scheduleDriftMs = scheduled
    ? Math.abs(scheduled.getTime() - input.gameStartTime.getTime())
    : null;
  if (scheduleDriftMs !== null && scheduleDriftMs > MAX_SCHEDULE_DRIFT_MS) {
    return { reason: "too far from its scheduled start", blocking: false };
  }

  return { candidate: { match, gameNumber, side1, side2, unrostered, scheduleDriftMs } };
}

function pairingKey(m: AutoAssignMatch): string {
  const side = (ids: string[]) => [...ids].sort().join("+");
  return [side(m.side1TeamIds), side(m.side2TeamIds)].sort().join(" vs ");
}

// Scheduled matches first, nearest start first; then a match already half played; then
// schedule order.
function compareCandidates(x: Candidate, y: Candidate): number {
  const dx = x.scheduleDriftMs ?? Infinity;
  const dy = y.scheduleDriftMs ?? Infinity;
  if (dx !== dy) return dx - dy;
  if (x.match.slotted.length !== y.match.slotted.length) {
    return y.match.slotted.length - x.match.slotted.length;
  }
  if (x.match.roundNumber !== y.match.roundNumber) {
    return x.match.roundNumber - y.match.roundNumber;
  }
  return x.match.matchNumber - y.match.matchNumber;
}

export function decideAutoAssign(input: AutoAssignInput): AutoAssignDecision {
  if (input.matches.length === 0) return { kind: "skip", reason: "no open matches" };

  const candidates: Candidate[] = [];
  for (const match of input.matches) {
    const result = evaluate(match, input);
    if ("candidate" in result) {
      candidates.push(result.candidate);
    } else if (result.blocking) {
      // The rosters point at this match but its slots disagree. Another match of the same
      // pairing would only be a guess, so leave it to an admin.
      return { kind: "skip", reason: result.reason };
    }
  }
  if (candidates.length === 0) return { kind: "skip", reason: "no match fits the rosters" };

  // The same pairing can meet more than once, but a game that fits two different pairings
  // means the rosters overlap too much to trust either.
  if (new Set(candidates.map((c) => pairingKey(c.match))).size > 1) {
    return { kind: "skip", reason: "fits more than one pairing" };
  }

  const [best] = candidates.sort(compareCandidates);
  return {
    kind: "assign",
    matchId: best!.match.matchId,
    gameNumber: best!.gameNumber,
    team1GameTeamId: best!.side1.gameTeamId,
    team2GameTeamId: best!.side2.gameTeamId,
    unrostered: best!.unrostered,
  };
}
