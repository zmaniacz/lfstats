// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "@lfstats/db";
import {
  upsertCenter,
  upsertPlayer,
  upsertPlayerCallsignHistory,
  upsertBattlesuit,
  insertGame,
  insertLbGameTeams,
  insertLbScorecards,
  insertLbGamePlayerInteractions,
  insertLbGameEvents,
  insertLbGamePlayerStates,
} from "@lfstats/db";
import type { ParsedTdf } from "../types.js";
import { buildArchiveKey } from "../ingester.js";
import type { SimulatedLbGame } from "./types.js";

/**
 * Phase 3 — write a simulated Laserball game to the lb_-prefixed tables in a single
 * transaction. Reuses the shared identity upserts (center/player/battlesuit/callsign)
 * and the shared `game` insert (type = "lb").
 */
export async function ingestLaserball(
  parsed: ParsedTdf,
  sim: SimulatedLbGame,
  gameStartTime: Date,
  competitionId: string | null,
): Promise<string> {
  let gameId = "";

  await db.transaction(async (tx) => {
    // 1. Center
    const centerRow = await upsertCenter(tx, {
      countryCode: parsed.meta.countryCode,
      siteCode: parsed.meta.siteCode,
      name: "Unknown Center",
    });
    const centerId = centerRow.id;

    // 2. Players (one per player entity with iplId) — sorted for deadlock-safe locking
    const playerIdByEntityId = new Map<string, string>();
    const playerEntities = parsed.entities
      .filter((e) => e.type === "player" && e.originalId.startsWith("#"))
      .sort((a, b) => a.originalId.localeCompare(b.originalId));
    for (const entity of playerEntities) {
      const playerRow = await upsertPlayer(tx, {
        iplId: entity.originalId,
        memberId: entity.memberId ?? null,
        currentCallsign: entity.desc,
        firstSeenAt: gameStartTime,
      });
      playerIdByEntityId.set(entity.id, playerRow.id);
    }

    // 3. Game
    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );
    const gameRow = await insertGame(tx, {
      centerId,
      startTime: gameStartTime,
      tdfFilename: archiveKey,
      outcome: sim.outcome,
      scheduledDuration: parsed.meta.duration,
      actualDuration: sim.actualDuration,
      type: "lb",
      exclude: sim.outcome === "aborted",
      competitionId,
    });
    gameId = gameRow.id;

    // 4. Teams (bulk)
    const teamRows = await insertLbGameTeams(
      tx,
      sim.teams.map((t) => ({
        gameId,
        tdfTeamIndex: t.tdfTeamIndex,
        isNeutral: t.isNeutral,
        name: t.name,
        colourEnum: t.colourEnum,
        colourRgb: t.colourRgb,
        score: t.score,
        result: t.result,
      })),
    );
    const teamIdByIndex = new Map<number, string>();
    for (const row of teamRows) teamIdByIndex.set(row.tdfTeamIndex, row.id);

    // 5. Battlesuits
    const battlesuitIdByName = new Map<string, string>();
    const battlesuitEntities = parsed.entities
      .filter((e) => !!e.battlesuit)
      .sort((a, b) => a.battlesuit!.localeCompare(b.battlesuit!));
    for (const entity of battlesuitEntities) {
      const row = await upsertBattlesuit(tx, {
        centerId,
        name: entity.battlesuit!,
        hardwareId: entity.type !== "player" ? entity.id : null,
      });
      battlesuitIdByName.set(entity.battlesuit!, row.id);
    }

    // 6. Scorecards (bulk) — persisted players only
    const persistedPlayers = [...sim.playerStats.values()];
    const scorecardInsertRows = persistedPlayers.map((p) => {
      const timePlayedMs =
        p.firstSeen !== null && p.lastSeen !== null ? p.lastSeen - p.firstSeen : 0;
      return {
        gameId,
        playerId: playerIdByEntityId.get(p.entityId) ?? null,
        teamId: teamIdByIndex.get(p.teamIndex)!,
        battlesuitId: p.battlesuit ? (battlesuitIdByName.get(p.battlesuit) ?? null) : null,
        iplId: p.entityId.startsWith("#") ? p.entityId : null,
        callsign: p.callsign,
        timePlayedMs,
        endTime: p.lastSeen ?? 0,
        goals: p.goals,
        bigGoals: p.bigGoals,
        futileAttacks: p.futileAttacks,
        badAttacksFc: p.badAttacksFc,
        futileAttacksGoal: p.futileAttacksGoal,
        assists1: p.assists1,
        assists2: p.assists2,
        clearAssists1: p.clearAssists1,
        clearAssists2: p.clearAssists2,
        passesDone: p.passesDone,
        passesReceived: p.passesReceived,
        passOverOpponent: p.passOverOpponent,
        turnoverPass: p.turnoverPass,
        clearsDone: p.clearsDone,
        clearsReceived: p.clearsReceived,
        clutchSaves: p.clutchSaves,
        failedClearsCalc: p.failedClearsCalc,
        failedClearsRaw: p.failedClearsRaw,
        inactiveClearPenalty: p.inactiveClearPenalty,
        noClearGoal: p.noClearGoal,
        noClearBlocks: p.noClearBlocks,
        defenseScore: p.defenseScore,
        stealsDone: p.stealsDone,
        stealsReceived: p.stealsReceived,
        blocksDone: p.blocksDone,
        blocksReceived: p.blocksReceived,
        blocksWithBall: p.blocksWithBall,
        blocksBeforeGoal: p.blocksBeforeGoal,
        resetBlocksDone: p.resetBlocksDone,
        resetBlocksReceived: p.resetBlocksReceived,
        blockSerieMax: p.blockSerieMax,
        bigMid: p.bigMid,
        resetPoint: p.resetPoint,
        possessionTimeMs: p.possessionTimeMs,
        misses: p.misses,
        targetResetSelf: p.targetResetSelf,
        targetResetPlayer: p.targetResetPlayer,
        startRoundBall: p.startRoundBall,
        startRoundLoss: p.startRoundLoss,
        ballTimeout: p.ballTimeout,
        state0: p.state0,
        state2: p.state2,
        state3: p.state3,
      };
    });
    const scorecardRows = await insertLbScorecards(tx, scorecardInsertRows);
    const scorecardIdByEntityId = new Map<string, string>();
    for (let i = 0; i < persistedPlayers.length; i++) {
      scorecardIdByEntityId.set(persistedPlayers[i]!.entityId, scorecardRows[i]!.id);
    }

    // 7. Interactions (bulk)
    const interactionRows = [];
    for (const [key, counts] of sim.interactions) {
      const [actorId, targetId] = key.split("->") as [string, string];
      const actorScorecardId = scorecardIdByEntityId.get(actorId);
      const targetScorecardId = scorecardIdByEntityId.get(targetId);
      if (!actorScorecardId || !targetScorecardId) continue;
      interactionRows.push({
        gameId,
        scorecardId: actorScorecardId,
        targetScorecardId,
        steals: counts.steals,
        blocks: counts.blocks,
        passes: counts.passes,
      });
    }
    await insertLbGamePlayerInteractions(tx, interactionRows);

    // 8. Events (bulk) — returns rows with UUIDs
    const eventInsertRows = sim.events.map((e) => ({
      gameId,
      time: e.time,
      eventType: e.eventType,
      actorScorecardId: e.actorEntityId
        ? (scorecardIdByEntityId.get(e.actorEntityId) ?? null)
        : null,
      targetScorecardId: e.targetEntityId
        ? (scorecardIdByEntityId.get(e.targetEntityId) ?? null)
        : null,
      description: e.description,
    }));
    const insertedEvents = await insertLbGameEvents(tx, eventInsertRows);
    const eventIdByIndex = new Map<number, string>();
    for (let i = 0; i < insertedEvents.length; i++) eventIdByIndex.set(i, insertedEvents[i]!.id);

    // 9. Player states (bulk — highest row count)
    const stateRows = [];
    for (const p of persistedPlayers) {
      const scorecardId = scorecardIdByEntityId.get(p.entityId);
      if (!scorecardId) continue;
      for (const snap of p.stateSnapshots) {
        const eventId = eventIdByIndex.get(snap.eventIndex);
        if (!eventId) continue;
        stateRows.push({
          gameId,
          eventId,
          scorecardId,
          time: sim.events[snap.eventIndex]!.time,
          score: snap.score,
          state: snap.state,
          hasBall: snap.hasBall,
          isActive: snap.isActive,
          assists: snap.assists,
          stealsDone: snap.stealsDone,
          stealsReceived: snap.stealsReceived,
          blocksDone: snap.blocksDone,
          blocksReceived: snap.blocksReceived,
          clearsDone: snap.clearsDone,
          clearsReceived: snap.clearsReceived,
          passesDone: snap.passesDone,
          passesReceived: snap.passesReceived,
          possessionTimeMs: snap.possessionTimeMs,
        });
      }
    }
    await insertLbGamePlayerStates(tx, stateRows);

    // 10. Player callsign history
    for (const entity of playerEntities) {
      const playerId = playerIdByEntityId.get(entity.id);
      if (!playerId) continue;
      await upsertPlayerCallsignHistory(tx, {
        playerId,
        callsign: entity.desc,
        firstSeenAt: gameStartTime,
        lastSeenAt: gameStartTime,
      });
    }
  });

  return gameId;
}
