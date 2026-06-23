// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// ---------------------------------------------------------------------------
// Laserball simulator types and constants
//
// This module is a faithful port of the European reference implementation
// (demo_files/laserball-code/process_logs.php). See docs/laserball-chomper-design.md.
// ---------------------------------------------------------------------------

/** Mission type code for Laserball (line type 1). SM5 is 5. */
export const LASERBALL_MISSION_TYPE = 28;

/** Timing windows (ms), ported verbatim from the PHP `$CONF` (process_logs.php:66). */
export const LB_CONF = {
  ASSIST_LIMIT: 10000,
  MARNE_LIMIT: 5000,
  GOAL_AFTER_MARNE: 5000,
  BLOCK_BEFORE_GOAL: 7000,
  FAILED_CLEAR_COOLDOWN: 5000,
} as const;

/** Players with this much playtime or less are treated as artefacts and dropped. */
export const LB_MIN_PLAYTIME_MS = 30000;

/** Laserball type-4 event codes (process_logs.php:349-620). */
export const LB_EVENT = {
  MISS: "0201",
  MATCH_RESET: "0101",
  PASS: "1100",
  GOAL_A: "1101",
  GOAL_B: "1102",
  STEAL: "1103",
  BLOCK: "1104",
  ROUND_START: "1105",
  ROUND_END: "1106",
  GET_BALL: "1107",
  BALL_TIMEOUT: "1108",
  CLEAR: "1109",
  FAILED_CLEAR: "110A",
  TARGET_RESET_SELF: "110B",
  TARGET_RESET_PLAYER: "110C",
} as const;

/** Per-player live state + stat accumulators. Stat fields map 1:1 to lb_scorecard. */
export interface LbPlayerSimState {
  // Identity
  entityId: string; // TDF entity id, e.g. "#62GWDq"
  teamIndex: number;
  callsign: string;
  battlesuit: string | null;

  // --- Persisted stats (full parity with process_logs.php) ---
  goals: number;
  bigGoals: number;
  futileAttacks: number;
  badAttacksFc: number;
  futileAttacksGoal: number;
  assists1: number;
  assists2: number;
  clearAssists1: number;
  clearAssists2: number;
  passesDone: number;
  passesReceived: number;
  passOverOpponent: number;
  turnoverPass: number;
  clearsDone: number;
  clearsReceived: number;
  clutchSaves: number;
  failedClearsCalc: number;
  failedClearsRaw: number;
  inactiveClearPenalty: number;
  noClearGoal: number;
  noClearBlocks: number;
  defenseScore: number;
  stealsDone: number;
  stealsReceived: number;
  blocksDone: number;
  blocksReceived: number;
  blocksWithBall: number;
  blocksBeforeGoal: number;
  resetBlocksDone: number;
  resetBlocksReceived: number;
  blockSerieMax: number;
  bigMid: number;
  resetPoint: number;
  possessionTimeMs: number;
  misses: number;
  targetResetSelf: number;
  targetResetPlayer: number;
  startRoundBall: number;
  startRoundLoss: number;
  ballTimeout: number;
  state0: number;
  state2: number;
  state3: number;

  // --- Transient tracking (not persisted) ---
  status: number; // current state 0/1/2/3
  currentSerie: number;
  lastState0Time: number;
  lastState3Time: number;
  lastBlockTime: number;
  lastClearTime: number;
  actionTimes: number[]; // aggressive-action timestamps within 5s
  chainTracker: number[]; // aggressive-action timestamps within 3s (bigMid)
  firstSeen: number | null;
  lastSeen: number | null;

  // Replay snapshots — one per emitted event the player is involved in
  stateSnapshots: LbPlayerStateSnapshot[];
}

export interface LbPlayerStateSnapshot {
  eventIndex: number; // index into SimulatedLbGame.events
  score: number; // running goals
  state: number; // 0/2/3
  hasBall: boolean;
  isActive: boolean;
  assists: number;
  stealsDone: number;
  stealsReceived: number;
  blocksDone: number;
  blocksReceived: number;
  clearsDone: number;
  clearsReceived: number;
  passesDone: number;
  passesReceived: number;
  possessionTimeMs: number;
}

export interface LbSimEvent {
  time: number;
  eventType: string;
  actorEntityId: string | null;
  targetEntityId: string | null;
  description: string;
}

export interface LbSimTeam {
  tdfTeamIndex: number;
  isNeutral: boolean;
  name: string;
  colourEnum: number;
  colourRgb: string | null;
  score: number | null; // goals; null for Neutral
  result: "win" | "loss" | "draw" | null; // null for Neutral
}

export interface LbInteraction {
  steals: number;
  blocks: number;
  passes: number;
}

export interface SimulatedLbGame {
  actualDuration: number;
  outcome: "score" | "draw" | "aborted";
  teams: LbSimTeam[];
  playerStats: Map<string, LbPlayerSimState>; // keyed by entityId; only persisted players
  events: LbSimEvent[];
  interactions: Map<string, LbInteraction>; // key: "${actorId}->${targetId}"
  // Validation: goals tallied per team from goal events vs from line-5 score events.
  goalCheck: {
    teamGoals: Record<number, number>;
    scoreEventGoals: Record<number, number>;
    ok: boolean;
  };
}
