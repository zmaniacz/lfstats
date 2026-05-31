import type {
  ParsedEntity,
  ParsedTdf,
  PlayerSimState,
  SimEvent,
  SimPenalty,
  SimTargetDestruction,
  SimTeam,
  SimulatedGame,
} from "./types.js";
import { POSITION, POSITION_STATS } from "./types.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function simulate(parsed: ParsedTdf): SimulatedGame {
  const sim = new Simulator(parsed);
  return sim.run();
}

// ---------------------------------------------------------------------------
// Simulator class
// ---------------------------------------------------------------------------

class Simulator {
  private parsed: ParsedTdf;

  // Entity lookup
  private entityById = new Map<string, ParsedEntity>();
  private playerEntities: ParsedEntity[] = [];
  private targetEntities: ParsedEntity[] = []; // non-player targets

  // Simulation state
  private playerStates = new Map<string, PlayerSimState>();
  private scoreMap = new Map<string, number>(); // live scores from line type 5
  private scorePointer = 0; // index into parsed.scores

  // Assist windows — only for Commander and Heavy opponents
  private assistWindows = new Map<
    string,
    Array<{ actorId: string; timestamp: number }>
  >();

  // Interaction tracking
  private interactions = new Map<
    string,
    { shotsHit: number; shotDeactivations: number; missileHits: number }
  >();

  // Line type 9 pointer (2.005+ only)
  private stateLogPointer = 0;

  // Mission time
  private missionStartTime = 0;
  private missionEndTime = 0;

  // Output accumulators
  private events: SimEvent[] = [];
  private targetDestructions: SimTargetDestruction[] = [];
  private penalties: SimPenalty[] = [];

  // Tracks current event index for snapshot linkage
  private currentEventIndex = -1;

  constructor(parsed: ParsedTdf) {
    this.parsed = parsed;
  }

