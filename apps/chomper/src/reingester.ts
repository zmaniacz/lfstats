// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "@lfstats/db";
import {
  deleteGameChildren,
  updateGameRow,
  restoreGameMetadata,
  insertGameTeams,
  insertGameTargets,
  insertGameReferees,
  insertScorecards,
  insertGamePlayerInteractions,
  insertGameTargetDestructions,
  insertGamePenalties,
  insertGameEvents,
  insertGamePlayerStates,
  insertScorecardMvps,
  upsertCenter,
  upsertPlayer,
  upsertBattlesuit,
  upsertTarget,
  upsertPlayerCallsignHistory,
  applyPenaltyMetadata,
  insertPostGamePenalties,
  applyScorecardIsMercenary,
  insertCompetitionMatchGame,
  getNewInGamePenaltiesWithIplTx,
  recalculateGameResult,
} from "@lfstats/db";
import type { ParsedTdf, SimulatedGame } from "./types.js";
import { POSITION } from "./types.js";
import type { MvpRow } from "./mvp.js";
import { buildArchiveKey } from "./ingester.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Preserved metadata snapshot — collected before deleting child records
// ---------------------------------------------------------------------------

export interface PreservedGameMeta {
  competitionId: string | null;
  exclude: boolean;
  description: string | null;
  // competition_match_game to restore after reingest
  matchGame: {
    matchId: string;
    gameNumber: number;
    team1TdfTeamIndex: number;
    team2TdfTeamIndex: number;
  } | null;
  // In-game penalties (time IS NOT NULL): key = "<iplId>:<time>"
  inGamePenalties: Map<
    string,
    { rescinded: boolean; type: string; mvpValue: number; description: string; inGame: boolean }
  >;
  // Post-game penalties (time IS NULL): full row data keyed by player iplId
  postGamePenalties: Array<{
    iplId: string | null;
    refereeIplId: string | null;
    refereeHardwareId: string | null;
    scoreValue: number;
    description: string;
    type: string;
    mvpValue: number;
    inGame: boolean;
    rescinded: boolean;
  }>;
  // Set of iplIds that have isMercenary = true
  mercenaries: Set<string>;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function reingest(
  existingGameId: string,
  preservedMeta: PreservedGameMeta,
  parsed: ParsedTdf,
  simResult: SimulatedGame,
  gameStartTime: Date,
  mvpRows: MvpRow[],
  gameType: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // 1. Delete child records (preserving game row and its UUID)
    // -----------------------------------------------------------------------
    await deleteGameChildren(tx, existingGameId);

    // -----------------------------------------------------------------------
    // 2. Upsert Center
    // -----------------------------------------------------------------------
    const centerRow = await upsertCenter(tx, {
      countryCode: parsed.meta.countryCode,
      siteCode: parsed.meta.siteCode,
      name: "Unknown Center",
    });
    const centerId = centerRow.id;

    // -----------------------------------------------------------------------
    // 3. Upsert Players
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 4. Update Game row (preserve UUID, update computed fields)
    // -----------------------------------------------------------------------
    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );

    await updateGameRow(tx, existingGameId, {
      outcome: simResult.outcome,
      scheduledDuration: parsed.meta.duration,
      actualDuration: simResult.actualDuration,
      tdfFilename: archiveKey,
    });

