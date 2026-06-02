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

  // Pending boosts for state-3 and state-2 players (radio lag — applied during
  // reconciliation). eventIndex and time record when the 0510/0512 fired so
  // reconciliation can place the boost retroactively at the right point in the
  // state snapshot history.
  private pendingBoosts = new Map<
    string,
    Array<{ type: "lives" | "shots"; amount: number; eventIndex: number; time: number }>
  >();

  // Two-pass shots reference: for each state-3/state-2 player that receives a
  // 0510 boost, the pre-pass (buildShotsReference) records the authoritative
  // shots count at that moment. The main simulation consumes these in order so
  // that pending boost amounts are computed from hardware-correct shots rather
  // than the potentially diverged simulator shots.
  private shotsRefAtBoost = new Map<string, number[]>();
  private shotsRefAtBoostIdx = new Map<string, number>();

  // Mid-game position-change routing: maps external entity IDs to their
  // time-ordered generations (built from parsed.entityRouting).
  private generationRouter = new Map<
    string,
    Array<{ startTime: number; internalId: string }>
  >();

  // Line type 9 pointer (2.005+ only)
  private stateLogPointer = 0;

  // Entity-end pointer — entity-ends are processed in-order during advanceClock
  // so that post-entity-end events don't affect an already-eliminated player.
  private entityEndPointer = 0;

  // Last timestamp at which each entity appears as an actor in the event log.
  // Built once at run() start. Used in checkElimination to detect premature
  // eliminations: if a player still acts after their lives hit 0, the hardware
  // kept them alive and any pending lives boosts should be applied.
  private lastActorEventTime = new Map<string, number>();

  // Per-player sorted lists of lives-changing events (deactivations and
  // resupplies). Both are used together in a forward simulation in
  // checkElimination to compute the exact lives boost needed.
  //   deactivationsReceived: 0206 = 1 life, 0306 = 2 lives, nuke = 3 lives
  //   resuppliesGained: 0502 direct lives resupplies to the player
  private deactivationsReceived = new Map<
    string,
    Array<{ time: number; lives: number }>
  >();
  private resuppliesGained = new Map<
    string,
    Array<{ time: number; lives: number }>
  >();

  // Entity-end time per player, for boost-cap calculations.
  private entityEndTimeById = new Map<string, number>();

  // TDF final lives per player. Surviving players end with livesLeft > 0; this
  // must be added to the deactivation count when computing livesNeeded so we
  // don't eliminate a player who is supposed to survive the game.
  private tdfFinalLives = new Map<string, number>();

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
    // Resolve mid-game position-change generation IDs before any other pass.
    // This rewrites actor/target/entity fields in parsed.events, parsed.scores,
    // parsed.playerStateLog, and parsed.entityEnds so all downstream code sees
    // the correct internal IDs without needing per-call routing logic.
    this.buildGenerationRouting();
    this.resolveGenerationIds();
    this.buildEntityMaps();
    this.initPlayerStates();
    this.initInteractionMap();
    // Sort entity-ends by time so advanceClock can process them in order.
    this.parsed.entityEnds.sort((a, b) => a.time - b.time);
    // Pre-build lookups used by checkElimination.
    for (const end of this.parsed.entityEnds) {
      if (this.playerStates.has(end.id)) {
        this.entityEndTimeById.set(end.id, end.time);
      }
    }
    for (const stats of this.parsed.sm5Stats) {
      if (this.playerStates.has(stats.id)) {
        this.tdfFinalLives.set(stats.id, stats.livesLeft);
      }
    }
    for (const event of this.parsed.events) {
      if (event.actor && this.playerStates.has(event.actor)) {
        const prev = this.lastActorEventTime.get(event.actor) ?? -1;
        if (event.time > prev)
          this.lastActorEventTime.set(event.actor, event.time);
      }
      // Track deactivating hits received per player (0206 = 1 life, 0306 = 2 lives).
      const target = event.target;
      if (target && this.playerStates.has(target)) {
        const livesLost =
          event.type === "0206" || event.type === "0209"
            ? 1
            : event.type === "0306" || event.type === "0308"
              ? 2
              : 0;
        if (livesLost > 0) {
          const arr = this.deactivationsReceived.get(target) ?? [];
          arr.push({ time: event.time, lives: livesLost });
          this.deactivationsReceived.set(target, arr);
        }
        // Track lives gained from 0502 direct lives resupplies; used to offset
        // the deactivation count in the forward simulation so we don't over-apply
        // a pending boost when resupplies between deactivations reduce the need.
        if (event.type === "0502") {
          const ps = this.playerStates.get(target)!;
          const stats = POSITION_STATS[ps.position]!;
          const arr = this.resuppliesGained.get(target) ?? [];
          arr.push({ time: event.time, lives: stats.resupplyLives });
          this.resuppliesGained.set(target, arr);
        }
      }
    }
    // Nukes (0405) have no explicit per-target event in the TDF; detect them by
    // finding state_3 entries in the player state log that occur within 100 ms
    // of a nuke detonation. Count each nuke hit as 3 lives (maximum removal).
    //
    // Two detection passes are required:
    //   Pass 1 — Players who TRANSITION to state_3 at nuke time: their state log
    //            entry falls within 100ms of the nuke.
    //   Pass 2 — Players who are ALREADY in state_3 when the nuke fires: nukes
    //            hit all non-eliminated opponents regardless of current state, so
    //            a player deactivated moments before a second nuke still takes the
    //            hit even though no new state_3 entry appears in the log.
    {
      const nukeDetonations = this.parsed.events.filter((e) => e.type === "0405");
      const nukeEvents = nukeDetonations.map((e) => e.time);

      // Pass 1 — transition-based detection (original logic)
      for (const stateEntry of this.parsed.playerStateLog) {
        if (stateEntry.state !== 3) continue;
        if (!this.playerStates.has(stateEntry.entity)) continue;
        const t = stateEntry.time;
        for (const nukeT of nukeEvents) {
          if (t >= nukeT && t <= nukeT + 100) {
            const arr = this.deactivationsReceived.get(stateEntry.entity) ?? [];
            arr.push({ time: nukeT, lives: 3 });
            this.deactivationsReceived.set(stateEntry.entity, arr);
            break; // one nuke per state_3 entry
          }
        }
      }

      // Pass 2 — already-in-state_3 detection
      // Build a per-player sorted state timeline from section 9.
      const stateTimeline = new Map<string, { time: number; state: number }[]>();
      for (const entry of this.parsed.playerStateLog) {
        if (!this.playerStates.has(entry.entity)) continue;
        const arr = stateTimeline.get(entry.entity) ?? [];
        arr.push(entry);
        stateTimeline.set(entry.entity, arr);
      }

      for (const nukeEvent of nukeDetonations) {
        const nukeT = nukeEvent.time;
        const nukeActor = nukeEvent.actor
          ? this.playerStates.get(nukeEvent.actor)
          : null;
        if (!nukeActor) continue;

        for (const [entityId, ps] of this.playerStates) {
          if (ps.teamIndex === nukeActor.teamIndex) continue; // skip same team

          const timeline = stateTimeline.get(entityId);
          if (!timeline) continue;

          // Was this player already in state_3 strictly before the nuke?
          const lastBefore = [...timeline]
            .reverse()
            .find((e) => e.time < nukeT);
          if (!lastBefore || lastBefore.state !== 3) continue;

          // Skip if Pass 1 already caught a state_3 transition at this nuke time.
          const caughtByPass1 = timeline.some(
            (e) => e.state === 3 && e.time >= nukeT && e.time <= nukeT + 100,
          );
          if (caughtByPass1) continue;

          const arr = this.deactivationsReceived.get(entityId) ?? [];
          arr.push({ time: nukeT, lives: 3 });
          this.deactivationsReceived.set(entityId, arr);
        }
      }

      // Keep all arrays sorted by time.
      for (const arr of this.deactivationsReceived.values()) {
        arr.sort((a, b) => a.time - b.time);
      }
    }

    // Build authoritative shots reference before the main loop so that
    // pending boost amounts for state-3 players use hardware-correct shots.
    this.buildShotsReference();

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
      // Non-player actors (warbots, emergency-resupply beacons) are routed to
      // actorHardwareId so the ingester can look them up in sm5_game_target.
      const isActorNonPlayer = actor ? !this.playerStates.has(actor) : false;

      this.events.push({
        time: event.time,
        eventType: event.type,
        actorEntityId: isActorNonPlayer ? null : (actor ?? null),
        actorHardwareId: isActorNonPlayer ? (actor ?? null) : null,
        targetEntityId: isTargetEntity ? null : (target ?? null),
        targetHardwareId: isTargetEntity ? (target ?? null) : null,
        description: event.description,
        isSynthetic: false,
      });
      this.currentEventIndex = this.events.length - 1;

      this.handleEvent(event.time, event.type, actor, target);
    }

    this.reconcilePendingBoosts();
    this.applyEntityEnds();

    return this.buildResult();
  }

  // ---------------------------------------------------------------------------
  // Post-simulation reconciliation and entity-end processing
  // ---------------------------------------------------------------------------

  private reconcilePendingBoosts(): void {
    const sm5ById = new Map(this.parsed.sm5Stats.map((s) => [s.id, s]));

    for (const [entityId, ps] of this.playerStates) {
      const stats = sm5ById.get(entityId);
      if (!stats) continue;
      const boosts = this.pendingBoosts.get(entityId);
      if (!boosts?.length) continue;

      // Lives: apply earliest-first and patch the final snapshot only (replay
      // accuracy for lives during downtime is handled by checkElimination).
      let livesGap = stats.livesLeft - ps.lives;
      if (livesGap > 0) {
        for (const b of boosts.filter((b) => b.type === "lives")) {
          const apply = Math.min(b.amount, livesGap);
          ps.lives += apply;
          livesGap -= apply;
          if (livesGap === 0) break;
        }
      }
      const finalSnap = ps.stateSnapshots[ps.stateSnapshots.length - 1];
      if (finalSnap) {
        finalSnap.lives = ps.lives;
      }

      // Shots: apply latest-first and retroactively propagate through all
      // snapshots from each boost's eventIndex. The most recent pending boost is
      // most likely to have applied — it is closest to a state transition (either
      // state_2 reactivation or the trailing edge of a state_3 entry window).
      const shotBoosts = boosts
        .filter((b) => b.type === "shots")
        .sort((a, b) => b.eventIndex - a.eventIndex);

      let shotsGap = stats.shotsLeft - ps.shots;
      for (const b of shotBoosts) {
        if (shotsGap <= 0) break;
        const apply = Math.min(b.amount, shotsGap);
        this.applyRetroactiveShotsBoost(ps, b.eventIndex, apply);
        shotsGap -= apply;
      }
    }
  }

  // Add `delta` shots to every state snapshot at or after `fromEventIndex` and
  // to ps.shots, capped at maxShots. Used by reconcilePendingBoosts to place a
  // resolved pending boost at the correct point in the replay history.
  private applyRetroactiveShotsBoost(
    ps: PlayerSimState,
    fromEventIndex: number,
    delta: number,
  ): void {
    const max = POSITION_STATS[ps.position]!.maxShots;
    for (const snap of ps.stateSnapshots) {
      if (snap.eventIndex >= fromEventIndex) {
        snap.shots = Math.min(snap.shots + delta, max);
      }
    }
    ps.shots = Math.min(ps.shots + delta, max);
  }

  private applyEntityEnds(): void {
    for (const end of this.parsed.entityEnds) {
      const ps = this.playerStates.get(end.id);
      if (!ps) continue;

      if (end.exitType === "04") {
        // Eliminated — record if lives were > 0 so the consistency check can flag it,
        // then zero out lives so the DB receives the correct value.
        if (ps.lives > 0) {
          ps.entityEndForcedLives = ps.lives;
        }
        ps.lives = 0;
        ps.isEliminated = true;
        if (ps.eliminatedAt === null) ps.eliminatedAt = end.time;
      } else if (end.exitType === "01" || end.exitType === "17") {
        // Kicked mid-game. TDF livesLeft records what they had at kick time —
        // it may be 0 (kicked just as they were eliminated) or positive (kicked
        // while still alive). Set the final snapshot directly to TDF livesLeft
        // so the consistency check trivially passes, then mark out-of-game.
        const tdfLives = this.tdfFinalLives.get(end.id) ?? 0;
        ps.lives = tdfLives;
        ps.isEliminated = true;
        if (ps.eliminatedAt === null) ps.eliminatedAt = end.time;
        const kickSnap = ps.stateSnapshots[ps.stateSnapshots.length - 1];
        if (kickSnap) kickSnap.lives = tdfLives;
        continue;
      }

      // Update the final snapshot so the DB gets the corrected lives value.
      const finalSnap = ps.stateSnapshots[ps.stateSnapshots.length - 1];
      if (finalSnap && ps.lives !== finalSnap.lives) {
        finalSnap.lives = ps.lives;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pre-pass: authoritative shots reference for pending boost amounts
  // ---------------------------------------------------------------------------

  // Builds shotsRefAtBoost: for each state-3 player that would receive a
  // pending shots boost from a 0510 event, records the hardware-correct shots
  // count at that moment. The main simulation consumes these in order inside
  // handle0510 so that boost amounts aren't computed from diverged simulator shots.
  //
  // Only runs for 2.005+ files (explicit playerStateLog). Pre-2.005 files use
  // synthetic 4-second transitions that would require full re-simulation here;
  // they don't exhibit the shots-divergence failure so the fallback (teammate.shots)
  // is safe for them.
  private buildShotsReference(): void {
    if (this.parsed.playerStateLog.length === 0) return;

    const shots = new Map<string, number>();
    const stateRef = new Map<string, 0 | 2 | 3>();
    const pendingRef = new Map<string, number>();
    const eliminatedRef = new Set<string>();

    for (const [entityId, ps] of this.playerStates) {
      shots.set(entityId, POSITION_STATS[ps.position]!.initialShots);
      stateRef.set(entityId, 0);
    }

    // Apply accumulated pending shots when leaving the down/vulnerable cycle.
    // Triggered on state_3 → state_2 and state_2 → state_0 so that boosts
    // accumulated during either phase are reflected in the correct baseline for
    // subsequent 0510 events.
    const applyPending = (entityId: string): void => {
      const pending = pendingRef.get(entityId) ?? 0;
      if (pending <= 0) return;
      const ps = this.playerStates.get(entityId);
      if (!ps) return;
      const max = POSITION_STATS[ps.position]!.maxShots;
      shots.set(entityId, Math.min((shots.get(entityId) ?? 0) + pending, max));
      pendingRef.set(entityId, 0);
    };

    let stateLogIdx = 0;
    let entityEndIdx = 0;

    for (const event of this.parsed.events) {
      // Entity-ends before state transitions — mirrors advanceClock ordering.
      while (
        entityEndIdx < this.parsed.entityEnds.length &&
        this.parsed.entityEnds[entityEndIdx]!.time <= event.time
      ) {
        const end = this.parsed.entityEnds[entityEndIdx++]!;
        if (this.playerStates.has(end.id)) eliminatedRef.add(end.id);
      }

      // State transitions from playerStateLog — mirrors advanceClock.
      while (
        stateLogIdx < this.parsed.playerStateLog.length &&
        this.parsed.playerStateLog[stateLogIdx]!.time <= event.time
      ) {
        const entry = this.parsed.playerStateLog[stateLogIdx++]!;
        const id = entry.entity;
        if (!this.playerStates.has(id)) continue;
        const oldState = stateRef.get(id) ?? 0;
        const newState = entry.state as 0 | 2 | 3;
        if (
          (oldState === 3 && newState === 2) ||
          (oldState === 2 && newState === 0)
        ) {
          applyPending(id);
        }
        stateRef.set(id, newState);
      }

      const actorId = event.actor;
      const targetId = event.target;
      const actorPs = actorId ? this.playerStates.get(actorId) : null;
      const targetPs = targetId ? this.playerStates.get(targetId) : null;

      switch (event.type) {
        case "0201":
        case "0202":
        case "0203":
        case "0204":
        case "0205":
        case "0206":
          if (actorPs && actorPs.position !== POSITION.AMMO) {
            shots.set(actorId!, (shots.get(actorId!) ?? 0) - 1);
          }
          break;

        case "0500":
          if (targetPs) {
            const stats = POSITION_STATS[targetPs.position]!;
            shots.set(
              targetId!,
              Math.min(
                (shots.get(targetId!) ?? 0) + stats.resupplyShots,
                stats.maxShots,
              ),
            );
          }
          break;

        case "0510":
          if (actorPs) {
            for (const [entityId, ps] of this.playerStates) {
              if (entityId === actorId) continue;
              if (ps.teamIndex !== actorPs.teamIndex) continue;
              if (eliminatedRef.has(entityId)) continue;
              const state = stateRef.get(entityId) ?? 0;
              const stats = POSITION_STATS[ps.position]!;
              const current = shots.get(entityId) ?? 0;
              if (state === 0) {
                shots.set(
                  entityId,
                  Math.min(current + stats.resupplyShots, stats.maxShots),
                );
              } else if (state === 3 || state === 2) {
                // Record the authoritative shots count for this boost occurrence.
                const list = this.shotsRefAtBoost.get(entityId) ?? [];
                list.push(current);
                this.shotsRefAtBoost.set(entityId, list);
                // Accumulate the pending boost so the next 0510 in the same
                // state_3/state_2 period uses the post-boost shots as its baseline.
                const boost = Math.min(
                  stats.resupplyShots,
                  stats.maxShots - current,
                );
                if (boost > 0) {
                  pendingRef.set(
                    entityId,
                    (pendingRef.get(entityId) ?? 0) + boost,
                  );
                }
              }
            }
          }
          break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Generation routing — mid-game position changes
  // ---------------------------------------------------------------------------

  private buildGenerationRouting(): void {
    for (const route of this.parsed.entityRouting) {
      this.generationRouter.set(route.externalId, route.generations);
    }
  }

  // Returns the internal entity ID active at the given timestamp.
  // Falls through to the original ID when no routing entry exists.
  private resolveAtTime(externalId: string, time: number): string {
    const gens = this.generationRouter.get(externalId);
    if (!gens) return externalId;
    let result = gens[0]!.internalId;
    for (const gen of gens) {
      if (gen.startTime <= time) result = gen.internalId;
    }
    return result;
  }

  // Returns the internal entity ID for the Nth occurrence of externalId in
  // document order (used for entity-ends and sm5Stats, which can't be routed
  // by timestamp because they may appear after the next generation starts).
  private resolveByOrder(externalId: string, orderIndex: number): string {
    const gens = this.generationRouter.get(externalId);
    if (!gens) return externalId;
    return gens[Math.min(orderIndex, gens.length - 1)]!.internalId;
  }

  // Rewrites actor/target/entity fields in all parsed data collections so every
  // downstream pass works with internal (generation-disambiguated) IDs without
  // needing per-call routing logic.
  private resolveGenerationIds(): void {
    if (this.generationRouter.size === 0) return;

    for (const event of this.parsed.events) {
      if (event.actor && this.generationRouter.has(event.actor)) {
        event.actor = this.resolveAtTime(event.actor, event.time);
      }
      if (event.target && this.generationRouter.has(event.target)) {
        event.target = this.resolveAtTime(event.target, event.time);
      }
    }

    for (const score of this.parsed.scores) {
      if (this.generationRouter.has(score.entity)) {
        score.entity = this.resolveAtTime(score.entity, score.time);
      }
    }

    for (const entry of this.parsed.playerStateLog) {
      if (this.generationRouter.has(entry.entity)) {
        entry.entity = this.resolveAtTime(entry.entity, entry.time);
      }
    }

    // Entity-ends are matched by order, not time, because they can arrive after
    // the next generation has already started.
    const orderCount = new Map<string, number>();
    for (const end of this.parsed.entityEnds) {
      if (!this.generationRouter.has(end.id)) continue;
      const n = orderCount.get(end.id) ?? 0;
      orderCount.set(end.id, n + 1);
      end.id = this.resolveByOrder(end.id, n);
    }
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
        missilesHitOpponentMedicLives: 0,
        missilesHitTeamMedicLives: 0,
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
        phantomDeactivations: 0,
        entityEndForcedLives: null,
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
    // Process entity-end (line type 6) events before game events at the same
    // timestamp, so that post-entity-end events don't affect an eliminated player.
    while (
      this.entityEndPointer < this.parsed.entityEnds.length &&
      this.parsed.entityEnds[this.entityEndPointer]!.time <= T
    ) {
      this.applySingleEntityEnd(this.parsed.entityEnds[this.entityEndPointer]!);
      this.entityEndPointer++;
    }

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

  private applySingleEntityEnd(end: {
    time: number;
    id: string;
    exitType: string;
    score: number;
  }): void {
    const ps = this.playerStates.get(end.id);
    if (!ps) return;

    if (end.exitType === "04") {
      // Only flag a forced-lives discrepancy when the player was NOT already
      // eliminated. A prior exitType=01 (kicked/reset) marks isEliminated=true
      // without zeroing lives; a subsequent exitType=04 is hardware cleanup and
      // the positive lives balance is expected, not a simulation error.
      if (ps.lives > 0 && !ps.isEliminated) {
        ps.entityEndForcedLives = ps.lives;
      }
      ps.lives = 0;
      ps.isEliminated = true;
      if (ps.eliminatedAt === null) ps.eliminatedAt = end.time;
    } else if (end.exitType === "01" || end.exitType === "17") {
      // Kicked mid-game — mark out-of-game but do NOT zero lives. The TDF
      // livesLeft records the lives they had at kick time (a positive number),
      // so zeroing would produce a spurious finalSnapshot.lives discrepancy.
      // The isEliminated flag is sufficient to exclude them from further events.
      ps.isEliminated = true;
      if (ps.eliminatedAt === null) ps.eliminatedAt = end.time;
      // Skip the final-snapshot update: the snapshot already shows the live
      // simulation value, which should match TDF livesLeft.
      return;
    }

    const finalSnap = ps.stateSnapshots[ps.stateSnapshots.length - 1];
    if (finalSnap && ps.lives !== finalSnap.lives) {
      finalSnap.lives = ps.lives;
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
      actorHardwareId: null,
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

  private getActiveTeammates(ps: PlayerSimState): PlayerSimState[] {
    return this.getTeammates(ps).filter((p) => p.state === 0);
  }

  private recordPendingBoost(
    entityId: string,
    type: "lives" | "shots",
    amount: number,
    eventIndex: number,
    time: number,
  ): void {
    if (amount <= 0) return;
    const arr = this.pendingBoosts.get(entityId) ?? [];
    arr.push({ type, amount, eventIndex, time });
    this.pendingBoosts.set(entityId, arr);
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
    actor: PlayerSimState | null,
    target: PlayerSimState,
    time: number,
    isNuke: boolean,
  ): void {
    if (target.lives > 0) return;
    if (target.isEliminated) return;

    // If the player still appears as an actor after this timestamp, the hardware
    // kept them alive — our lives count is wrong. Apply any pending lives boosts
    // to correct it. This handles resupply-during-state-3 radio lag: the boost
    // was recorded but not yet applied, so lives hit 0 prematurely.
    //
    // Cap the boost to the number of lives the player actually needs: count the
    // deactivating hits (0206 = 1 life, 0306 = 2 lives) they receive between now
    // and their entity-end. Applying only that many lives prevents over-inflation
    // that would cause entityEndForcedLives > 0.
    const lastActor = this.lastActorEventTime.get(target.entityId) ?? -1;
    if (lastActor > time) {
      const boosts = this.pendingBoosts.get(target.entityId);
      if (boosts?.length) {
        const entityEndT =
          this.entityEndTimeById.get(target.entityId) ?? Infinity;
        const tdfFinalLives = this.tdfFinalLives.get(target.entityId) ?? 0;
        const deactivations =
          this.deactivationsReceived.get(target.entityId) ?? [];
        const resupplies = this.resuppliesGained.get(target.entityId) ?? [];

        // Forward-simulate the player's lives from the rescue point to entity-end,
        // merging deactivations (negative) and resupplies (positive) in time order.
        // livesNeeded = minimum initial boost to (a) never go below 0 and (b) end
        // with at least tdfFinalLives. This correctly accounts for resupplies
        // between deactivations that reduce the actual boost required.
        const futureEvents: Array<{ time: number; delta: number }> = [
          ...deactivations
            .filter((d) => d.time > time && d.time <= entityEndT)
            .map((d) => ({ time: d.time, delta: -d.lives })),
          ...resupplies
            .filter((r) => r.time > time && r.time <= entityEndT)
            .map((r) => ({ time: r.time, delta: r.lives })),
        ].sort((a, b) => a.time - b.time);

        let balance = 0;
        let minBalance = 0;
        for (const ev of futureEvents) {
          balance += ev.delta;
          if (balance < minBalance) minBalance = balance;
        }
        // -minBalance = lives needed to keep balance ≥ 0 throughout.
        // tdfFinalLives - balance = extra lives to reach target at game end.
        let livesNeeded = Math.max(
          0,
          Math.max(-minBalance, tdfFinalLives - balance),
        );
        // If the formula says 0 but there are still future events, the player
        // needs at least 1 life to stay alive long enough to receive the next
        // resupply (lives=0 in our simulator triggers immediate elimination,
        // blocking receipt of any upcoming resupply that would restore them).
        if (livesNeeded === 0 && futureEvents.length > 0) livesNeeded = 1;

        if (livesNeeded > 0) {
          const stats = POSITION_STATS[target.position]!;
          let budget = livesNeeded;
          const livesBoosts = boosts.filter((b) => b.type === "lives");
          // Track unconsumed lives — double-resupply events can record multiple
          // pending boosts; only consume what we need and leave the rest for
          // reconcilePendingBoosts so they don't get silently discarded.
          const leftoverLivesBoosts: Array<{
            type: "lives" | "shots";
            amount: number;
            eventIndex: number;
            time: number;
          }> = [];
          for (const boost of livesBoosts) {
            if (budget <= 0) {
              leftoverLivesBoosts.push(boost);
              continue;
            }
            const apply = Math.min(boost.amount, budget);
            target.lives = Math.min(target.lives + apply, stats.maxLives);
            budget -= apply;
            if (boost.amount > apply) {
              leftoverLivesBoosts.push({
                type: "lives",
                amount: boost.amount - apply,
                eventIndex: boost.eventIndex,
                time: boost.time,
              });
            }
          }
          // Keep shots boosts and any unconsumed/partial lives boosts.
          const remaining = [
            ...boosts.filter((b) => b.type !== "lives"),
            ...leftoverLivesBoosts,
          ];
          if (remaining.length > 0) {
            this.pendingBoosts.set(target.entityId, remaining);
          } else {
            this.pendingBoosts.delete(target.entityId);
          }
          if (target.lives > 0) return; // boost rescued the player
        }
      }
    }

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

    if (actor) {
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
    actor: PlayerSimState | null,
    target: PlayerSimState,
  ): void {
    if (!target.isNuking) return;

    // Clear the nuke state here so this is the single authoritative place.
    // applyStateTransition must NOT clear it: for 2.005+ files advanceClock
    // processes section 9 state_3 entries before the event handler runs, so
    // clearing isNuking there causes the event handler's handleNukeCancel call
    // to miss the active nuke (same-timestamp race condition).
    if (target.nukeActivatedAt !== null) {
      target.totalNukeActivationTime += 0; // activation time up to cancel not tracked separately
    }
    target.isNuking = false;
    target.nukeActivatedAt = null;

    if (actor) {
      // Determine relationship between actor and the COMMANDER target
      if (this.isOpponent(actor, target)) {
        // Actor cancelled an enemy nuke — good play
        actor.nukesCanceled++;
      } else if (this.isSameTeam(actor, target)) {
        // Actor accidentally cancelled a friendly nuke — shame
        actor.teamNukesCanceled++;
      }
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
      case "0209": // warbot deactivation — deducts 1 life but does not count as timesHit
        if (target) this.handle0209(target, time, eventIndex);
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
      case "0301": // Missile Gen Miss — missile consumed, no hit stats
      case "0304": // Missile Miss — missile consumed, no hit stats
        if (actor) actor.missiles = Math.max(0, actor.missiles - 1);
        break;
      case "0303":
        if (actor) this.handle0303(actor, time, eventIndex, targetId);
        break;
      case "0306": // Missile OppDown — deactivates opponent
      case "0308": // Missile OwnDown — deactivates teammate (same logic, isFriendly flag handles team tracking)
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
        else if (!actor && target)
          this.handleEmergencyResupply(target, "ammo", time, eventIndex);
        break;
      case "0502":
        if (actor && target) this.handle0502(actor, target, time, eventIndex);
        else if (!actor && target)
          this.handleEmergencyResupply(target, "lives", time, eventIndex);
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
      case "0B00":
        if (actor) this.handle0B00(actor, eventIndex);
        break;
      case "0B03":
        if (actor) this.handle0B03(actor, eventIndex, targetId);
        break;
      // 0300, 0900, 0902 — no state changes, skip
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
  private handle0201(actor: PlayerSimState, eventIndex: number): void {
    if (actor.position !== POSITION.AMMO) actor.shots--;
    actor.shotsFired++;
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid++;
    }
    this.recordSnapshot(actor, eventIndex);
  }

  // 0209 — Warbot Deactivation
  // Fired by a non-player warbot entity; deducts 1 life like 0206 but is NOT
  // counted in the TDF's timesZapped stat and has no actor playerState.
  private handle0209(
    target: PlayerSimState,
    time: number,
    eventIndex: number,
  ): void {
    if (target.isEliminated) return;
    this.handleNukeCancel(null, target);
    target.lives--;
    this.checkElimination(null, target, time, false);
    target.deactivationCause = "other";
    this.triggerStateTransition(target, 3, time);
    if (target.state === 3 && !target.isEliminated) {
      this.recordSnapshot(target, eventIndex);
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
    // Don't modify HP if target is already in state 3 — they're in the penalty
    // box with HP already reset; a simultaneous/subsequent 0206 still deducts a
    // life (game system confirms with score events) but must not corrupt HP.
    if (target.state !== 3) {
      target.hitPoints -= stats.shotPower;
    }

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

    // Once eliminated, state transitions are blocked so HP never resets. Every
    // subsequent hit would see HP ≤ 0 and fire false phantom deactivations.
    // Skip the deactivation block entirely for already-eliminated targets.
    if (!target.isEliminated && (isDeactivating || target.hitPoints <= 0)) {
      // Track HP reaching 0 on a non-deactivating event — TDF says 0205 but HP
      // arithmetic says the player should be down. Flagged in consistency check.
      if (!isDeactivating && target.hitPoints <= 0) {
        target.phantomDeactivations++;
      }
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
      // If target was already in state 3 (simultaneous 0206 while in penalty),
      // triggerStateTransition is a no-op so no snapshot was recorded — do it here.
      // Skip if eliminated: checkElimination already recorded the snapshot.
      if (target.state === 3 && !target.isEliminated) {
        this.recordSnapshot(target, eventIndex);
      }
    } else {
      this.recordSnapshot(target, eventIndex);
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
    // Compute actual lives removed before decrementing — a missile removes 2
    // lives, but if the target only has 1 life the actual removal is 1. TDF
    // medicHits tracks damage dealt (not hit count), so we record both.
    const livesRemoved = Math.min(2, Math.max(0, target.lives));
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
      actor.missilesHitOpponentMedicLives += livesRemoved;
    }
    if (isFriendly && target.position === POSITION.MEDIC) {
      actor.missilesHitTeamMedic++;
      actor.missilesHitTeamMedicLives += livesRemoved;
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
      target.lives -= livesLost;

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

    this.handleNukeCancel(actor, target);
    target.deactivationCause = "resupply";
    this.triggerStateTransition(target, 3, time);
    // For 2.005+ files, triggerStateTransition is a no-op driven by section 9.
    // If the target is already in state_3 (resupplied while down), no upcoming
    // section 9 transition may occur before game end — capture the shots update now.
    if (target.state === 3 && !target.isEliminated) {
      this.recordSnapshot(target, eventIndex);
    }

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

    this.handleNukeCancel(actor, target);
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
      target.shots = Math.min(
        target.shots + stats.resupplyShots,
        stats.maxShots,
      );
      if (target.isRapidFire && target.rapidFireStartedAt !== null) {
        target.totalRapidTime += time - target.rapidFireStartedAt;
        target.isRapidFire = false;
        target.rapidFireStartedAt = null;
      }
    } else {
      target.emergencyResuppliesReceivedLives++;
      target.lives = Math.min(
        target.lives + stats.resupplyLives,
        stats.maxLives,
      );
    }
    this.handleNukeCancel(null, target);
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

    for (const teammate of this.getActiveTeammates(actor)) {
      // Skip players whose hardware hadn't registered yet when the boost fired.
      if ((this.entityById.get(teammate.entityId)?.time ?? 0) > time) continue;
      const stats = POSITION_STATS[teammate.position]!;
      teammate.shots = Math.min(
        teammate.shots + stats.resupplyShots,
        stats.maxShots,
      );
      this.recordSnapshot(teammate, eventIndex);
    }
    // Record pending shot boosts for state-3 and state-2 teammates (radio lag —
    // resolved retroactively at game end). Use the pre-pass reference shots rather
    // than teammate.shots: un-applied pending boosts from earlier state-3/state-2
    // cycles cause teammate.shots to diverge from the hardware value, producing
    // incorrect boost amounts that accumulate into a shots discrepancy at game end.
    for (const teammate of this.getTeammates(actor)) {
      if (teammate.state !== 3 && teammate.state !== 2) continue;
      if ((this.entityById.get(teammate.entityId)?.time ?? 0) > time) continue;
      const stats = POSITION_STATS[teammate.position]!;
      const refList = this.shotsRefAtBoost.get(teammate.entityId);
      const refIdx = this.shotsRefAtBoostIdx.get(teammate.entityId) ?? 0;
      const refShots = refList?.[refIdx] ?? teammate.shots;
      if (refList !== undefined && refIdx < refList.length) {
        this.shotsRefAtBoostIdx.set(teammate.entityId, refIdx + 1);
      }
      this.recordPendingBoost(
        teammate.entityId,
        "shots",
        Math.min(stats.resupplyShots, stats.maxShots - refShots),
        eventIndex,
        time,
      );
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

    for (const teammate of this.getActiveTeammates(actor)) {
      if ((this.entityById.get(teammate.entityId)?.time ?? 0) > time) continue;
      const stats = POSITION_STATS[teammate.position]!;
      teammate.lives = Math.min(
        teammate.lives + stats.resupplyLives,
        stats.maxLives,
      );
      this.recordSnapshot(teammate, eventIndex);
    }
    // Record pending life boosts for state-3 and state-2 teammates (radio lag — resolved later)
    for (const teammate of this.getTeammates(actor)) {
      if (teammate.state !== 3 && teammate.state !== 2) continue;
      if ((this.entityById.get(teammate.entityId)?.time ?? 0) > time) continue;
      const stats = POSITION_STATS[teammate.position]!;
      this.recordPendingBoost(
        teammate.entityId,
        "lives",
        Math.min(stats.resupplyLives, stats.maxLives - teammate.lives),
        eventIndex,
        time,
      );
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

    this.handleNukeCancel(null, target);
    target.deactivationCause = "other";
    this.triggerStateTransition(target, 3, time);
    this.recordSnapshot(target, eventIndex);
  }

  // 0B00 — Beacon Claim
  // Requires 3 shots at the beacon to trigger; counted in TDF section 7 as 3
  // shots fired and 3 hits. Not counted as opponent/team hits (beacon is neutral).
  private handle0B00(actor: PlayerSimState, eventIndex: number): void {
    actor.shotsFired += 3;
    actor.shotsHit += 3;
    if (actor.position !== POSITION.AMMO) {
      actor.shots = Math.max(0, actor.shots - 3);
    }
    if (actor.isRapidFire) {
      actor.shotsFiredDuringRapid += 3;
      actor.shotsHitDuringRapid += 3;
    }
    this.recordSnapshot(actor, eventIndex);
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
    // An aborted game has no mission-end event (0101) and every entity was
    // kicked mid-game (exitType "01" or "17") rather than completing normally.
    const isAborted =
      this.missionEndTime === 0 &&
      this.parsed.entityEnds.length > 0 &&
      this.parsed.entityEnds.every(
        (e) => e.exitType === "01" || e.exitType === "17",
      );

    const anyEliminated = [...teamEliminated.entries()].some(
      ([ti, e]) => e && !this.isNeutralTeam(ti),
    );
    let outcome: "score" | "elimination" | "draw" | "aborted";

    if (isAborted) {
      outcome = "aborted";
    } else if (anyEliminated) {
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

export interface ConsistencyResult {
  discrepancies: string[];
  ghostShots: Array<{ entityId: string; count: number }>;
}

export function runConsistencyCheck(
  playerStats: Map<string, PlayerSimState>,
  sm5StatsById: Map<string, import("./types.js").ParsedSm5Stats>,
): ConsistencyResult {
  const discrepancies: string[] = [];
  const ghostShots: Array<{ entityId: string; count: number }> = [];

  for (const [entityId, ps] of playerStats) {
    const stats = sm5StatsById.get(entityId);
    if (!stats) continue;

    // Detect ghost shots: shots on non-player hardware targets that are counted
    // in TDF section 7 but produce no section 4 event and no score change.
    // Signature: fired delta equals hit delta (ghost shots always hit), and
    // opponent/team hit counts match exactly (discrepancy is purely in target hits).
    const dFired = stats.shotsFired - ps.shotsFired;
    const dHit = stats.shotsHit - ps.shotsHit;
    const isGhostShot =
      dFired > 0 &&
      dFired === dHit &&
      ps.shotsHitOpponent === stats.shotOpponent &&
      ps.shotsHitTeam === stats.shotTeam;

    if (isGhostShot) ghostShots.push({ entityId, count: dFired });

    const checks: Array<[string, number, number]> = [
      ...(!isGhostShot ? ([
        ["shotsHit", ps.shotsHit, stats.shotsHit],
        ["shotsFired", ps.shotsFired, stats.shotsFired],
      ] as Array<[string, number, number]>) : []),
      ["timesHit", ps.timesHit, stats.timesZapped],
      ["timesHitByMissile", ps.timesHitByMissile, stats.timesMissiled],
      ["missileHits", ps.missileHits, stats.missileHits],
      ["nukesDetonated", ps.nukesDetonated, stats.nukesDetonated],
      ["nukesActivated", ps.nukesActivated, stats.nukesActivated],
      ["nukesCanceled", ps.nukesCanceled, stats.nukeCancels],
      [
        "shotsHitOpponentMedic",
        ps.shotsHitOpponentMedic + ps.missilesHitOpponentMedicLives,
        stats.medicHits,
      ],
      [
        "shotsHitTeamMedic",
        ps.shotsHitTeamMedic + ps.missilesHitTeamMedicLives,
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
      // Ghost shots consume ammo the simulator never sees. The remaining-shots
      // discrepancy is bounded by [0, dFired]: 0 if the player was resupplied
      // to max after the ghost shots, dFired if they were not resupplied at all,
      // and anywhere in between if resupplied partially.
      const shotsOk =
        finalSnapshot.shots === stats.shotsLeft ||
        (isGhostShot &&
          finalSnapshot.shots >= stats.shotsLeft &&
          finalSnapshot.shots <= stats.shotsLeft + dFired);
      if (!shotsOk) {
        discrepancies.push(
          `${entityId} finalSnapshot.shots: computed=${finalSnapshot.shots} expected=${stats.shotsLeft}`,
        );
      }
    }

    // Entity-end exitType "04" forced lives to 0 — simulator missed life losses
    if (ps.entityEndForcedLives !== null) {
      discrepancies.push(
        `${entityId} entity_end eliminated: simulator computed ${ps.entityEndForcedLives} lives but player was eliminated (exitType 04)`,
      );
    }

    // HP reached 0 from a non-deactivating event (0205) — phantom lives deducted
    if (ps.phantomDeactivations > 0) {
      discrepancies.push(
        `${entityId} phantomDeactivations: ${ps.phantomDeactivations} (HP reached 0 on a non-deactivating event)`,
      );
    }
  }

  return { discrepancies, ghostShots };
}