  run(): SimulatedGame {
    this.buildEntityMaps();
    this.initPlayerStates();
    this.initInteractionMap();

    // Walk all events in order
    for (const event of this.parsed.events) {
      this.advanceClock(event.time);

      // Push the real line type 4 event to output
      const actor = event.actor;
      const target = event.target;
      const isTargetEntity = target
        ? this.entityById.get(target)?.type === "standard-target" ||
          this.entityById.get(target)?.type === "beacon" ||
          this.entityById.get(target)?.type === "generator-target"
        : false;

      this.events.push({
        time: event.time,
        eventType: event.type,
        actorEntityId: actor ?? null,
        targetEntityId: isTargetEntity ? null : (target ?? null),
        targetHardwareId: isTargetEntity ? (target ?? null) : null,
        description: event.description,
        isSynthetic: false,
      });
      this.currentEventIndex = this.events.length - 1;

      this.handleEvent(event.time, event.type, actor, target);
    }

    return this.buildResult();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private buildEntityMaps(): void {
    for (const entity of this.parsed.entities) {
      this.entityById.set(entity.id, entity);
      if (entity.type === "player") {
        this.playerEntities.push(entity);
      } else if (
        entity.type === "standard-target" ||
        entity.type === "beacon" ||
        entity.type === "generator-target"
      ) {
        this.targetEntities.push(entity);
      }
    }
  }

  private initPlayerStates(): void {
    for (const entity of this.playerEntities) {
      const pos = entity.category;
      const stats = POSITION_STATS[pos];
      if (!stats) continue; // skip category 0 (non-players accidentally typed as player)

      this.scoreMap.set(entity.id, 0);

      const state: PlayerSimState = {
        entityId: entity.id,
        position: pos,
        teamIndex: entity.team,
        state: 0,
        stateEnteredAt: 0,
        state3EnteredAt: null,
        hitPoints: stats.hitPoints,
        lives: stats.initialLives,
        shots: stats.initialShots,
        missiles: stats.initialMissiles,
        sp: 0,
        isRapidFire: false,
        rapidFireStartedAt: null,
        isNuking: false,
        nukeActivatedAt: null,
        isEliminated: false,
        eliminatedAt: null,
        deactivationCause: null,
        receivedAmmoResupplyThisCycle: false,
        receivedLivesResupplyThisCycle: false,
        lastAmmoResuppliedBy: null,
        lastLivesResuppliedBy: null,
        score: 0,
        uptime: 0,
        resupplyDowntime: 0,
        otherDowntime: 0,
        shotsFired: 0,
        shotsHit: 0,
        shotsHitOpponent: 0,
        shotsHitTeam: 0,
        shotsHitOpponent3hit: 0,
        shotsHitOpponentMedic: 0,
        shotsHitTeamMedic: 0,
        timesHit: 0,
        missileHits: 0,
        missilesHitOpponent: 0,
        missilesHitTeam: 0,
        missilesHitOpponentMedic: 0,
        missilesHitTeamMedic: 0,
        timesHitByMissile: 0,
        nukesActivated: 0,
        nukesDetonated: 0,
        nukesHitMedic: 0,
        livesRemovedByNuke: 0,
        totalNukeActivationTime: 0,
        nukesCanceled: 0,
        teamNukesCanceled: 0,
        nukesCanceledByNuke: 0,
        ownNukesCanceledByNuke: 0,
        rapidFire: 0,
        totalRapidTime: 0,
        shotsFiredDuringRapid: 0,
        shotsHitDuringRapid: 0,
        shotsHitOpponentDuringRapid: 0,
        shotsHitTeamDuringRapid: 0,
        ammoBoost: 0,
        lifeBoost: 0,
        resuppliesGiven: 0,
        doubleResuppliesGiven: 0,
        resuppliesReceivedAmmo: 0,
        resuppliesReceivedLives: 0,
        emergencyResuppliesReceivedAmmo: 0,
        emergencyResuppliesReceivedLives: 0,
        doubleResuppliesReceived: 0,
        deactivatedOpponent: 0,
        deactivatedTeam: 0,
        eliminatedOpponent: 0,
        eliminatedTeam: 0,
        eliminatedOpponentMedic: 0,
        eliminatedTeamMedic: 0,
        assists: 0,
        resetOpponent: 0,
        resetTeam: 0,
        missileResetOpponent: 0,
        missileResetTeam: 0,
        spEarned: 0,
        spSpent: 0,
        targetsDestroyed: 0,
        penalties: 0,
        stateSnapshots: [],
      };

      this.playerStates.set(entity.id, state);
    }
  }

  private initInteractionMap(): void {
    const ids = [...this.playerStates.keys()];
    for (const actorId of ids) {
      for (const targetId of ids) {
        if (actorId !== targetId) {
          this.interactions.set(`${actorId}->${targetId}`, {
            shotsHit: 0,
            shotDeactivations: 0,
            missileHits: 0,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Clock / state transition
  // ---------------------------------------------------------------------------

  private advanceClock(T: number): void {
    if (this.parsed.playerStateLog.length > 0) {
      // 2.005+ explicit state log
      while (
        this.stateLogPointer < this.parsed.playerStateLog.length &&
        this.parsed.playerStateLog[this.stateLogPointer]!.time <= T
      ) {
        const entry = this.parsed.playerStateLog[this.stateLogPointer]!;
        this.stateLogPointer++;
        this.applyExplicitStateTransition(
          entry.time,
          entry.entity,
          entry.state as 0 | 2 | 3,
        );
      }
    } else {
      // pre-2.005 synthetic transitions
      this.fireSyntheticTransitions(T);
    }
  }

  private fireSyntheticTransitions(upToTime: number): void {
    // Collect all pending transitions due at <= upToTime, sort by time, fire in order
    const pending: Array<{
      time: number;
      entityId: string;
      targetState: 0 | 2 | 3;
    }> = [];

    for (const [entityId, ps] of this.playerStates) {
      if (ps.isEliminated) continue;

      if (ps.state === 3 && ps.state3EnteredAt !== null) {
        const transitionAt = ps.state3EnteredAt + 4000;
        if (transitionAt <= upToTime) {
          pending.push({ time: transitionAt, entityId, targetState: 2 });
        }
      } else if (ps.state === 2) {
        // Transition from 2 to 0 at stateEnteredAt + 4000
        const transitionAt = ps.stateEnteredAt + 4000;
        if (transitionAt <= upToTime) {
          pending.push({ time: transitionAt, entityId, targetState: 0 });
        }
      }
    }

    pending.sort((a, b) => a.time - b.time);

    for (const { time, entityId, targetState } of pending) {
      this.applyExplicitStateTransition(time, entityId, targetState);
    }
  }

  private applyExplicitStateTransition(
    time: number,
    entityId: string,
    newState: 0 | 2 | 3,
  ): void {
    const ps = this.playerStates.get(entityId);
    if (!ps) return;
    if (ps.isEliminated) return;
    // Guard: for 2.005+ files, advanceClock may have already processed the state_3
    // log entry at exactly this timestamp before the deactivating event handler fires.
    // Skip the duplicate rather than inserting a conflicting GameEvent row.
    if (ps.state === newState) return;

    // Advance scores before snapshot
    this.advanceScores(time);

    // Create synthetic GameEvent for this state transition
    const eventType =
      newState === 3 ? "state_3" : newState === 2 ? "state_2" : "state_0";
    this.events.push({
      time,
      eventType,
      actorEntityId: entityId,
      targetEntityId: null,
      targetHardwareId: null,
      description:
        newState === 3
          ? "is down"
          : newState === 2
            ? "is vulnerable"
            : "reactivated",
      isSynthetic: true,
    });
    const stateEventIndex = this.events.length - 1;

    this.applyStateTransition(ps, newState, time, stateEventIndex);
  }

  private applyStateTransition(
    ps: PlayerSimState,
    newState: 0 | 2 | 3,
    time: number,
    eventIndex: number,
  ): void {
    const stats = POSITION_STATS[ps.position]!;

    if (newState === 3) {
      // Accumulate the uptime segment that just ended
      if (ps.state === 0) {
        ps.uptime += time - ps.stateEnteredAt;
      }
      // On entry to state 3: reset HP, track state3EnteredAt
      ps.hitPoints = stats.hitPoints;
      if (ps.isNuking) {
        ps.isNuking = false;
        ps.nukeActivatedAt = null;
      }
      ps.state3EnteredAt = time;
      // Clear assist window for this player (they are deactivated — no longer valid target)
      this.assistWindows.delete(ps.entityId);
    } else if (newState === 2) {
      // HP unchanged from state 3 (which set it to full)
    } else {
      // Transitioning to state 0: accumulate downtime, reset resupply cycle flags
      if (ps.state3EnteredAt !== null) {
        const duration = time - ps.state3EnteredAt;
        if (ps.deactivationCause === "resupply") {
          ps.resupplyDowntime += duration;
        } else {
          ps.otherDowntime += duration;
        }
        ps.state3EnteredAt = null;
      }
      ps.deactivationCause = null;
      ps.receivedAmmoResupplyThisCycle = false;
      ps.receivedLivesResupplyThisCycle = false;
    }

    ps.state = newState;
    ps.stateEnteredAt = time;

    this.recordSnapshot(ps, eventIndex);
  }

  // ---------------------------------------------------------------------------
  // Score maintenance
  // ---------------------------------------------------------------------------

  private advanceScores(upToTime: number): void {
    while (
      this.scorePointer < this.parsed.scores.length &&
      this.parsed.scores[this.scorePointer]!.time <= upToTime
    ) {
      const entry = this.parsed.scores[this.scorePointer]!;
      this.scorePointer++;
      const ps = this.playerStates.get(entry.entity);
      if (ps) {
        ps.score = entry.new;
      } else {
        this.scoreMap.set(entry.entity, entry.new);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Snapshot recording
  // ---------------------------------------------------------------------------

  private recordSnapshot(ps: PlayerSimState, eventIndex: number): void {
    const accuracy = ps.shotsFired > 0 ? r3(ps.shotsHit / ps.shotsFired) : 0;
    const hitDiff = r3(ps.shotsHitOpponent / Math.max(ps.timesHit, 1));

    ps.stateSnapshots.push({
      eventIndex,
      score: ps.score,
      lives: ps.lives,
      shots: ps.shots,
      missiles: ps.missiles,
      sp: ps.sp,
      hitPoints: ps.hitPoints,
      state: ps.state,
      isRapidFire: ps.isRapidFire,
      isNuking: ps.isNuking,
      isEliminated: ps.isEliminated,
      accuracy,
      hitDiff,
    });
  }

  // ---------------------------------------------------------------------------
  // SP helpers
  // ---------------------------------------------------------------------------

  private earnSp(ps: PlayerSimState, amount: number): void {
    if (ps.position === POSITION.HEAVY) return;
    const available = 99 - ps.sp;
    const actual = Math.min(amount, available);
    ps.sp += actual;
    ps.spEarned += actual;
  }

  private spendSp(ps: PlayerSimState, amount: number): void {
    if (ps.position === POSITION.HEAVY) return;
    ps.sp = Math.max(0, ps.sp - amount);
    ps.spSpent += amount;
  }

  // ---------------------------------------------------------------------------
  // Team helpers
  // ---------------------------------------------------------------------------

  private isOpponent(a: PlayerSimState, b: PlayerSimState): boolean {
    const aTeam = this.parsed.teams[a.teamIndex];
    const bTeam = this.parsed.teams[b.teamIndex];
    // Both must be non-neutral to be opponents
    if (!aTeam || !bTeam) return false;
    return (
      a.teamIndex !== b.teamIndex &&
      !aTeam.desc.toLowerCase().includes("neutral") &&
      !bTeam.desc.toLowerCase().includes("neutral")
    );
  }

  private isSameTeam(a: PlayerSimState, b: PlayerSimState): boolean {
    return a.teamIndex === b.teamIndex;
  }

  private isNeutralTeam(teamIndex: number): boolean {
    const team = this.parsed.teams[teamIndex];
    return (
      !team ||
      team.desc.toLowerCase() === "neutral" ||
      team.desc.toLowerCase() === "neutral team"
    );
  }

  private getTeammates(ps: PlayerSimState): PlayerSimState[] {
    return [...this.playerStates.values()].filter(
      (p) => p !== ps && p.teamIndex === ps.teamIndex && !p.isEliminated,
    );
  }

  private getActiveTeammates(
    ps: PlayerSimState,
    time: number,
    includeRecentlyDown = false,
  ): PlayerSimState[] {
    return this.getTeammates(ps).filter(
      (p) =>
        p.state === 0 ||
        (includeRecentlyDown &&
          p.state === 3 &&
          p.state3EnteredAt !== null &&
          time - p.state3EnteredAt <= 750),
    );
  }

  private getOpposingActivePlayers(ps: PlayerSimState): PlayerSimState[] {
    return [...this.playerStates.values()].filter(
      (p) => !p.isEliminated && this.isOpponent(ps, p),
    );
  }

  // ---------------------------------------------------------------------------
  // Elimination handling
  // ---------------------------------------------------------------------------

  private checkElimination(
    actor: PlayerSimState,
    target: PlayerSimState,
    time: number,
    isNuke: boolean,
  ): void {
    if (target.lives > 0) return;
    if (target.isEliminated) return;

    // The state transition to state 3 is blocked once isEliminated is set,
    // so capture the final uptime segment now while we still can.
    if (target.state === 0) {
      target.uptime += time - target.stateEnteredAt;
      target.stateEnteredAt = time;
    }

    target.isEliminated = true;
    target.eliminatedAt = time;

    // Record a final state snapshot so the replay scoreboard can show lives=0 and
    // isEliminated=true. The normal state_3 transition is blocked once isEliminated
    // is set, so without this snapshot the player's last visible state would still
    // show their pre-elimination life count.
    this.recordSnapshot(target, this.currentEventIndex);

    const isMedic = target.position === POSITION.MEDIC;

    if (!isNuke) {
      // Shot or missile elimination
      if (this.isOpponent(actor, target)) {
        actor.eliminatedOpponent++;
        if (isMedic) actor.eliminatedOpponentMedic++;
      } else if (this.isSameTeam(actor, target)) {
        actor.eliminatedTeam++;
        if (isMedic) actor.eliminatedTeamMedic++;
      }
    } else {
      // Nuke elimination — only counts as opponent elimination, never friendly
      if (this.isOpponent(actor, target)) {
        actor.eliminatedOpponent++;
        if (isMedic) actor.eliminatedOpponentMedic++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Assist window
  // ---------------------------------------------------------------------------

  private addToAssistWindow(
    actorId: string,
    targetId: string,
    timestamp: number,
  ): void {
    const target = this.playerStates.get(targetId);
    if (!target) return;
    // Only track assists for Commander and Heavy opponents
    if (
      target.position !== POSITION.COMMANDER &&
      target.position !== POSITION.HEAVY
    )
      return;

    if (!this.assistWindows.has(targetId)) {
      this.assistWindows.set(targetId, []);
    }
    this.assistWindows.get(targetId)!.push({ actorId, timestamp });
  }

  private awardAssists(targetId: string, deactivatingActorId: string): void {
    const window = this.assistWindows.get(targetId);
    if (!window) return;

    for (const { actorId } of window) {
      if (actorId === deactivatingActorId) continue; // killer doesn't get an assist
      const actor = this.playerStates.get(actorId);
      if (actor) actor.assists++;
    }
    this.assistWindows.delete(targetId);
  }

  // ---------------------------------------------------------------------------
  // Interaction tracking
  // ---------------------------------------------------------------------------

  private incrInteraction(
    actorId: string,
    targetId: string,
    field: "shotsHit" | "shotDeactivations" | "missileHits",
  ): void {
    const key = `${actorId}->${targetId}`;
    const entry = this.interactions.get(key);
    if (entry) entry[field]++;
  }

  // ---------------------------------------------------------------------------
  // Nuke cancel detection
  // ---------------------------------------------------------------------------

  private handleNukeCancel(
    actor: PlayerSimState,
    target: PlayerSimState,
  ): void {
    if (!target.isNuking) return;

    // Determine relationship between actor and the COMMANDER target
    if (this.isOpponent(actor, target)) {
      // Actor cancelled an enemy nuke — good play
      actor.nukesCanceled++;
    } else if (this.isSameTeam(actor, target)) {
      // Actor accidentally cancelled a friendly nuke — shame
      actor.teamNukesCanceled++;
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private handleEvent(
    time: number,
    type: string,
    actorId: string | null,
    targetId: string | null,
  ): void {
    this.advanceScores(time);

    const actor = actorId ? this.playerStates.get(actorId) : null;
    const target = targetId ? this.playerStates.get(targetId) : null;
    const eventIndex = this.currentEventIndex;

    switch (type) {
      case "0100":
        this.handleMissionStart(time, eventIndex);
        break;
      case "0101":
        this.handleMissionEnd(time, eventIndex);
        break;
      case "0201":
      case "0202": // miss on a target — same as open-air miss
        if (actor) this.handle0201(actor, eventIndex);
        break;
      case "0203":
        if (actor) this.handle0203(actor, time, eventIndex);
        break;
      case "0204":
        if (actor) this.handle0204(actor, time, eventIndex, targetId);
        break;
      case "0205":
        if (actor && target)
          this.handlePlayerHit(actor, target, time, false, eventIndex);
        break;
      case "0206":
        if (actor && target)
          this.handlePlayerHit(actor, target, time, true, eventIndex);
        break;
      case "0303":
        if (actor) this.handle0303(actor, time, eventIndex, targetId);
        break;
      case "0306":
        if (actor && target) this.handle0306(actor, target, time, eventIndex);
        break;
      case "0400":
        if (actor) this.handle0400(actor, time, eventIndex);
        break;
      case "0404":
        if (actor) this.handle0404(actor, time, eventIndex);
        break;
      case "0405":
        if (actor) this.handle0405(actor, time, eventIndex);
        break;
      case "0500":
        if (actor && target) this.handle0500(actor, target, time, eventIndex);
        else if (!actor && target) this.handleEmergencyResupply(target, "ammo", time, eventIndex);
        break;
      case "0502":
        if (actor && target) this.handle0502(actor, target, time, eventIndex);
        else if (!actor && target) this.handleEmergencyResupply(target, "lives", time, eventIndex);
        break;
      case "0510":
        if (actor) this.handle0510(actor, time, eventIndex);
        break;
      case "0512":
        if (actor) this.handle0512(actor, time, eventIndex);
        break;
      case "0600":
        if (actor) this.handle0600(null, actor, time, eventIndex);
        break;
      case "0B03":
        if (actor) this.handle0B03(actor, eventIndex, targetId);
        break;
      // 0300, 0301, 0304, 0900, 0902 — no state changes, skip
    }
  }

  // 0100 — Mission Start
  private handleMissionStart(time: number, eventIndex: number): void {
    this.missionStartTime = time;
    // Record initial snapshots for all players
    for (const ps of this.playerStates.values()) {
      ps.stateEnteredAt = time;
      this.recordSnapshot(ps, eventIndex);
    }
  }

  // 0101 — Mission End
  private handleMissionEnd(time: number, eventIndex: number): void {
    this.missionEndTime = time;

    for (const ps of this.playerStates.values()) {
      if (ps.isEliminated) continue;

      if (ps.state === 0) {
        ps.uptime += time - ps.stateEnteredAt;
      } else if (ps.state === 3 && ps.state3EnteredAt !== null) {
        const duration = time - ps.state3EnteredAt;
        if (ps.deactivationCause === "resupply")
          ps.resupplyDowntime += duration;
        else ps.otherDowntime += duration;
      } else if (ps.state === 2 && ps.state3EnteredAt !== null) {
        // state3EnteredAt was set when entering state 3; state 3 lasted 4000ms
        const fullDuration = time - ps.state3EnteredAt;
        if (ps.deactivationCause === "resupply")
          ps.resupplyDowntime += fullDuration;
        else ps.otherDowntime += fullDuration;
      }

      // Close any open rapid fire windows
      if (ps.isRapidFire && ps.rapidFireStartedAt !== null) {
        ps.totalRapidTime += time - ps.rapidFireStartedAt;
        ps.isRapidFire = false;
        ps.rapidFireStartedAt = null;
      }

      this.recordSnapshot(ps, eventIndex);
    }
  }

  // 0201 — Miss
  private handle0201(actor: PlayerSimState, _eventIndex: number): void {
    if (actor.position !== POSITION.AMMO) actor.shots--;
    actor.shotsFired++;
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid++;
    }
  }

  // 0203 — Target Hit (non-final)
  private handle0203(
    actor: PlayerSimState,
    _time: number,
    eventIndex: number,
  ): void {
    if (actor.position !== POSITION.AMMO) actor.shots--;
    actor.shotsFired++;
    actor.shotsHit++;
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid++;
      actor.shotsHitDuringRapid++;
    }
    this.recordSnapshot(actor, eventIndex);
  }

  // 0204 — Target Destroy (shot)
  private handle0204(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
    targetHardwareId: string | null,
  ): void {
    if (actor.position !== POSITION.AMMO) actor.shots--;
    actor.shotsFired++;
    actor.shotsHit++;
    actor.targetsDestroyed++;
    this.earnSp(actor, 5);
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid++;
      actor.shotsHitDuringRapid++;
    }
    this.recordSnapshot(actor, eventIndex);

    if (targetHardwareId) {
      this.targetDestructions.push({
        time,
        targetHardwareId,
        actorEntityId: actor.entityId,
        method: "shot",
      });
    }
  }

  // 0205 / 0206 — Player Hit / Deactivate
  private handlePlayerHit(
    actor: PlayerSimState,
    target: PlayerSimState,
    time: number,
    isDeactivating: boolean,
    eventIndex: number,
  ): void {
    if (actor.position !== POSITION.AMMO) actor.shots--;
    actor.shotsFired++;
    actor.shotsHit++;
    target.timesHit++;

    const isOpponent = this.isOpponent(actor, target);
    const isFriendly = this.isSameTeam(actor, target);

    if (isOpponent) {
      actor.shotsHitOpponent++;
      this.earnSp(actor, 1);
    }
    if (isFriendly) {
      actor.shotsHitTeam++;
    }

    if (isOpponent && target.position === POSITION.MEDIC) {
      actor.shotsHitOpponentMedic++;
    }
    if (isFriendly && target.position === POSITION.MEDIC) {
      actor.shotsHitTeamMedic++;
    }

    // 3-hit stat — hits on opponent Commander or Heavy
    if (
      isOpponent &&
      (target.position === POSITION.COMMANDER ||
        target.position === POSITION.HEAVY)
    ) {
      actor.shotsHitOpponent3hit++;
    }

    const stats = POSITION_STATS[actor.position]!;
    target.hitPoints -= stats.shotPower;

    // Reset tracking (target was in state 2 and got hit)
    if (target.state === 2) {
      if (isOpponent) actor.resetOpponent++;
      else if (isFriendly) actor.resetTeam++;
    }

    // Rapid fire tracking
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid++;
      actor.shotsHitDuringRapid++;
      if (isOpponent) actor.shotsHitOpponentDuringRapid++;
      if (isFriendly) actor.shotsHitTeamDuringRapid++;
    }

    // Add to assist window for Commander/Heavy opponents (0205 only — non-deactivating)
    if (!isDeactivating && isOpponent) {
      this.addToAssistWindow(actor.entityId, target.entityId, time);
    }

    // Interaction tracking
    this.incrInteraction(actor.entityId, target.entityId, "shotsHit");

    if (isDeactivating || target.hitPoints <= 0) {
      // Deactivating hit (0206 or HP ran out from shot power)
      this.handleNukeCancel(actor, target);

      if (isOpponent) actor.deactivatedOpponent++;
      else if (isFriendly) actor.deactivatedTeam++;

      target.lives--;
      this.checkElimination(actor, target, time, false);

      // Award assists (before clearing the window)
      this.awardAssists(target.entityId, actor.entityId);

      this.incrInteraction(
        actor.entityId,
        target.entityId,
        "shotDeactivations",
      );

      target.deactivationCause = "other";
      // State transition handled by state event (emitted by advanceClock or explicit state log)
      // Trigger the state_3 transition now since it coincides with the deactivating event
      this.triggerStateTransition(target, 3, time);
    }

    this.recordSnapshot(actor, eventIndex);
  }

  // 0303 — Missile Destroy Target
  private handle0303(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
    targetHardwareId: string | null,
  ): void {
    actor.missileHits++;
    actor.targetsDestroyed++;
    this.earnSp(actor, 5);
    actor.missiles = Math.max(0, actor.missiles - 1);
    this.recordSnapshot(actor, eventIndex);

    if (targetHardwareId) {
      this.targetDestructions.push({
        time,
        targetHardwareId,
        actorEntityId: actor.entityId,
        method: "missile",
      });
    }
  }

  // 0306 — Missile Hit Player
  private handle0306(
    actor: PlayerSimState,
    target: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    const isOpponent = this.isOpponent(actor, target);
    const isFriendly = this.isSameTeam(actor, target);

    actor.missileHits++;
    target.timesHitByMissile++;
    target.lives -= 2;

    if (isOpponent) {
      actor.missilesHitOpponent++;
      this.earnSp(actor, 2);
    }
    if (isFriendly) {
      actor.missilesHitTeam++;
    }
    if (isOpponent && target.position === POSITION.MEDIC) {
      actor.missilesHitOpponentMedic++;
    }
    if (isFriendly && target.position === POSITION.MEDIC) {
      actor.missilesHitTeamMedic++;
    }

    if (target.state === 2) {
      if (isOpponent) actor.missileResetOpponent++;
      else if (isFriendly) actor.missileResetTeam++;
    }

    this.handleNukeCancel(actor, target);

    if (isOpponent) actor.deactivatedOpponent++;
    else if (isFriendly) actor.deactivatedTeam++;

    this.checkElimination(actor, target, time, false);
    this.awardAssists(target.entityId, actor.entityId);

    this.incrInteraction(actor.entityId, target.entityId, "missileHits");
    actor.missiles = Math.max(0, actor.missiles - 1);

    target.deactivationCause = "other";
    this.triggerStateTransition(target, 3, time);

    this.recordSnapshot(actor, eventIndex);
  }

  // 0400 — Rapid Fire Activate
  private handle0400(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.isRapidFire = true;
    actor.rapidFireStartedAt = time;
    actor.rapidFire++;
    this.spendSp(actor, 10);
    this.recordSnapshot(actor, eventIndex);
  }

  // 0404 — Nuke Activate
  private handle0404(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.isNuking = true;
    actor.nukeActivatedAt = time;
    actor.nukesActivated++;
    this.spendSp(actor, 20);
    this.recordSnapshot(actor, eventIndex);
  }

  // 0405 — Nuke Detonate
  private handle0405(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.isNuking = false;
    actor.nukesDetonated++;

    if (actor.nukeActivatedAt !== null) {
      actor.totalNukeActivationTime += time - actor.nukeActivatedAt;
      actor.nukeActivatedAt = null;
    }

    const opponents = this.getOpposingActivePlayers(actor);

    for (const target of opponents) {
      const livesLost = Math.min(3, target.lives);
      target.lives -= 3;

      actor.livesRemovedByNuke += livesLost;
      if (target.position === POSITION.MEDIC) {
        actor.nukesHitMedic += livesLost;
      }

      this.handleNukeCancel(actor, target);
      if (target.isNuking && this.isOpponent(actor, target)) {
        actor.nukesCanceledByNuke++;
        target.ownNukesCanceledByNuke++;
      }
      this.checkElimination(actor, target, time, true);
      this.awardAssists(target.entityId, actor.entityId);

      target.deactivationCause = "other";
      this.triggerStateTransition(target, 3, time);
    }

    this.recordSnapshot(actor, eventIndex);
  }

  // 0500 — Ammo Resupply
  private handle0500(
    actor: PlayerSimState,
    target: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.shotsFired++;
    actor.shotsHit++;
    actor.resuppliesGiven++;
    target.resuppliesReceivedAmmo++;
    target.receivedAmmoResupplyThisCycle = true;
    target.lastAmmoResuppliedBy = actor.entityId;

    // Double resupply detection
    if (target.receivedLivesResupplyThisCycle) {
      actor.doubleResuppliesGiven++;
      target.doubleResuppliesReceived++;
      const medicId = target.lastLivesResuppliedBy;
      if (medicId) {
        const medic = this.playerStates.get(medicId);
        if (medic) medic.doubleResuppliesGiven++;
      }
    }

    const stats = POSITION_STATS[target.position]!;
    target.shots = Math.min(target.shots + stats.resupplyShots, stats.maxShots);

    // End rapid fire if active
    if (target.isRapidFire && target.rapidFireStartedAt !== null) {
      target.totalRapidTime += time - target.rapidFireStartedAt;
      target.isRapidFire = false;
      target.rapidFireStartedAt = null;
      this.recordSnapshot(target, eventIndex);
    }

    target.deactivationCause = "resupply";
    this.triggerStateTransition(target, 3, time);

    this.recordSnapshot(actor, eventIndex);
  }

  // 0502 — Lives Resupply
  private handle0502(
    actor: PlayerSimState,
    target: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.shotsFired++;
    actor.shotsHit++;
    actor.resuppliesGiven++;
    target.resuppliesReceivedLives++;
    target.receivedLivesResupplyThisCycle = true;
    target.lastLivesResuppliedBy = actor.entityId;

    // Double resupply detection
    if (target.receivedAmmoResupplyThisCycle) {
      actor.doubleResuppliesGiven++;
      target.doubleResuppliesReceived++;
      const ammoId = target.lastAmmoResuppliedBy;
      if (ammoId) {
        const ammoCarrier = this.playerStates.get(ammoId);
        if (ammoCarrier) ammoCarrier.doubleResuppliesGiven++;
      }
    }

    const stats = POSITION_STATS[target.position]!;
    target.lives = Math.min(target.lives + stats.resupplyLives, stats.maxLives);

    target.deactivationCause = "resupply";
    this.triggerStateTransition(target, 3, time);

    this.recordSnapshot(actor, eventIndex);
  }

  // 0500/0502 from beacon — Emergency Resupply (no actor player state)
  private handleEmergencyResupply(
    target: PlayerSimState,
    type: "ammo" | "lives",
    time: number,
    eventIndex: number,
  ): void {
    const stats = POSITION_STATS[target.position]!;
    if (type === "ammo") {
      target.emergencyResuppliesReceivedAmmo++;
      target.shots = Math.min(target.shots + stats.resupplyShots, stats.maxShots);
      if (target.isRapidFire && target.rapidFireStartedAt !== null) {
        target.totalRapidTime += time - target.rapidFireStartedAt;
        target.isRapidFire = false;
        target.rapidFireStartedAt = null;
      }
    } else {
      target.emergencyResuppliesReceivedLives++;
      target.lives = Math.min(target.lives + stats.resupplyLives, stats.maxLives);
    }
    target.deactivationCause = "resupply";
    this.triggerStateTransition(target, 3, time);
    this.recordSnapshot(target, eventIndex);
  }

  // 0510 — Team Ammo Boost
  private handle0510(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.ammoBoost++;
    this.spendSp(actor, 15);

    const stats_actor = POSITION_STATS[actor.position]!;
    this.recordSnapshot(actor, eventIndex);

    for (const teammate of this.getActiveTeammates(actor, time)) {
      const stats = POSITION_STATS[teammate.position]!;
      teammate.shots = Math.min(
        teammate.shots + stats.resupplyShots,
        stats.maxShots,
      );
      this.recordSnapshot(teammate, eventIndex);
    }
    void stats_actor; // suppress unused warning
  }

  // 0512 — Team Lives Boost
  private handle0512(
    actor: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    actor.lifeBoost++;
    this.spendSp(actor, 10);

    this.recordSnapshot(actor, eventIndex);

    for (const teammate of this.getActiveTeammates(actor, time, true)) {
      const stats = POSITION_STATS[teammate.position]!;
      teammate.lives = Math.min(
        teammate.lives + stats.resupplyLives,
        stats.maxLives,
      );
      this.recordSnapshot(teammate, eventIndex);
    }
  }

  // 0600 — Referee Penalty
  private handle0600(
    refereeEntityId: string | null,
    target: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    target.penalties++;

    const penaltyValue = this.parsed.meta.penalty;
    this.penalties.push({
      time,
      refereeEntityId,
      targetEntityId: target.entityId,
      scoreValue: penaltyValue !== 0 ? -Math.abs(penaltyValue) : 0,
    });

    target.deactivationCause = "other";
    this.triggerStateTransition(target, 3, time);
    this.recordSnapshot(target, eventIndex);
  }

  // 0B03 — Base Award (post-elimination target award)
  private handle0B03(
    actor: PlayerSimState,
    eventIndex: number,
    targetHardwareId: string | null,
  ): void {
    actor.targetsDestroyed++;
    // No SP for base awards
    this.recordSnapshot(actor, eventIndex);

    if (targetHardwareId) {
      this.targetDestructions.push({
        time: this.missionEndTime, // base awards are at/near game end
        targetHardwareId,
        actorEntityId: actor.entityId,
        method: "awarded",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // State transition trigger
  // ---------------------------------------------------------------------------

  private triggerStateTransition(
    target: PlayerSimState,
    newState: 0 | 2 | 3,
    time: number,
  ): void {
    // For 2.005+ files, the explicit state log drives all transitions via advanceClock.
    // Action handlers must not trigger transitions — doing so fires at the wrong timestamp
    // when the log's state event is delayed relative to the action event.
    if (this.parsed.playerStateLog.length > 0) return;
    // Pre-2.005 files have no state log; emit a synthetic transition now.
    this.applyExplicitStateTransition(time, target.entityId, newState);
  }

  // ---------------------------------------------------------------------------
  // Result construction
  // ---------------------------------------------------------------------------

  private buildResult(): SimulatedGame {
    // Determine final team scores from entityEnds
    const teamScores = new Map<number, number>();

    for (const end of this.parsed.entityEnds) {
      const entity = this.entityById.get(end.id);
      if (!entity || entity.type !== "player") continue;
      const teamIndex = entity.team;
      teamScores.set(teamIndex, (teamScores.get(teamIndex) ?? 0) + end.score);
    }

    // Determine which teams are eliminated
    const teamEliminated = new Map<number, boolean>();
    for (const [teamIndex] of teamScores) {
      const players = [...this.playerStates.values()].filter(
        (p) => p.teamIndex === teamIndex,
      );
      const allEliminated =
        players.length > 0 && players.every((p) => p.isEliminated);
      teamEliminated.set(teamIndex, allEliminated);
    }

    // Find earliest elimination time (if any team was eliminated)
    let eliminationTime: number | null = null;
    for (const [, eliminated] of teamEliminated) {
      if (eliminated) {
        // Find the timestamp of the last elimination in this team
        for (const ps of this.playerStates.values()) {
          if (ps.isEliminated && ps.eliminatedAt !== null) {
            if (eliminationTime === null || ps.eliminatedAt > eliminationTime) {
              eliminationTime = ps.eliminatedAt;
            }
          }
        }
      }
    }

    // Game outcome
    const anyEliminated = [...teamEliminated.entries()].some(
      ([ti, e]) => e && !this.isNeutralTeam(ti),
    );
    let outcome: "score" | "elimination" | "draw";

    if (anyEliminated) {
      outcome = "elimination";
    } else {
      const scores = [...teamScores.values()];
      const allEqual = scores.every((s) => s === scores[0]);
      outcome = allEqual && scores.length > 1 ? "draw" : "score";
    }

    // Find winning team(s)
    const competingTeamIndices = [...teamScores.keys()].filter(
      (ti) => !this.isNeutralTeam(ti),
    );

    let maxScore = -Infinity;
    for (const ti of competingTeamIndices) {
      if (!teamEliminated.get(ti)) {
        maxScore = Math.max(maxScore, teamScores.get(ti) ?? 0);
      }
    }

    const teams: SimTeam[] = this.parsed.teams.map((team) => {
      if (this.isNeutralTeam(team.index)) {
        return {
          tdfTeamIndex: team.index,
          score: null,
          eliminated: null,
          result: null,
          eliminationBonus: null,
        };
      }

      const score = teamScores.get(team.index) ?? 0;
      const eliminated = teamEliminated.get(team.index) ?? false;

      let result: "win" | "loss" | "draw";
      if (eliminated) {
        result = "loss";
      } else if (outcome === "draw") {
        result = "draw";
      } else {
        result = score === maxScore ? "win" : "loss";
      }

      // Elimination bonus: 10000 if this team won by elimination
      const eliminationBonus =
        outcome === "elimination" && result === "win" ? 10000 : 0;

      return {
        tdfTeamIndex: team.index,
        score,
        eliminated,
        result,
        eliminationBonus,
      };
    });

    return {
      actualDuration: this.missionEndTime - this.missionStartTime,
      outcome,
      eliminationTime,
      teams,
      playerStats: this.playerStates,
      events: this.events,
      targetDestructions: this.targetDestructions,
      penalties: this.penalties,
      interactions: this.interactions,
    };
  }
}

// ---------------------------------------------------------------------------
// Consistency check
// ---------------------------------------------------------------------------

export function runConsistencyCheck(
  playerStats: Map<string, PlayerSimState>,
  sm5StatsById: Map<string, import("./types.js").ParsedSm5Stats>,
): string[] {
  const discrepancies: string[] = [];

  for (const [entityId, ps] of playerStats) {
    const stats = sm5StatsById.get(entityId);
    if (!stats) continue;

    const checks: Array<[string, number, number]> = [
      ["shotsHit", ps.shotsHit, stats.shotsHit],
      ["shotsFired", ps.shotsFired, stats.shotsFired],
      ["timesHit", ps.timesHit, stats.timesZapped],
      ["timesHitByMissile", ps.timesHitByMissile, stats.timesMissiled],
      ["missileHits", ps.missileHits, stats.missileHits],
      ["nukesDetonated", ps.nukesDetonated, stats.nukesDetonated],
      ["nukesActivated", ps.nukesActivated, stats.nukesActivated],
      ["nukesCanceled", ps.nukesCanceled, stats.nukeCancels],
      [
        "shotsHitOpponentMedic",
        ps.shotsHitOpponentMedic + ps.missilesHitOpponentMedic * 2,
        stats.medicHits,
      ],
      [
        "shotsHitTeamMedic",
        ps.shotsHitTeamMedic + ps.missilesHitTeamMedic * 2,
        stats.ownMedicHits,
      ],
      ["nukesHitMedic", ps.nukesHitMedic, stats.medicNukes],
      ["rapidFire", ps.rapidFire, stats.scoutRapid],
      ["lifeBoost", ps.lifeBoost, stats.lifeBoost],
      ["ammoBoost", ps.ammoBoost, stats.ammoBoost],
      ["penalties", ps.penalties, stats.penalties],
      ["teamNukesCanceled", ps.teamNukesCanceled, stats.ownNukeCancels],
      ["shotsHitOpponent", ps.shotsHitOpponent, stats.shotOpponent],
      ["shotsHitTeam", ps.shotsHitTeam, stats.shotTeam],
      ["missilesHitOpponent", ps.missilesHitOpponent, stats.missiledOpponent],
      ["missilesHitTeam", ps.missilesHitTeam, stats.missiledTeam],
    ];

    for (const [field, computed, expected] of checks) {
      if (computed !== expected) {
        discrepancies.push(
          `${entityId} ${field}: computed=${computed} expected=${expected}`,
        );
      }
    }

    // sm5Stats only tracks shot3Hit for scouts
    if (ps.position === POSITION.SCOUT) {
      if (ps.shotsHitOpponent3hit !== stats.shot3Hit) {
        discrepancies.push(
          `${entityId} shotsHitOpponent3hit: computed=${ps.shotsHitOpponent3hit} expected=${stats.shot3Hit}`,
        );
      }
    }

    // Final game_player_state snapshot must match line-7 residual values
    const finalSnapshot = ps.stateSnapshots[ps.stateSnapshots.length - 1];
    if (finalSnapshot) {
      if (finalSnapshot.lives !== stats.livesLeft) {
        discrepancies.push(
          `${entityId} finalSnapshot.lives: computed=${finalSnapshot.lives} expected=${stats.livesLeft}`,
        );
      }
      if (finalSnapshot.shots !== stats.shotsLeft) {
        discrepancies.push(
          `${entityId} finalSnapshot.shots: computed=${finalSnapshot.shots} expected=${stats.shotsLeft}`,
        );
      }
    }
  }

  return discrepancies;
}
