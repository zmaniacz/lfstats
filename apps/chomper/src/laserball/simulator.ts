// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { ParsedTdf, ParsedEvent, ParsedPlayerState } from "../types.js";
import {
  LB_CONF,
  LB_EVENT,
  LB_MIN_PLAYTIME_MS,
  type LbInteraction,
  type LbPlayerSimState,
  type LbSimEvent,
  type LbSimTeam,
  type SimulatedLbGame,
} from "./types.js";

// Codes that are not stored in the replay event log (too high-volume / no value).
const REPLAY_EXCLUDED = new Set<string>([LB_EVENT.MISS, "0900", "0901", "0902"]);

function newPlayer(
  entityId: string,
  teamIndex: number,
  callsign: string,
  battlesuit: string | null,
) {
  const p: LbPlayerSimState = {
    entityId,
    teamIndex,
    callsign,
    battlesuit,
    goals: 0,
    bigGoals: 0,
    futileAttacks: 0,
    badAttacksFc: 0,
    futileAttacksGoal: 0,
    assists1: 0,
    assists2: 0,
    clearAssists1: 0,
    clearAssists2: 0,
    passesDone: 0,
    passesReceived: 0,
    passOverOpponent: 0,
    turnoverPass: 0,
    clearsDone: 0,
    clearsReceived: 0,
    clutchSaves: 0,
    failedClearsCalc: 0,
    failedClearsRaw: 0,
    inactiveClearPenalty: 0,
    noClearGoal: 0,
    noClearBlocks: 0,
    defenseScore: 0,
    stealsDone: 0,
    stealsReceived: 0,
    blocksDone: 0,
    blocksReceived: 0,
    blocksWithBall: 0,
    blocksBeforeGoal: 0,
    resetBlocksDone: 0,
    resetBlocksReceived: 0,
    blockSerieMax: 0,
    bigMid: 0,
    resetPoint: 0,
    possessionTimeMs: 0,
    misses: 0,
    targetResetSelf: 0,
    targetResetPlayer: 0,
    startRoundBall: 0,
    startRoundLoss: 0,
    ballTimeout: 0,
    state0: 0,
    state2: 0,
    state3: 0,
    status: 0,
    currentSerie: 0,
    lastState0Time: 0,
    lastState3Time: 0,
    lastBlockTime: -99999,
    lastClearTime: -99999,
    actionTimes: [],
    chainTracker: [],
    firstSeen: null,
    lastSeen: null,
    stateSnapshots: [],
  };
  return p;
}

interface TimelineEntry {
  rawTime: number;
  kind: "event" | "state";
  event?: ParsedEvent;
  state?: ParsedPlayerState;
}

/**
 * Reconstruct the document-ordered, interleaved stream of type-4 and type-9 lines
 * from the parser's separate arrays. Both arrays are already in ascending raw-time
 * document order; type-9 timestamps are strictly at-or-after their triggering action,
 * so a stable merge by raw time (event-before-state on ties) recovers file order.
 */
function buildTimeline(parsed: ParsedTdf): TimelineEntry[] {
  const merged: TimelineEntry[] = [];
  let i = 0;
  let j = 0;
  const events = parsed.events;
  const states = parsed.playerStateLog;
  while (i < events.length && j < states.length) {
    if (events[i]!.time <= states[j]!.time) {
      merged.push({ rawTime: events[i]!.time, kind: "event", event: events[i] });
      i++;
    } else {
      merged.push({ rawTime: states[j]!.time, kind: "state", state: states[j] });
      j++;
    }
  }
  for (; i < events.length; i++)
    merged.push({ rawTime: events[i]!.time, kind: "event", event: events[i] });
  for (; j < states.length; j++)
    merged.push({ rawTime: states[j]!.time, kind: "state", state: states[j] });
  return merged;
}

