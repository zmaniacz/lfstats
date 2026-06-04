import { db } from "@lfstats/db";
import {
  upsertCenter,
  upsertPlayer,
  upsertPlayerCallsignHistory,
  upsertBattlesuit,
  upsertTarget,
  insertGame,
  insertGameTeams,
  insertGameTargets,
  insertGameReferees,
  insertGameTargetDestructions,
  insertGamePenalties,
  insertScorecards,
  insertGamePlayerInteractions,
  insertGameEvents,
  insertGamePlayerStates,
  insertScorecardMvps,
} from "@lfstats/db";
import type {
  ParsedTdf,
  ParsedEntity,
  PlayerSimState,
  SimulatedGame,
} from "./types.js";
import { POSITION } from "./types.js";
import type { MvpRow } from "./mvp.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function ingest(
  parsed: ParsedTdf,
  simResult: SimulatedGame,
  gameStartTime: Date,
  mvpRows: MvpRow[],
  gameType: string,
): Promise<string> {
  let gameId = "";

  await db.transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // 1. Upsert Center
    // -----------------------------------------------------------------------
    const centerRow = await upsertCenter(tx, {
      countryCode: parsed.meta.countryCode,
      siteCode: parsed.meta.siteCode,
      name: "Unknown Center",
    });
    const centerId = centerRow.id;

    // -----------------------------------------------------------------------
    // 2. Upsert Players (one per player entity with iplId)
    // -----------------------------------------------------------------------
    const playerIdByEntityId = new Map<string, string>(); // entityId → player UUID

    // Sort by iplId so all concurrent transactions acquire row locks in the same
    // order, preventing circular deadlocks when multiple games share players.
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

    // -----------------------------------------------------------------------
    // 3. Insert Game
    // -----------------------------------------------------------------------
    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );

    const gameRow = await insertGame(tx, {
      centerId,
      startTime: gameStartTime,
      tdfFilename: archiveKey,
      outcome: simResult.outcome,
      scheduledDuration: parsed.meta.duration,
      actualDuration: simResult.actualDuration,
      type: gameType,
      exclude: simResult.outcome === "aborted",
    });
    gameId = gameRow.id;

    // -----------------------------------------------------------------------
    // 4. Insert GameTeams (bulk)
    // -----------------------------------------------------------------------
    const gameTeamRows = await insertGameTeams(
      tx,
      parsed.teams.map((team) => {
        const simTeam = simResult.teams.find(
          (t) => t.tdfTeamIndex === team.index,
        );
        return {
          gameId,
          tdfTeamIndex: team.index,
          isNeutral:
            team.desc.toLowerCase() === "neutral" ||
            team.desc.toLowerCase() === "neutral team",
          name: team.desc,
          colourEnum: team.colourEnum,
          colourRgb: team.colourRgb,
          score: simTeam?.score ?? null,
          eliminationBonus: simTeam?.eliminationBonus ?? null,
          result: simTeam?.result ?? null,
          eliminated: simTeam?.eliminated ?? null,
        };
      }),
    );
    const teamIdByIndex = new Map<number, string>();
    for (const row of gameTeamRows) {
      teamIdByIndex.set(row.tdfTeamIndex, row.id);
    }

    // -----------------------------------------------------------------------
    // 5. Upsert Battlesuits
    // -----------------------------------------------------------------------
    const battlesuitIdByName = new Map<string, string>(); // name → UUID

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

    // -----------------------------------------------------------------------
    // 6. Upsert Targets (non-player target entities)
    // -----------------------------------------------------------------------
    const targetIdByHardwareId = new Map<string, string>();

    const targetEntityList = parsed.entities
      .filter(
        (e) =>
          e.type === "standard-target" ||
          e.type === "beacon" ||
          e.type === "generator-target" ||
          e.type === "warbot",
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const entity of targetEntityList) {
      const row = await upsertTarget(tx, {
        centerId,
        hardwareId: entity.id,
        name: entity.desc,
      });
      targetIdByHardwareId.set(entity.id, row.id);
    }

    // -----------------------------------------------------------------------
    // 7. Insert GameTargets (bulk)
    // -----------------------------------------------------------------------
    const gameTargetRows = await insertGameTargets(
      tx,
      targetEntityList.map((entity) => ({
        gameId,
        targetId: targetIdByHardwareId.get(entity.id)!,
        gameTeamId: teamIdByIndex.get(entity.team) ?? null,
        type: entity.type,
      })),
    );
    const gameTargetIdByHardwareId = new Map<string, string>();
    for (let i = 0; i < targetEntityList.length; i++) {
      gameTargetIdByHardwareId.set(
        targetEntityList[i]!.id,
        gameTargetRows[i]!.id,
      );
    }

    // -----------------------------------------------------------------------
    // 8. Insert GameReferees (bulk)
    // -----------------------------------------------------------------------
    const refereeEntities = parsed.entities.filter((e) => e.type === "referee");
    const gameRefereeRows = await insertGameReferees(
      tx,
      refereeEntities.map((entity) => ({
        gameId,
        playerId: entity.originalId.startsWith("#")
          ? (playerIdByEntityId.get(entity.id) ?? null)
          : null,
        iplId: entity.originalId.startsWith("#") ? entity.originalId : null,
        callsign: entity.desc,
        battlesuitId: entity.battlesuit
          ? (battlesuitIdByName.get(entity.battlesuit) ?? null)
          : null,
        hardwareId: entity.id.startsWith("@") ? entity.id : null,
      })),
    );
    const refereeIdByEntityId = new Map<string, string>();
    for (let i = 0; i < refereeEntities.length; i++) {
      refereeIdByEntityId.set(refereeEntities[i]!.id, gameRefereeRows[i]!.id);
    }

    // -----------------------------------------------------------------------
    // 9. Insert Scorecards (bulk) — all players
    // -----------------------------------------------------------------------
    const playerEntityList = parsed.entities.filter((e) => e.type === "player");
    const endByEntityId = new Map(parsed.entityEnds.map((e) => [e.id, e]));

    // Find mission end time for end_time calculation
    const missionEndEvent = parsed.events.find((e) => e.type === "0101");
    const missionEndOffset = missionEndEvent?.time ?? 0;
    const missionEndTimestamp = new Date(
      gameStartTime.getTime() + missionEndOffset,
    );

    const scorecardInsertRows = playerEntityList.map((entity) => {
      const ps = simResult.playerStats.get(entity.id);
      const end = endByEntityId.get(entity.id);
      const sm5 = parsed.sm5Stats.find((s) => s.id === entity.id);
      const pos = entity.category;
      const isCommander = pos === POSITION.COMMANDER;
      const isHeavy = pos === POSITION.HEAVY;
      const isScout = pos === POSITION.SCOUT;
      const isAmmo = pos === POSITION.AMMO;
      const isMedic = pos === POSITION.MEDIC;
      const isSupport = isAmmo || isMedic;
      const isHeavySp = isHeavy;

      const eliminated = end?.exitType === "04";
      const endOffset = end?.time ?? missionEndOffset;
      const endTime = new Date(gameStartTime.getTime() + endOffset);
      const score = end?.score ?? 0;

      const accuracy =
        (sm5?.shotsFired ?? 0) > 0
          ? r3((sm5?.shotsHit ?? 0) / (sm5?.shotsFired ?? 1))
          : 0;
      const hitDiff = r3(
        (sm5?.shotOpponent ?? 0) / Math.max(sm5?.timesZapped ?? 0, 1),
      );

      // Average nuke activation time
      const avgNukeTime =
        isCommander && ps && ps.nukesDetonated > 0
          ? Math.round(ps.totalNukeActivationTime / ps.nukesDetonated)
          : null;

      // Average rapid time
      const avgRapidTime =
        isScout && ps && ps.rapidFire > 0
          ? Math.round(ps.totalRapidTime / ps.rapidFire)
          : null;

      // accuracy during rapid
      const accDuringRapid =
        isScout && ps && ps.shotsFiredDuringRapid > 0
          ? r3(ps.shotsHitDuringRapid / ps.shotsFiredDuringRapid)
          : isScout
            ? 0
            : null;

      // SP spent calculation
      const spSpent = isHeavySp
        ? null
        : (() => {
            if (!sm5 || !ps) return 0;
            if (isCommander) return sm5.nukesActivated * 20;
            if (isScout) return sm5.scoutRapid * 10;
            if (isAmmo) return sm5.ammoBoost * 15;
            if (isMedic) return sm5.lifeBoost * 10;
            return 0;
          })();

      // mvp_points and mvp_model_id are set after MVP calculation — use placeholders
      // They will be filled in when we have the mvp model id
      const mvpData = mvpRows.find((m) => m.entityId === entity.id);

      return {
        gameId,
        playerId: playerIdByEntityId.get(entity.id) ?? null,
        teamId: teamIdByIndex.get(entity.team)!,
        battlesuitId: entity.battlesuit
          ? (battlesuitIdByName.get(entity.battlesuit) ?? null)
          : null,
        iplId: entity.originalId.startsWith("#") ? entity.originalId : null,
        callsign: entity.desc,
        position: pos,
        eliminated,
        endTime,

        // Shot stats — from sm5Stats
        shotsFired: sm5?.shotsFired ?? 0,
        shotsHit: sm5?.shotsHit ?? 0,
        shotsHitOpponent: sm5?.shotOpponent ?? 0,
        shotsHitTeam: sm5?.shotTeam ?? 0,
        shotsHitOpponent3hit: sm5?.shot3Hit ?? 0,
        // Derived
        shotsHitOpponentMedic: ps?.shotsHitOpponentMedic ?? 0,
        shotsHitTeamMedic: ps?.shotsHitTeamMedic ?? 0,
        timesHit: sm5?.timesZapped ?? 0,

        // Missile stats — from sm5Stats
        missileHits: sm5?.missileHits ?? 0,
        missilesHitOpponent: sm5?.missiledOpponent ?? 0,
        missilesHitTeam: sm5?.missiledTeam ?? 0,
        // Derived
        missilesHitOpponentMedic: ps?.missilesHitOpponentMedic ?? 0,
        missilesHitTeamMedic: ps?.missilesHitTeamMedic ?? 0,
        timesHitByMissile: sm5?.timesMissiled ?? 0,

        // Nuke stats — Commander only
        nukesActivated: isCommander ? (sm5?.nukesActivated ?? 0) : null,
        nukesDetonated: isCommander ? (sm5?.nukesDetonated ?? 0) : null,
        nukesHitMedic: isCommander ? (sm5?.medicNukes ?? 0) : null,
        livesRemovedByNuke: isCommander ? (ps?.livesRemovedByNuke ?? 0) : null,
        totalNukeActivationTime: isCommander
          ? (ps?.totalNukeActivationTime ?? 0)
          : null,
        averageNukeActivationTime: isCommander ? avgNukeTime : null,

        // Nuke cancel — all positions
        nukesCanceled: sm5?.nukeCancels ?? 0,
        teamNukesCanceled: sm5?.ownNukeCancels ?? 0,

        // Nuke-cancelled-by-nuke — Commander only
        nukesCanceledByNuke: isCommander ? (ps?.nukesCanceledByNuke ?? 0) : null,
        ownNukesCanceledByNuke: isCommander ? (ps?.ownNukesCanceledByNuke ?? 0) : null,

        // Special ability stats
        rapidFire: isScout ? (sm5?.scoutRapid ?? 0) : null,
        totalRapidTime: isScout ? (ps?.totalRapidTime ?? 0) : null,
        averageRapidTime: isScout ? avgRapidTime : null,
        shotsFiredDuringRapid: isScout
          ? (ps?.shotsFiredDuringRapid ?? 0)
          : null,
        shotsHitDuringRapid: isScout ? (ps?.shotsHitDuringRapid ?? 0) : null,
        shotsHitOpponentDuringRapid: isScout
          ? (ps?.shotsHitOpponentDuringRapid ?? 0)
          : null,
        shotsHitTeamDuringRapid: isScout
          ? (ps?.shotsHitTeamDuringRapid ?? 0)
          : null,
        accuracyDuringRapid: accDuringRapid,
        ammoBoost: isAmmo ? (sm5?.ammoBoost ?? 0) : null,
        lifeBoost: isMedic ? (sm5?.lifeBoost ?? 0) : null,

        // Support stats
        resuppliesGiven: isSupport ? (ps?.resuppliesGiven ?? 0) : null,
        doubleResuppliesGiven: isSupport
          ? (ps?.doubleResuppliesGiven ?? 0)
          : null,
        resuppliesReceivedAmmo: ps?.resuppliesReceivedAmmo ?? 0,
        resuppliesReceivedLives: ps?.resuppliesReceivedLives ?? 0,
        emergencyResuppliesReceivedAmmo: ps?.emergencyResuppliesReceivedAmmo ?? 0,
        emergencyResuppliesReceivedLives: ps?.emergencyResuppliesReceivedLives ?? 0,
        doubleResuppliesReceived: ps?.doubleResuppliesReceived ?? 0,

        // Combat outcomes — derived
        deactivatedOpponent: ps?.deactivatedOpponent ?? 0,
        deactivatedTeam: ps?.deactivatedTeam ?? 0,
        eliminatedOpponent: ps?.eliminatedOpponent ?? 0,
        eliminatedTeam: ps?.eliminatedTeam ?? 0,
        eliminatedOpponentMedic: ps?.eliminatedOpponentMedic ?? 0,
        eliminatedTeamMedic: ps?.eliminatedTeamMedic ?? 0,
        assists: ps?.assists ?? 0,
        resetOpponent: ps?.resetOpponent ?? 0,
        resetTeam: ps?.resetTeam ?? 0,
        missileResetOpponent: ps?.missileResetOpponent ?? 0,
        missileResetTeam: ps?.missileResetTeam ?? 0,

        // SP — null for Heavy
        spEarned: isHeavySp ? null : (ps?.spEarned ?? 0),
        spSpent: isHeavySp ? null : spSpent,

        // Targets
        targetsDestroyed: ps?.targetsDestroyed ?? 0,

        // Penalties
        penalties: sm5?.penalties ?? 0,

        // End state — from sm5Stats
        livesLeft: sm5?.livesLeft ?? 0,
        shotsLeft: sm5?.shotsLeft ?? 0,

        // Uptime / downtime
        uptime: ps?.uptime ?? 0,
        resupplyDowntime: ps?.resupplyDowntime ?? 0,
        otherDowntime: ps?.otherDowntime ?? 0,

        // Derived performance
        score,
        accuracy,
        hitDiff,
        mvpPoints: mvpData?.totalPoints ?? 0,
        mvpModelId: mvpData?.modelId ?? "",
      };
    });

    const scorecardRows = await insertScorecards(
      tx,
      scorecardInsertRows as Parameters<typeof insertScorecards>[1],
    );
    const scorecardIdByEntityId = new Map<string, string>();
    for (let i = 0; i < playerEntityList.length; i++) {
      scorecardIdByEntityId.set(playerEntityList[i]!.id, scorecardRows[i]!.id);
    }

    // -----------------------------------------------------------------------
    // 10. Insert GamePlayerInteractions (bulk)
    // -----------------------------------------------------------------------
    const interactionRows = [];
    for (const [key, counts] of simResult.interactions) {
      const [actorId, targetId] = key.split("->") as [string, string];
      const actorScorecardId = scorecardIdByEntityId.get(actorId);
      const targetScorecardId = scorecardIdByEntityId.get(targetId);
      if (!actorScorecardId || !targetScorecardId) continue;

      interactionRows.push({
        gameId,
        scorecardId: actorScorecardId,
        targetScorecardId,
        shotsHit: counts.shotsHit,
        shotDeactivations: counts.shotDeactivations,
        missileHits: counts.missileHits,
      });
    }
    await insertGamePlayerInteractions(tx, interactionRows);

    // -----------------------------------------------------------------------
    // 11. Insert GameTargetDestructions (bulk)
    // -----------------------------------------------------------------------
    const destructionRows = simResult.targetDestructions.map((d) => ({
      gameTargetId: gameTargetIdByHardwareId.get(d.targetHardwareId)!,
      scorecardId: scorecardIdByEntityId.get(d.actorEntityId)!,
      method: d.method,
      time: d.time,
    }));
    await insertGameTargetDestructions(tx, destructionRows);

    // -----------------------------------------------------------------------
    // 12. Insert GamePenalties (bulk)
    // -----------------------------------------------------------------------
    const penaltyRows = simResult.penalties.map((p) => ({
      gameId,
      refereeId: p.refereeEntityId
        ? (refereeIdByEntityId.get(p.refereeEntityId) ?? null)
        : null,
      scorecardId: scorecardIdByEntityId.get(p.targetEntityId)!,
      scoreValue: p.scoreValue,
      description: "Common Foul",
      time: p.time,
    }));
    await insertGamePenalties(tx, penaltyRows);

    // -----------------------------------------------------------------------
    // 13. Insert GameEvents (bulk) — returns rows with UUIDs
    // -----------------------------------------------------------------------
    const gameEventInsertRows = simResult.events.map((e) => ({
      gameId,
      time: e.time,
      eventType: e.eventType,
      actorScorecardId: e.actorEntityId
        ? (scorecardIdByEntityId.get(e.actorEntityId) ?? null)
        : null,
      actorGameTargetId: e.actorHardwareId
        ? (gameTargetIdByHardwareId.get(e.actorHardwareId) ?? null)
        : null,
      targetScorecardId: e.targetEntityId
        ? (scorecardIdByEntityId.get(e.targetEntityId) ?? null)
        : null,
      targetGameTargetId: e.targetHardwareId
        ? (gameTargetIdByHardwareId.get(e.targetHardwareId) ?? null)
        : null,
      description: e.description,
    }));
    const insertedEvents = await insertGameEvents(tx, gameEventInsertRows);

    // Build index → event UUID map
    const eventIdByIndex = new Map<number, string>();
    for (let i = 0; i < insertedEvents.length; i++) {
      eventIdByIndex.set(i, insertedEvents[i]!.id);
    }

    // -----------------------------------------------------------------------
    // 14. Insert GamePlayerStates (bulk — highest row count)
    // -----------------------------------------------------------------------
    const stateRows = [];
    for (const [entityId, ps] of simResult.playerStats) {
      const scorecardId = scorecardIdByEntityId.get(entityId);
      if (!scorecardId) continue;

      for (const snap of ps.stateSnapshots) {
        const eventId = eventIdByIndex.get(snap.eventIndex);
        if (!eventId) continue;

        stateRows.push({
          gameId,
          eventId,
          scorecardId,
          time: simResult.events[snap.eventIndex]!.time,
          score: snap.score,
          lives: snap.lives,
          shots: snap.shots,
          missiles: snap.missiles,
          sp: snap.sp,
          hitPoints: snap.hitPoints,
          state: snap.state,
          isRapidFire: snap.isRapidFire,
          isNuking: snap.isNuking,
          isEliminated: snap.isEliminated,
          accuracy: snap.accuracy,
          hitDiff: snap.hitDiff,
        });
      }
    }
    await insertGamePlayerStates(tx, stateRows);

    // -----------------------------------------------------------------------
    // 15. Insert ScorecardMvps (bulk)
    // -----------------------------------------------------------------------
    const mvpInsertRows = mvpRows.flatMap((m) =>
      m.components.map((c) => ({
        scorecardId: scorecardIdByEntityId.get(m.entityId)!,
        mvpModelId: m.modelId,
        component: c.component,
        inputValue: c.inputValue,
        points: c.points,
      })),
    );
    await insertScorecardMvps(tx, mvpInsertRows);

    // -----------------------------------------------------------------------
    // 16. Upsert PlayerCallsignHistory (one per player)
    // -----------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildArchiveKey(
  countryCode: number,
  siteCode: number,
  startTime: string,
): string {
  return `${countryCode}-${siteCode}-${startTime}.tdf`;
}

export function parseGameStartTime(startTimeStr: string): Date {
  // Format: YYYYMMDDHHmmss
  const year = parseInt(startTimeStr.slice(0, 4), 10);
  const month = parseInt(startTimeStr.slice(4, 6), 10) - 1;
  const day = parseInt(startTimeStr.slice(6, 8), 10);
  const hour = parseInt(startTimeStr.slice(8, 10), 10);
  const minute = parseInt(startTimeStr.slice(10, 12), 10);
  const second = parseInt(startTimeStr.slice(12, 14), 10);
  return new Date(Date.UTC(year, month, day, hour, minute, second));
}
