// ---------------------------------------------------------------------------
// Parsed TDF output (Phase 1 → Phase 2)
// ---------------------------------------------------------------------------

export interface ParsedTdf {
  meta: {
    fileVersion: number;
    centre: string; // e.g. "3-3"
    countryCode: number;
    siteCode: number;
    startTime: string; // YYYYMMDDHHmmss
    duration: number; // ms, default 900000
    penalty: number; // default 0
    missionType: number; // skip if not 5
    missionDesc: string;
  };
  teams: ParsedTeam[];
  entities: ParsedEntity[];
  events: ParsedEvent[];
  scores: ParsedScore[];
  entityEnds: ParsedEntityEnd[];
  sm5Stats: ParsedSm5Stats[];
  playerStateLog: ParsedPlayerState[]; // empty if absent (pre-2.005)
  // Mid-game position changes: each entry maps an external entity ID to its
  // time-ordered generations, each with a disambiguated internal ID.
  entityRouting: Array<{
    externalId: string;
    generations: Array<{ internalId: string; startTime: number }>;
  }>;
}

export interface ParsedTeam {
  index: number;
  desc: string;
  colourEnum: number;
  colourDesc: string;
  colourRgb: string | null;
}

export interface ParsedEntity {
  time: number;
  id: string; // internal ID (may be suffixed with _genN for position-change re-registrations)
  originalId: string; // original TDF entity ID — use for player DB lookups
  type: string;
  desc: string; // callsign or hardware name
  team: number;
  level: number;
  category: number; // 0=N/A, 1=Commander, 2=Heavy, 3=Scout, 4=Ammo, 5=Medic
  battlesuit: string | null;
  memberId: string | null;
}

export interface ParsedEvent {
  time: number;
  type: string; // e.g. "0205", "0404"
  actor: string | null;
  target: string | null;
  description: string; // middle portion of the line
}

export interface ParsedScore {
  time: number;
  entity: string;
  old: number;
  delta: number;
  new: number;
}

export interface ParsedEntityEnd {
  time: number;
  id: string;
  exitType: string; // "02"=complete, "04"=eliminated, "01"/"17"=kicked
  score: number;
}

export interface ParsedSm5Stats {
  id: string;
  shotsHit: number;
  shotsFired: number;
  timesZapped: number;
  timesMissiled: number;
  missileHits: number;
  nukesDetonated: number;
  nukesActivated: number;
  nukeCancels: number;
  medicHits: number;
  ownMedicHits: number;
  medicNukes: number;
  scoutRapid: number;
  lifeBoost: number;
  ammoBoost: number;
  livesLeft: number;
  shotsLeft: number;
  penalties: number;
  shot3Hit: number;
  ownNukeCancels: number;
  shotOpponent: number;
  shotTeam: number;
  missiledOpponent: number;
  missiledTeam: number;
}

export interface ParsedPlayerState {
  time: number;
  entity: string;
  state: number;
}

// ---------------------------------------------------------------------------
// Simulator types (Phase 2)
// ---------------------------------------------------------------------------

export interface PlayerSimState {
  // identity
  entityId: string;
  position: number; // 1=Commander, 2=Heavy, 3=Scout, 4=Ammo, 5=Medic
  teamIndex: number;

  // live state
  state: 0 | 2 | 3;
  stateEnteredAt: number;
  state3EnteredAt: number | null; // when the current downtime period started (state 3 entry)
  lastTransitionToActiveAt: number | null; // when the player last transitioned to state_0; null = never been down
  hitPoints: number;
  lives: number;
  shots: number;
  missiles: number;
  sp: number; // Heavy always 0, never increments
  isRapidFire: boolean; // Scout only
  rapidFireStartedAt: number | null;
  isNuking: boolean; // Commander only
  nukeActivatedAt: number | null;
  isEliminated: boolean;
  eliminatedAt: number | null;
  deactivationCause: "resupply" | "other" | null;
  receivedAmmoResupplyThisCycle: boolean;
  receivedLivesResupplyThisCycle: boolean;
  lastAmmoResuppliedBy: string | null; // entityId of Ammo Carrier
  lastLivesResuppliedBy: string | null; // entityId of Medic

  // live score (from line type 5)
  score: number;

  // uptime/downtime accumulators (ms)
  uptime: number;
  resupplyDowntime: number;
  otherDowntime: number;

  // stat accumulators
  shotsFired: number; // internal — final value from sm5Stats
  shotsHit: number; // internal — final value from sm5Stats
  shotsHitOpponent: number;
  shotsHitTeam: number;
  shotsHitOpponent3hit: number;
  shotsHitOpponentMedic: number;
  shotsHitTeamMedic: number;
  timesHit: number;
  missileHits: number;
  missilesHitOpponent: number;
  missilesHitTeam: number;
  missilesHitOpponentMedic: number;
  missilesHitTeamMedic: number;
  // Actual lives removed by missiles on medics (1 when medic had only 1 life,
  // otherwise 2). TDF medicHits counts damage dealt, not event count.
  missilesHitOpponentMedicLives: number;
  missilesHitTeamMedicLives: number;
  timesHitByMissile: number;
  nukesActivated: number;
  nukesDetonated: number;
  nukesHitMedic: number;
  livesRemovedByNuke: number;
  totalNukeActivationTime: number;
  nukesCanceled: number;
  teamNukesCanceled: number;
  nukesCanceledByNuke: number;
  ownNukesCanceledByNuke: number;
  rapidFire: number;
  totalRapidTime: number;
  shotsFiredDuringRapid: number;
  shotsHitDuringRapid: number;
  shotsHitOpponentDuringRapid: number;
  shotsHitTeamDuringRapid: number;
  ammoBoost: number;
  lifeBoost: number;
  resuppliesGiven: number;
  doubleResuppliesGiven: number;
  resuppliesReceivedAmmo: number;
  resuppliesReceivedLives: number;
  emergencyResuppliesReceivedAmmo: number;
  emergencyResuppliesReceivedLives: number;
  doubleResuppliesReceived: number;
  deactivatedOpponent: number;
  deactivatedTeam: number;
  eliminatedOpponent: number;
  eliminatedTeam: number;
  eliminatedOpponentMedic: number;
  eliminatedTeamMedic: number;
  assists: number;
  resetOpponent: number;
  resetTeam: number;
  missileResetOpponent: number;
  missileResetTeam: number;
  spEarned: number;
  spSpent: number;
  targetsDestroyed: number;
  penalties: number;