export function simulateLaserball(parsed: ParsedTdf): SimulatedLbGame {
  // --- Discover players and team membership (process_logs.php:122-162) ---
  const stats = new Map<string, LbPlayerSimState>();
  const teamOrder: number[] = []; // team indices in first-appearance order (player entities)
  const seenTeam = new Set<number>();
  for (const e of parsed.entities) {
    if (e.type !== "player") continue;
    if (stats.has(e.originalId)) continue; // first registration wins
    stats.set(e.originalId, newPlayer(e.originalId, e.team, e.desc, e.battlesuit));
    if (!seenTeam.has(e.team)) {
      seenTeam.add(e.team);
      teamOrder.push(e.team);
    }
  }
  // The two competing teams are the first two team indices that have players.
  const competing = teamOrder.slice(0, 2);
  const teamOf = (id: string | null): number =>
    id && stats.has(id) ? stats.get(id)!.teamIndex : -1;
  const teammates = (teamIndex: number): LbPlayerSimState[] =>
    [...stats.values()].filter((p) => p.teamIndex === teamIndex);

  // --- Engine state (process_logs.php:256-274) ---
  let lastPasses: { from: string; to: string; time: number; isClear: boolean }[] = [];
  let lastBlocks: {
    player: string;
    target: string;
    team: number;
    time: number;
    targetState: number;
  }[] = [];
  let lastSteal: {
    player: string | null;
    time: number | null;
    counted: boolean;
    fcCounted: boolean;
  } = {
    player: null,
    time: null,
    counted: false,
    fcCounted: false,
  };
  let waitingForFirstLoss = false;
  const lastFailedClearTime = new Map<string, number>();
  const lastFailedClearAttempt = new Map<string, number>();
  let dynamicRespawnTime: number | null = null;
  const lastPenalizedEventTime = new Map<string, string>();
  let currentHolder: string | null = null;
  let startHoldTime: number | null = null;
  let possessionChain: { from: string; to: string; time: number }[] = [];
  let pendingNoClearGoal: { victim: string; scoringTeam: number; stealTime: number } | null = null;
  let pendingTurnoverPass = new Map<string, { passer: string; time: number }>();
  const lastResetVictimByShooter = new Map<string, string>();

  // --- Time smoother (process_logs.php:271-319) ---
  let timeOffset = 0;
  let lastRawTime = 0;
  let lastAdjustedTime = 0;

  const markSeen = (id: string | null, time: number) => {
    if (!id) return;
    const p = stats.get(id);
    if (!p) return;
    if (p.firstSeen === null) p.firstSeen = time;
    p.lastSeen = time;
  };

  const registerAggressiveAction = (id: string, time: number) => {
    const p = stats.get(id);
    if (!p) return;
    p.actionTimes.push(time);
    p.actionTimes = p.actionTimes.filter((t) => time - t <= 5000);
    p.chainTracker.push(time);
    p.chainTracker = p.chainTracker.filter((t) => time - t <= 3000);
    if (p.chainTracker.length >= 3) {
      p.bigMid++;
      p.chainTracker = [];
    }
  };

  // --- Replay output ---
  const simEvents: LbSimEvent[] = [];
  const interactions = new Map<string, LbInteraction>();
  const bumpInteraction = (actor: string, target: string, key: keyof LbInteraction) => {
    if (!stats.has(actor) || !stats.has(target)) return;
    const k = `${actor}->${target}`;
    const cur = interactions.get(k) ?? { steals: 0, blocks: 0, passes: 0 };
    cur[key]++;
    interactions.set(k, cur);
  };

  let missionEndTime: number | null = null;

  const emitReplay = (
    time: number,
    eventType: string,
    actorId: string | null,
    targetId: string | null,
    description: string,
  ) => {
    if (REPLAY_EXCLUDED.has(eventType)) return;
    const idx = simEvents.length;
    simEvents.push({
      time,
      eventType,
      actorEntityId: actorId && stats.has(actorId) ? actorId : null,
      targetEntityId: targetId && stats.has(targetId) ? targetId : null,
      description,
    });
    for (const id of new Set([actorId, targetId])) {
      if (!id) continue;
      const p = stats.get(id);
      if (!p) continue;
      p.stateSnapshots.push({
        eventIndex: idx,
        score: p.goals,
        state: p.status,
        hasBall: currentHolder === id,
        isActive: p.status === 0,
      });
    }
  };

  // --- Main loop over the merged type-4 / type-9 timeline ---
  for (const entry of buildTimeline(parsed)) {
    // Smooth time across the combined stream (process_logs.php:303-319)
    const rawTime = entry.rawTime;
    if (lastRawTime > 0) {
      const gap = rawTime - lastRawTime;
      if (gap < 0) timeOffset += lastRawTime;
      else if (gap > 60000) timeOffset -= gap - 1000;
    }
    lastRawTime = rawTime;
    const time = rawTime + timeOffset;
    lastAdjustedTime = time;

    if (entry.kind === "state") {
      const pid = entry.state!.entity;
      const sCode = entry.state!.state;
      markSeen(pid, time);
      const p = stats.get(pid);
      if (p) {
        p.status = sCode;
        if (sCode === 3) {
          p.state3++;
          p.lastState3Time = time;
          p.currentSerie = 0;
          lastResetVictimByShooter.delete(pid);
        }
        if (sCode === 2 || sCode === 1) p.state2++;
        if (sCode === 0) {
          p.state0++;
          p.lastState0Time = time;
          if (!dynamicRespawnTime && p.lastState3Time) {
            const diff = time - p.lastState3Time;
            if (diff >= 1000) dynamicRespawnTime = Math.round(diff / 100) * 100;
          }
        }
      }
      continue;
    }

    // type-4 action event
    const ev = entry.event!;
    const code = ev.type;
    const actorId = ev.actor;
    const targetId = ev.target;
    markSeen(actorId, time);
    markSeen(targetId, time);

    // --- Ball tracking (process_logs.php:357-376) ---
    let newHolder: string | null = currentHolder;
    if (code === LB_EVENT.GET_BALL) {
      newHolder = actorId;
      lastPasses = [];
    } else if ((code === LB_EVENT.PASS || code === LB_EVENT.CLEAR) && targetId) {
      newHolder = targetId;
    } else if (
      code === LB_EVENT.GOAL_A ||
      code === LB_EVENT.GOAL_B ||
      code === LB_EVENT.BALL_TIMEOUT ||
      code === LB_EVENT.ROUND_END ||
      code === LB_EVENT.MATCH_RESET
    ) {
      if (code === LB_EVENT.BALL_TIMEOUT && currentHolder && stats.has(currentHolder)) {
        stats.get(currentHolder)!.ballTimeout++;
      }
      newHolder = null;
    } else if (code === LB_EVENT.STEAL && actorId) {
      newHolder = actorId;
    }

    if (newHolder !== currentHolder) {
      if (currentHolder && startHoldTime !== null && stats.has(currentHolder)) {
        stats.get(currentHolder)!.possessionTimeMs += time - startHoldTime;
      }
      startHoldTime = newHolder !== null ? time : null;
      currentHolder = newHolder;
    }

    // --- System events / action chain (mirrors PHP if/else-if structure) ---
    if (code === LB_EVENT.ROUND_START) {
      waitingForFirstLoss = true;
      possessionChain = [];
      pendingNoClearGoal = null;
      pendingTurnoverPass = new Map();
    } else if (
      code === LB_EVENT.ROUND_END ||
      code === LB_EVENT.MATCH_RESET ||
      code === LB_EVENT.BALL_TIMEOUT
    ) {
      if (code === LB_EVENT.MATCH_RESET) {
        for (const p of stats.values()) p.status = 0;
      }
      lastPasses = [];
      waitingForFirstLoss = false;
      possessionChain = [];
      pendingNoClearGoal = null;
      pendingTurnoverPass = new Map();
      lastSteal = { player: null, time: null, counted: false, fcCounted: false };
    } else if (code === LB_EVENT.MISS && actorId && stats.has(actorId)) {
      stats.get(actorId)!.misses++;
    } else if (code === LB_EVENT.TARGET_RESET_SELF && actorId && stats.has(actorId)) {
      stats.get(actorId)!.targetResetSelf++;
    } else if (code === LB_EVENT.TARGET_RESET_PLAYER && targetId && stats.has(targetId)) {
      stats.get(targetId)!.targetResetPlayer++;
    } else if (code === LB_EVENT.GET_BALL && actorId && stats.has(actorId)) {
      stats.get(actorId)!.startRoundBall++;
    } else if ((code === LB_EVENT.PASS || code === LB_EVENT.CLEAR) && actorId && targetId) {
      // --- Pass / Clear (process_logs.php:397-413) ---
      lastFailedClearAttempt.set(actorId, -99999);
      if (code === LB_EVENT.CLEAR && lastSteal.fcCounted) {
        if (lastSteal.player && stats.has(lastSteal.player))
          stats.get(lastSteal.player)!.badAttacksFc--;
        lastSteal.fcCounted = false;
      }
      if (code === LB_EVENT.PASS) pendingTurnoverPass.set(targetId, { passer: actorId, time });
      if (code === LB_EVENT.CLEAR && stats.has(actorId)) {
        const a = stats.get(actorId)!;
        if (time - a.lastBlockTime <= 3000) {
          a.clutchSaves++;
          a.lastBlockTime = -99999;
        }
        a.lastClearTime = time;
      }
      lastPasses.push({ from: actorId, to: targetId, time, isClear: code === LB_EVENT.CLEAR });
      if (stats.has(actorId)) {
        if (code === LB_EVENT.PASS) stats.get(actorId)!.passesDone++;
        else stats.get(actorId)!.clearsDone++;
      }
      if (stats.has(targetId)) {
        if (code === LB_EVENT.PASS) stats.get(targetId)!.passesReceived++;
        else stats.get(targetId)!.clearsReceived++;
      }
      bumpInteraction(actorId, targetId, "passes");
    } else if (code === LB_EVENT.STEAL && actorId && targetId) {
      // --- Steal (process_logs.php:416-456) ---
      if (stats.has(actorId)) stats.get(actorId)!.stealsDone++;
      if (stats.has(targetId)) stats.get(targetId)!.stealsReceived++;
      registerAggressiveAction(actorId, time);
      bumpInteraction(actorId, targetId, "steals");

      if (stats.has(actorId)) {
        const a = stats.get(actorId)!;
        a.currentSerie++;
        if (a.currentSerie > a.blockSerieMax) a.blockSerieMax = a.currentSerie;
      }
      if (stats.has(targetId)) stats.get(targetId)!.currentSerie = 0;

      const ptp = pendingTurnoverPass.get(targetId);
      if (ptp && time - ptp.time <= 1000) {
        if (stats.has(ptp.passer)) stats.get(ptp.passer)!.turnoverPass++;
      }
      pendingTurnoverPass.delete(targetId);

      lastPasses = [];
      if (waitingForFirstLoss && stats.has(targetId)) {
        stats.get(targetId)!.startRoundLoss++;
        waitingForFirstLoss = false;
      }

      lastSteal = { player: targetId, time, counted: false, fcCounted: false };
      possessionChain.push({ from: targetId, to: actorId, time });
      if (possessionChain.length > 10) possessionChain.shift();

      const lastFC = lastFailedClearAttempt.get(targetId) ?? -99999;
      const pActorTeamIdx = teamOf(actorId);
      if (time - lastFC <= 3000) {
        pendingNoClearGoal = { victim: targetId, scoringTeam: pActorTeamIdx, stealTime: time };
      } else if (pendingNoClearGoal && pActorTeamIdx !== pendingNoClearGoal.scoringTeam) {
        pendingNoClearGoal = null;
      }
      lastFailedClearAttempt.set(targetId, -99999);
    } else if (code === LB_EVENT.FAILED_CLEAR && actorId) {
      // --- Failed Clear (process_logs.php:459-509) ---
      if (stats.has(actorId)) stats.get(actorId)!.failedClearsRaw++;
      lastFailedClearAttempt.set(actorId, time);
      const lastT = lastFailedClearTime.get(actorId) ?? -99999;

      if (
        lastSteal.player &&
        !lastSteal.fcCounted &&
        lastSteal.time !== null &&
        time - lastSteal.time <= LB_CONF.MARNE_LIMIT
      ) {
        if (stats.has(lastSteal.player)) {
          stats.get(lastSteal.player)!.badAttacksFc++;
          lastSteal.fcCounted = true;
        }
      }

      const currentCooldown = dynamicRespawnTime
        ? dynamicRespawnTime + 2000
        : LB_CONF.FAILED_CLEAR_COOLDOWN;
      if (time - lastT > currentCooldown) {
        lastFailedClearTime.set(actorId, time);
        if (stats.has(actorId)) stats.get(actorId)!.failedClearsCalc++;
      }

      // Inactive clear penalty
      const pActorTeamIdx = teamOf(actorId);
      if (pActorTeamIdx !== -1) {
        for (const mate of teammates(pActorTeamIdx)) {
          const teammateId = mate.entityId;
          if (teammateId === actorId) continue;
          const enteredState0Recently = mate.status === 0 && time - mate.lastState0Time <= 2000;
          if (mate.status === 3 || mate.status === 2 || enteredState0Recently) {
            let deactivatorId: string | null = null;
            let latestTime = -1;
            let anchorTime = -1;
            for (let k = lastBlocks.length - 1; k >= 0; k--) {
              if (lastBlocks[k]!.target === teammateId) {
                if (anchorTime === -1) {
                  anchorTime = lastBlocks[k]!.time;
                  deactivatorId = lastBlocks[k]!.player;
                  latestTime = lastBlocks[k]!.time;
                } else if (anchorTime - lastBlocks[k]!.time <= 500) {
                  deactivatorId = lastBlocks[k]!.player;
                  latestTime = lastBlocks[k]!.time;
                } else break;
              }
            }
            for (let k = possessionChain.length - 1; k >= 0; k--) {
              if (possessionChain[k]!.from === teammateId) {
                if (possessionChain[k]!.time > latestTime) {
                  deactivatorId = possessionChain[k]!.to;
                  latestTime = possessionChain[k]!.time;
                }
                break;
              }
            }
            const eventKey = `deactivation_${latestTime}`;
            if (lastPenalizedEventTime.get(teammateId) !== eventKey) {
              lastPenalizedEventTime.set(teammateId, eventKey);
              mate.inactiveClearPenalty++;
              if (deactivatorId && stats.has(deactivatorId)) {
                stats.get(deactivatorId)!.noClearBlocks++;
              }
            }
          }
        }
      }
    } else if (code === LB_EVENT.BLOCK && actorId && targetId) {
      // --- Block (process_logs.php:512-545) ---
      const tStatus = stats.has(targetId) ? stats.get(targetId)!.status : 0;
      registerAggressiveAction(actorId, time);
      bumpInteraction(actorId, targetId, "blocks");
      if (stats.has(actorId)) {
        const a = stats.get(actorId)!;
        a.currentSerie++;
        if (a.currentSerie > a.blockSerieMax) a.blockSerieMax = a.currentSerie;
        if (time - a.lastClearTime <= 3000) {
          a.clutchSaves++;
          a.lastClearTime = -99999;
        }
        a.lastBlockTime = time;
      }
      if (stats.has(targetId)) stats.get(targetId)!.currentSerie = 0;

      if (tStatus === 2) {
        const prevTrap = lastResetVictimByShooter.get(actorId);
        if (prevTrap !== undefined && prevTrap !== targetId && stats.has(prevTrap)) {
          stats.get(prevTrap)!.resetPoint++;
        }
        lastResetVictimByShooter.set(actorId, targetId);
        if (stats.has(actorId)) stats.get(actorId)!.resetBlocksDone++;
        if (stats.has(targetId)) stats.get(targetId)!.resetBlocksReceived++;
      } else {
        lastResetVictimByShooter.delete(actorId);
        if (stats.has(actorId)) stats.get(actorId)!.blocksDone++;
        if (stats.has(targetId)) stats.get(targetId)!.blocksReceived++;
      }

      if (actorId === currentHolder && stats.has(actorId)) stats.get(actorId)!.blocksWithBall++;

      const pActorTeamIdx = teamOf(actorId);
      lastBlocks.push({
        player: actorId,
        target: targetId,
        team: pActorTeamIdx,
        time,
        targetState: tStatus,
      });
    }

    // --- Futile Attack Evaluator (standalone if; process_logs.php:548-550) ---
    if (
      code === LB_EVENT.CLEAR &&
      lastSteal.player &&
      !lastSteal.counted &&
      lastSteal.time !== null &&
      time - lastSteal.time <= LB_CONF.MARNE_LIMIT
    ) {
      if (stats.has(lastSteal.player)) {
        stats.get(lastSteal.player)!.futileAttacks++;
        lastSteal.counted = true;
      }
    }

    // --- Goal (process_logs.php:553-620) ---
    if ((code === LB_EVENT.GOAL_A || code === LB_EVENT.GOAL_B) && actorId) {
      if (stats.has(actorId)) stats.get(actorId)!.goals++;

      if (stats.has(actorId)) {
        const a = stats.get(actorId)!;
        const validAggro = a.actionTimes.filter((t) => time - t <= 5000);
        if (validAggro.length >= 3) a.bigGoals++;
        a.actionTimes = [];
      }

      // Assist / clear-assist chain
      const validP = lastPasses.filter((p) => time - p.time <= LB_CONF.ASSIST_LIMIT);
      const path: { from: string; to: string; time: number; isClear: boolean }[] = [];
      let curr = actorId;
      for (let k = validP.length - 1; k >= 0; k--) {
        if (validP[k]!.to === curr) {
          path.unshift(validP[k]!);
          curr = validP[k]!.from;
        }
      }
      if (path.length > 0) {
        const a1Event = path[path.length - 1]!;
        const a1 = a1Event.from;
        if (stats.has(a1)) {
          if (a1Event.isClear) stats.get(a1)!.clearAssists1++;
          else stats.get(a1)!.assists1++;
        }
        if (path.length >= 2) {
          const a2Event = path[path.length - 2]!;
          const a2 = a2Event.from;
          if (a2 !== actorId && a2 !== a1 && stats.has(a2)) {
            if (a2Event.isClear) stats.get(a2)!.clearAssists2++;
            else stats.get(a2)!.assists2++;
          }
        }
      }

      const pActorTeamIdx = teamOf(actorId);
      if (pActorTeamIdx !== -1) {
        for (const p of stats.values()) {
          if (p.teamIndex !== pActorTeamIdx) p.defenseScore--;
        }
      }

      const currentBlockB4GoalTime = dynamicRespawnTime ?? LB_CONF.BLOCK_BEFORE_GOAL;
      for (const b of lastBlocks) {
        if (
          pActorTeamIdx !== -1 &&
          time - b.time <= currentBlockB4GoalTime &&
          b.team === pActorTeamIdx
        ) {
          if (stats.has(b.player)) stats.get(b.player)!.blocksBeforeGoal++;
        }
      }

      if (
        lastSteal.player &&
        lastSteal.counted &&
        lastSteal.time !== null &&
        time - lastSteal.time <= LB_CONF.GOAL_AFTER_MARNE
      ) {
        if (stats.has(lastSteal.player)) stats.get(lastSteal.player)!.futileAttacksGoal++;
      }

      if (possessionChain.length >= 2) {
        const steal2 = possessionChain[possessionChain.length - 1]!;
        const steal1 = possessionChain[possessionChain.length - 2]!;
        if (actorId === steal2.to && steal1.to === steal2.from && time - steal1.time <= 3000) {
          if (stats.has(steal1.from)) stats.get(steal1.from)!.passOverOpponent++;
        }
      }

      if (
        pendingNoClearGoal &&
        pActorTeamIdx !== -1 &&
        pendingNoClearGoal.scoringTeam === pActorTeamIdx &&
        time - pendingNoClearGoal.stealTime <= 3000
      ) {
        if (stats.has(pendingNoClearGoal.victim))
          stats.get(pendingNoClearGoal.victim)!.noClearGoal++;
      }

      possessionChain = [];
      pendingNoClearGoal = null;
      pendingTurnoverPass = new Map();
      lastSteal = { player: null, time: null, counted: false, fcCounted: false };
      lastBlocks = lastBlocks.filter((b) => time - b.time <= currentBlockB4GoalTime);
      currentHolder = null;
    }

    if (code === LB_EVENT.MATCH_RESET) missionEndTime = time;
    emitReplay(time, code, actorId, targetId, ev.description);
  }

  // Flush trailing possession (process_logs.php:624-627)
  if (currentHolder && startHoldTime !== null && stats.has(currentHolder)) {
    stats.get(currentHolder)!.possessionTimeMs += lastAdjustedTime - startHoldTime;
  }

  // --- Team scores & outcome ---
  const teamGoals: Record<number, number> = {};
  for (const idx of competing) teamGoals[idx] = 0;
  for (const p of stats.values()) {
    if (teamGoals[p.teamIndex] !== undefined) teamGoals[p.teamIndex]! += p.goals;
  }

  // Cross-check against line-5 score events (one per goal)
  const scoreEventGoals: Record<number, number> = {};
  for (const idx of competing) scoreEventGoals[idx] = 0;
  for (const s of parsed.scores) {
    const t = teamOf(s.entity);
    if (scoreEventGoals[t] !== undefined) scoreEventGoals[t]! += s.delta;
  }
  const goalCheckOk = competing.every((idx) => teamGoals[idx] === scoreEventGoals[idx]);

  const [a, b] = competing;
  let outcome: SimulatedLbGame["outcome"];
  if (competing.length < 2) {
    outcome = "aborted";
  } else if (teamGoals[a!]! === teamGoals[b!]!) {
    outcome = "draw";
  } else {
    outcome = "score";
  }

  const resultFor = (idx: number): "win" | "loss" | "draw" | null => {
    if (!competing.includes(idx)) return null;
    if (competing.length < 2) return null;
    const mine = teamGoals[idx]!;
    const other = teamGoals[idx === a ? b! : a!]!;
    if (mine === other) return "draw";
    return mine > other ? "win" : "loss";
  };

  const teams: LbSimTeam[] = parsed.teams.map((t) => {
    const isCompeting = competing.includes(t.index);
    return {
      tdfTeamIndex: t.index,
      isNeutral: !isCompeting,
      name: t.desc,
      colourEnum: t.colourEnum,
      colourRgb: t.colourRgb,
      score: isCompeting ? (teamGoals[t.index] ?? 0) : null,
      result: isCompeting ? resultFor(t.index) : null,
    };
  });

  // --- Filter persisted players: competing team + >30s playtime (process_logs.php:646) ---
  const persisted = new Map<string, LbPlayerSimState>();
  for (const [id, p] of stats) {
    if (!competing.includes(p.teamIndex)) continue;
    const playtime = p.firstSeen !== null && p.lastSeen !== null ? p.lastSeen - p.firstSeen : 0;
    if (playtime <= LB_MIN_PLAYTIME_MS) continue;
    persisted.set(id, p);
  }

  const actualDuration = missionEndTime ?? lastAdjustedTime;

  return {
    actualDuration,
    outcome,
    teams,
    playerStats: persisted,
    events: simEvents,
    interactions,
    goalCheck: { teamGoals, scoreEventGoals, ok: goalCheckOk },
  };
}