    // -----------------------------------------------------------------------
    // 5. Insert GameTeams
    // -----------------------------------------------------------------------
    const gameTeamRows = await insertGameTeams(
      tx,
      parsed.teams.map((team) => {
        const simTeam = simResult.teams.find((t) => t.tdfTeamIndex === team.index);
        return {
          gameId: existingGameId,
          tdfTeamIndex: team.index,
          isNeutral:
            team.desc.toLowerCase() === "neutral" || team.desc.toLowerCase() === "neutral team",
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
    // 6. Upsert Battlesuits
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // 7. Upsert Targets
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
    // 8. Insert GameTargets
    // -----------------------------------------------------------------------
    const gameTargetRows = await insertGameTargets(
      tx,
      targetEntityList.map((entity) => ({
        gameId: existingGameId,
        targetId: targetIdByHardwareId.get(entity.id)!,
        gameTeamId: teamIdByIndex.get(entity.team) ?? null,
        type: entity.type,
      })),
    );
    const gameTargetIdByHardwareId = new Map<string, string>();
    for (let i = 0; i < targetEntityList.length; i++) {
      gameTargetIdByHardwareId.set(targetEntityList[i]!.id, gameTargetRows[i]!.id);
    }

    // -----------------------------------------------------------------------
    // 9. Insert GameReferees
    // -----------------------------------------------------------------------
    const refereeEntities = parsed.entities.filter((e) => e.type === "referee");
    const gameRefereeRows = await insertGameReferees(
      tx,
      refereeEntities.map((entity) => ({
        gameId: existingGameId,
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
    // Build lookup: (iplId ?? hardwareId) → new referee UUID
    const refereeIdByKey = new Map<string, string>();
    for (let i = 0; i < refereeEntities.length; i++) {
      const entity = refereeEntities[i]!;
      const row = gameRefereeRows[i]!;
      const key = entity.originalId.startsWith("#") ? entity.originalId : entity.id;
      refereeIdByKey.set(key, row.id);
    }

    // -----------------------------------------------------------------------
    // 10. Insert Scorecards
    // -----------------------------------------------------------------------
    const playerEntityList = parsed.entities.filter((e) => e.type === "player");
    const endByEntityId = new Map(parsed.entityEnds.map((e) => [e.id, e]));

    const missionEndEvent = parsed.events.find((e) => e.type === "0101");
    const missionEndOffset = missionEndEvent?.time ?? 0;

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
        (sm5?.shotsFired ?? 0) > 0 ? r3((sm5?.shotsHit ?? 0) / (sm5?.shotsFired ?? 1)) : 0;
      const hitDiff = r3((sm5?.shotOpponent ?? 0) / Math.max(sm5?.timesZapped ?? 0, 1));

      const avgNukeTime =
        isCommander && ps && ps.nukesDetonated > 0
          ? Math.round(ps.totalNukeActivationTime / ps.nukesDetonated)
          : null;

      const avgRapidTime =
        isScout && ps && ps.rapidFire > 0 ? Math.round(ps.totalRapidTime / ps.rapidFire) : null;

      const accDuringRapid =
        isScout && ps && ps.shotsFiredDuringRapid > 0
          ? r3(ps.shotsHitDuringRapid / ps.shotsFiredDuringRapid)
          : isScout
            ? 0
            : null;

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

      const mvpData = mvpRows.find((m) => m.entityId === entity.id);

      return {
        gameId: existingGameId,
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
        shotsFired: sm5?.shotsFired ?? 0,
        shotsHit: sm5?.shotsHit ?? 0,
        shotsHitOpponent: sm5?.shotOpponent ?? 0,
        shotsHitTeam: sm5?.shotTeam ?? 0,
        shotsHitOpponent3hit: sm5?.shot3Hit ?? 0,
        shotsHitOpponentMedic: ps?.shotsHitOpponentMedic ?? 0,
        shotsHitTeamMedic: ps?.shotsHitTeamMedic ?? 0,
        timesHit: sm5?.timesZapped ?? 0,
        missileHits: sm5?.missileHits ?? 0,
        missilesHitOpponent: sm5?.missiledOpponent ?? 0,
        missilesHitTeam: sm5?.missiledTeam ?? 0,
        missilesHitOpponentMedic: ps?.missilesHitOpponentMedic ?? 0,
        missilesHitTeamMedic: ps?.missilesHitTeamMedic ?? 0,
        medicHits: (ps?.shotsHitOpponentMedic ?? 0) + (ps?.missilesHitOpponentMedicLives ?? 0),
        teamMedicHits: (ps?.shotsHitTeamMedic ?? 0) + (ps?.missilesHitTeamMedicLives ?? 0),
        timesHitByMissile: sm5?.timesMissiled ?? 0,
        nukesActivated: isCommander ? (sm5?.nukesActivated ?? 0) : null,
        nukesDetonated: isCommander ? (sm5?.nukesDetonated ?? 0) : null,
        nukesHitMedic: isCommander ? (sm5?.medicNukes ?? 0) : null,
        livesRemovedByNuke: isCommander ? (ps?.livesRemovedByNuke ?? 0) : null,
        totalNukeActivationTime: isCommander ? (ps?.totalNukeActivationTime ?? 0) : null,
        averageNukeActivationTime: isCommander ? avgNukeTime : null,
        nukesCanceled: sm5?.nukeCancels ?? 0,
        teamNukesCanceled: sm5?.ownNukeCancels ?? 0,
        nukesCanceledByNuke: isCommander ? (ps?.nukesCanceledByNuke ?? 0) : null,
        ownNukesCanceledByNuke: isCommander ? (ps?.ownNukesCanceledByNuke ?? 0) : null,
        rapidFire: isScout ? (sm5?.scoutRapid ?? 0) : null,
        totalRapidTime: isScout ? (ps?.totalRapidTime ?? 0) : null,
        averageRapidTime: isScout ? avgRapidTime : null,
        shotsFiredDuringRapid: isScout ? (ps?.shotsFiredDuringRapid ?? 0) : null,
        shotsHitDuringRapid: isScout ? (ps?.shotsHitDuringRapid ?? 0) : null,
        shotsHitOpponentDuringRapid: isScout ? (ps?.shotsHitOpponentDuringRapid ?? 0) : null,
        shotsHitTeamDuringRapid: isScout ? (ps?.shotsHitTeamDuringRapid ?? 0) : null,
        accuracyDuringRapid: accDuringRapid,
        ammoBoost: isAmmo ? (sm5?.ammoBoost ?? 0) : null,
        lifeBoost: isMedic ? (sm5?.lifeBoost ?? 0) : null,
        resuppliesGiven: isSupport ? (ps?.resuppliesGiven ?? 0) : null,
        doubleResuppliesGiven: isSupport ? (ps?.doubleResuppliesGiven ?? 0) : null,
        resuppliesReceivedAmmo: ps?.resuppliesReceivedAmmo ?? 0,
        resuppliesReceivedLives: ps?.resuppliesReceivedLives ?? 0,
        emergencyResuppliesReceivedAmmo: ps?.emergencyResuppliesReceivedAmmo ?? 0,
        emergencyResuppliesReceivedLives: ps?.emergencyResuppliesReceivedLives ?? 0,
        doubleResuppliesReceived: ps?.doubleResuppliesReceived ?? 0,
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
        spEarned: isHeavySp ? null : (ps?.spEarned ?? 0),
        spSpent: isHeavySp ? null : spSpent,
        targetsDestroyed: ps?.targetsDestroyed ?? 0,
        penalties: sm5?.penalties ?? 0,
        livesLeft: sm5?.livesLeft ?? 0,
        shotsLeft: sm5?.shotsLeft ?? 0,
        uptime: ps?.uptime ?? 0,
        resupplyDowntime: ps?.resupplyDowntime ?? 0,
        otherDowntime: ps?.otherDowntime ?? 0,
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
    // Build iplId → scorecard UUID for post-reingest metadata restoration.
    const scorecardIdByIplId = new Map<string, string>();
    for (let i = 0; i < playerEntityList.length; i++) {
      const entity = playerEntityList[i]!;
      const iplId = entity.originalId.startsWith("#") ? entity.originalId : null;
      const scorecardId = scorecardRows[i]!.id;
      if (iplId) {
        scorecardIdByIplId.set(iplId, scorecardId);
      }
    }

    // -----------------------------------------------------------------------
    // 11. Insert GamePlayerInteractions
    // -----------------------------------------------------------------------
    const interactionRows = [];
    for (const [key, counts] of simResult.interactions) {
      const [actorId, targetId] = key.split("->") as [string, string];
      const actorScorecardId = scorecardIdByEntityId.get(actorId);
      const targetScorecardId = scorecardIdByEntityId.get(targetId);
      if (!actorScorecardId || !targetScorecardId) continue;

      interactionRows.push({
        gameId: existingGameId,
        scorecardId: actorScorecardId,
        targetScorecardId,
        shotsHit: counts.shotsHit,
        shotDeactivations: counts.shotDeactivations,
        missileHits: counts.missileHits,
      });
    }
    await insertGamePlayerInteractions(tx, interactionRows);

    // -----------------------------------------------------------------------
    // 12. Insert GameTargetDestructions
    // -----------------------------------------------------------------------
    const destructionRows = simResult.targetDestructions.map((d) => ({
      gameTargetId: gameTargetIdByHardwareId.get(d.targetHardwareId)!,
      scorecardId: scorecardIdByEntityId.get(d.actorEntityId)!,
      method: d.method,
      time: d.time,
    }));
    await insertGameTargetDestructions(tx, destructionRows);

    // -----------------------------------------------------------------------
    // 13. Insert GamePenalties (in-game only — from TDF)
    // -----------------------------------------------------------------------
    const penaltyRows = simResult.penalties.map((p) => ({
      gameId: existingGameId,
      refereeId: p.refereeEntityId ? (refereeIdByKey.get(p.refereeEntityId) ?? null) : null,
      scorecardId: scorecardIdByEntityId.get(p.targetEntityId)!,
      scoreValue: p.scoreValue,
      description: "Common Foul",
      time: p.time,
    }));
    await insertGamePenalties(tx, penaltyRows);

    // -----------------------------------------------------------------------
    // 14. Insert GameEvents
    // -----------------------------------------------------------------------
    const gameEventInsertRows = simResult.events.map((e) => ({
      gameId: existingGameId,
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

    const eventIdByIndex = new Map<number, string>();
    for (let i = 0; i < insertedEvents.length; i++) {
      eventIdByIndex.set(i, insertedEvents[i]!.id);
    }

    // -----------------------------------------------------------------------
    // 15. Insert GamePlayerStates
    // -----------------------------------------------------------------------
    const stateRows = [];
    for (const [entityId, ps] of simResult.playerStats) {
      const scorecardId = scorecardIdByEntityId.get(entityId);
      if (!scorecardId) continue;

      for (const snap of ps.stateSnapshots) {
        const eventId = eventIdByIndex.get(snap.eventIndex);
        if (!eventId) continue;

        stateRows.push({
          gameId: existingGameId,
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
    // 16. Insert ScorecardMvps
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
    // 17. Upsert PlayerCallsignHistory
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

    // -----------------------------------------------------------------------
    // 18. Restore game metadata (competition_id, exclude, description)
    // -----------------------------------------------------------------------
    await restoreGameMetadata(tx, existingGameId, {
      competitionId: preservedMeta.competitionId,
      exclude: preservedMeta.exclude,
      description: preservedMeta.description,
    });

    // -----------------------------------------------------------------------
    // 19. Restore in-game penalty metadata
    //     Query fresh in-game penalties within the transaction so we get
    //     the new UUIDs that were just inserted in step 13.
    // -----------------------------------------------------------------------
    const freshInGamePenalties = await getNewInGamePenaltiesWithIplTx(tx, existingGameId);

    for (const penalty of freshInGamePenalties) {
      const key = `${penalty.iplId ?? ""}:${penalty.time}`;
      const saved = preservedMeta.inGamePenalties.get(key);
      if (saved) {
        await applyPenaltyMetadata(tx, penalty.id, saved);
      }
    }

    // -----------------------------------------------------------------------
    // 20. Re-insert post-game penalties (time IS NULL)
    //     These were not in the TDF, so reingest doesn't recreate them —
    //     we restore them directly using new scorecard/referee UUIDs.
    // -----------------------------------------------------------------------
    if (preservedMeta.postGamePenalties.length > 0) {
      const postGameRows = preservedMeta.postGamePenalties.flatMap((p) => {
        const scorecardId = p.iplId ? (scorecardIdByIplId.get(p.iplId) ?? null) : null;
        if (!scorecardId) return [];

        let refereeId: string | null = null;
        if (p.refereeIplId) refereeId = refereeIdByKey.get(p.refereeIplId) ?? null;
        if (!refereeId && p.refereeHardwareId)
          refereeId = refereeIdByKey.get(p.refereeHardwareId) ?? null;

        return [
          {
            gameId: existingGameId,
            refereeId,
            scorecardId,
            scoreValue: p.scoreValue,
            description: p.description,
            time: null,
            type: p.type,
            mvpValue: p.mvpValue,
            inGame: p.inGame,
            rescinded: p.rescinded,
          },
        ];
      });

      await insertPostGamePenalties(tx, postGameRows);
    }

    // -----------------------------------------------------------------------
    // 21. Restore isMercenary flags
    // -----------------------------------------------------------------------
    for (const iplId of preservedMeta.mercenaries) {
      const scorecardId = scorecardIdByIplId.get(iplId);
      if (scorecardId) {
        await applyScorecardIsMercenary(tx, scorecardId);
      }
    }

    // -----------------------------------------------------------------------
    // 22. Restore competition_match_game
    // -----------------------------------------------------------------------
    if (preservedMeta.matchGame) {
      const { matchId, gameNumber, team1TdfTeamIndex, team2TdfTeamIndex } = preservedMeta.matchGame;
      const team1Id = teamIdByIndex.get(team1TdfTeamIndex);
      const team2Id = teamIdByIndex.get(team2TdfTeamIndex);
      if (team1Id && team2Id) {
        await insertCompetitionMatchGame(tx, {
          matchId,
          gameId: existingGameId,
          gameNumber,
          team1GameTeamId: team1Id,
          team2GameTeamId: team2Id,
        });
      }
    }

    // -----------------------------------------------------------------------
    // 23. Recalculate win/loss/draw accounting for post-game penalties
    //
    // Raw scorecard and team scores are kept as simulator output. The effective
    // score for result determination is: score + eliminationBonus + sum(penalty.scoreValue)
    // where scoreValue is negative for deductions (e.g. -1000 for a 1000-point penalty).
    // recalculateGameResult mirrors the web-UI penalty code path exactly.
    // -----------------------------------------------------------------------
    await recalculateGameResult(existingGameId, tx);
  });
}