  // Tracking for consistency checks
  phantomDeactivations: number;       // HP reached 0 on a 0205 (non-deactivating) event
  entityEndForcedLives: number | null; // lives value when entity-end "04" forced elimination

  // GamePlayerState snapshots — one per state-changing event
  stateSnapshots: GamePlayerStateSnapshot[];
}

export interface GamePlayerStateSnapshot {
  eventIndex: number; // index into SimulatedGame.events → resolved to event_id at insertion
  score: number;
  lives: number;
  shots: number;
  missiles: number;
  sp: number;
  hitPoints: number;
  state: 0 | 2 | 3;
  isRapidFire: boolean;
  isNuking: boolean;
  isEliminated: boolean;
  accuracy: number;
  hitDiff: number;
}

// ---------------------------------------------------------------------------
// Simulator output (Phase 2 → Phase 3)
// ---------------------------------------------------------------------------

export interface SimulatedGame {
  actualDuration: number;
  outcome: "score" | "elimination" | "draw" | "aborted";
  eliminationTime: number | null; // ms since mission start, only set if outcome === 'elimination'
  teams: SimTeam[];
  playerStats: Map<string, PlayerSimState>; // keyed by entityId
  events: SimEvent[]; // all GameEvent rows (real + synthetic state transitions)
  targetDestructions: SimTargetDestruction[];
  penalties: SimPenalty[];
  interactions: Map<
    string,
    { shotsHit: number; shotDeactivations: number; missileHits: number }
  >; // key: "${actorId}->${targetId}"
}

export interface SimTeam {
  tdfTeamIndex: number;
  score: number | null; // null for Neutral
  eliminated: boolean | null; // null for Neutral
  result: "win" | "loss" | "draw" | null; // null for Neutral
  eliminationBonus: number | null; // null for Neutral
}

export interface SimEvent {
  time: number;
  eventType: string;
  actorEntityId: string | null; // player actor entity id
  actorHardwareId: string | null; // non-player actor hardware id (warbot, beacon)
  targetEntityId: string | null; // player target entity id
  targetHardwareId: string | null; // non-player target hardware id
  description: string;
  isSynthetic: boolean; // true for state_3/state_2/state_0 events
}

export interface SimTargetDestruction {
  time: number;
  targetHardwareId: string; // resolves to gameTargetId
  actorEntityId: string; // resolves to scorecardId
  method: "shot" | "missile" | "awarded";
}

export interface SimPenalty {
  time: number;
  refereeEntityId: string | null; // null if no referee entity
  targetEntityId: string;
  scoreValue: number;
}

// ---------------------------------------------------------------------------
// Position constants
// ---------------------------------------------------------------------------

export const POSITION = {
  COMMANDER: 1,
  HEAVY: 2,
  SCOUT: 3,
  AMMO: 4,
  MEDIC: 5,
} as const;

export interface PositionStats {
  hitPoints: number;
  shotPower: number;
  initialShots: number;
  maxShots: number;
  resupplyShots: number;
  initialLives: number;
  maxLives: number;
  resupplyLives: number;
  initialMissiles: number;
}

export const POSITION_STATS: Record<number, PositionStats> = {
  [POSITION.COMMANDER]: {
    hitPoints: 3,
    shotPower: 2,
    initialShots: 30,
    maxShots: 60,
    resupplyShots: 5,
    initialLives: 15,
    maxLives: 30,
    resupplyLives: 4,
    initialMissiles: 5,
  },
  [POSITION.HEAVY]: {
    hitPoints: 3,
    shotPower: 3,
    initialShots: 20,
    maxShots: 40,
    resupplyShots: 5,
    initialLives: 10,
    maxLives: 20,
    resupplyLives: 3,
    initialMissiles: 5,
  },
  [POSITION.SCOUT]: {
    hitPoints: 1,
    shotPower: 1,
    initialShots: 30,
    maxShots: 60,
    resupplyShots: 10,
    initialLives: 15,
    maxLives: 30,
    resupplyLives: 5,
    initialMissiles: 0,
  },
  [POSITION.AMMO]: {
    hitPoints: 1,
    shotPower: 1,
    initialShots: 15,
    maxShots: 15,
    resupplyShots: 0,
    initialLives: 10,
    maxLives: 20,
    resupplyLives: 3,
    initialMissiles: 0,
  },
  [POSITION.MEDIC]: {
    hitPoints: 1,
    shotPower: 1,
    initialShots: 15,
    maxShots: 30,
    resupplyShots: 5,
    initialLives: 20,
    maxLives: 20,
    resupplyLives: 0,
    initialMissiles: 0,
  },
};
