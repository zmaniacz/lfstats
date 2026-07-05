// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  db,
  deleteLbGameChildren,
  getGameById,
  getLbGameIdsForReingest,
  initDb,
  insertLbGameEvents,
  insertLbGamePlayerInteractions,
  insertLbGamePlayerStates,
  insertLbGameTeams,
  insertLbScorecards,
  restoreGameMetadata,
  updateGameRow,
  upsertCenter,
  upsertPlayerCallsignHistoryBulk,
  upsertPlayersBulk,
  upsertBattlesuitsBulk,
} from "@lfstats/db";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildArchiveKey, parseGameStartTime } from "./ingester.js";
import { ParseError, parseTdf, RejectionError } from "./parser.js";
import { fetchTdf } from "./s3.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";

const DEADLOCK_CODE = "40P01";
const MAX_RETRIES = 3;
const CONCURRENCY = 5;

const targetGameId = process.argv[2] ?? null;

const MODERN_ARCHIVE_BUCKET = process.env.MODERN_ARCHIVE_BUCKET;
if (!MODERN_ARCHIVE_BUCKET) {
  console.error("Missing env var: MODERN_ARCHIVE_BUCKET");
  process.exit(1);
}

await initDb();

let gameList: { id: string; tdfFilename: string }[];

if (targetGameId) {
  const row = await getGameById(targetGameId);
  if (!row) {
    console.error(`Game not found: ${targetGameId}`);
    process.exit(1);
  }
  gameList = [{ id: row.id, tdfFilename: row.tdfFilename }];
  console.log(`Single-game Laserball reingest: ${targetGameId}`);
} else {
  gameList = await getLbGameIdsForReingest();
  console.log(`Bulk Laserball reingest: ${gameList.length} games`);
}

if (gameList.length === 0) {
  console.log("No Laserball games to reingest.");
  process.exit(0);
}

console.log(`Starting reingest (concurrency=${CONCURRENCY})…\n`);

type ResultEntry =
  | { id: string; status: "reingested" }
  | { id: string; status: "skipped"; reason: string }
  | { id: string; status: "failed"; reason: string };

const results: ResultEntry[] = [];
let reingested = 0;
let skipped = 0;
let failed = 0;
let done = 0;

let currentStatus = "";

function printStatus(): void {
  const pct = Math.floor((done / gameList.length) * 100);
  currentStatus = `${done}/${gameList.length} (${pct}%)  reingested=${reingested}  skipped=${skipped}  failed=${failed}`;
  process.stdout.write(`\r${currentStatus}`);
}

function log(message: string): void {
  process.stdout.write(`\r${" ".repeat(currentStatus.length)}\r${message}\n`);
  if (currentStatus) printStatus();
}

async function processGame(gameEntry: { id: string; tdfFilename: string }): Promise<void> {
  const { id: gameId, tdfFilename } = gameEntry;

  // 1. Download TDF
  let buffer: Buffer;
  try {
    buffer = await fetchTdf(MODERN_ARCHIVE_BUCKET!, tdfFilename);
  } catch (err) {
    const reason = `S3 download failed: ${(err as Error).message}`;
    log(`SKIP ${gameId} (${tdfFilename}): ${reason}`);
    results.push({ id: gameId, status: "skipped", reason });
    skipped++;
    return;
  }

  // 2. Parse TDF
  let parsed;
  try {
    parsed = parseTdf(buffer);
  } catch (err) {
    const reason =
      err instanceof RejectionError
        ? `Rejected: ${err.message}`
        : err instanceof ParseError
          ? `Parse error: ${err.message}`
          : `Unexpected parse error: ${(err as Error).message}`;
    log(`FAIL [parse] ${gameId}: ${reason}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  // 3. Verify it's Laserball
  if (parsed.meta.missionType !== LASERBALL_MISSION_TYPE) {
    const reason = `Mission type ${parsed.meta.missionType} is not Laserball`;
    log(`SKIP ${gameId}: ${reason}`);
    results.push({ id: gameId, status: "skipped", reason });
    skipped++;
    return;
  }

  // 4. Simulate
  let sim;
  try {
    sim = simulateLaserball(parsed);
  } catch (err) {
    const reason = `Simulation failed: ${(err as Error).message}`;
    log(`FAIL [simulate] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  if (sim.playerStats.size === 0) {
    const reason = "No qualifying Laserball players";
    log(`SKIP ${gameId}: ${reason}`);
    results.push({ id: gameId, status: "skipped", reason });
    skipped++;
    return;
  }

  if (!sim.goalCheck.ok) {
    const reason =
      `goal/score mismatch goals=${JSON.stringify(sim.goalCheck.teamGoals)} ` +
      `scoreEvents=${JSON.stringify(sim.goalCheck.scoreEventGoals)}`;
    log(`FAIL [goalcheck] ${gameId}: ${reason}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  // 5. Snapshot metadata to preserve
  const gameRow = await getGameById(gameId);
  if (!gameRow) {
    const reason = "Game row disappeared between listing and reingest";
    log(`FAIL [missing] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  const preservedMeta = {
    competitionId: gameRow.competitionId ?? null,
    exclude: gameRow.exclude,
    description: gameRow.description ?? null,
  };

  // 6. Reingest in a transaction (with deadlock retry)
  const gameStartTime = parseGameStartTime(parsed.meta.startTime);

  for (let attempt = 1; ; attempt++) {
    try {
      await reingestLb(gameId, preservedMeta, parsed, sim, gameStartTime);
      break;
    } catch (err: unknown) {
      const isDeadlock =
        typeof err === "object" &&
        err !== null &&
        "cause" in err &&
        typeof (err as { cause?: unknown }).cause === "object" &&
        (err as { cause?: { code?: string } }).cause?.code === DEADLOCK_CODE;
      if (!isDeadlock || attempt >= MAX_RETRIES) {
        const reason = `Reingest failed: ${(err as Error).message}`;
        log(`FAIL [reingest] ${gameId}`);
        results.push({ id: gameId, status: "failed", reason });
        failed++;
        return;
      }
      log(`Deadlock on ${gameId} attempt ${attempt}, retrying…`);
    }
  }

  log(`OK ${gameId}`);
  results.push({ id: gameId, status: "reingested" });
  reingested++;
}

async function reingestLb(
  existingGameId: string,
  preservedMeta: { competitionId: string | null; exclude: boolean; description: string | null },
  parsed: ReturnType<typeof parseTdf>,
  sim: ReturnType<typeof simulateLaserball>,
  gameStartTime: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Delete child records
    await deleteLbGameChildren(tx, existingGameId);

    // 2. Upsert Center
    const centerRow = await upsertCenter(tx, {
      countryCode: parsed.meta.countryCode,
      siteCode: parsed.meta.siteCode,
      name: "Unknown Center",
    });
    const centerId = centerRow.id;

    // 3. Upsert Players
    const playerIdByEntityId = new Map<string, string>();
    const playerEntities = parsed.entities
      .filter((e) => e.type === "player" && e.originalId.startsWith("#"))
      .sort((a, b) => a.originalId.localeCompare(b.originalId));

    const dedupedPlayers = new Map(
      playerEntities.map((e) => [
        e.originalId,
        {
          iplId: e.originalId,
          memberId: e.memberId ?? null,
          currentCallsign: e.desc,
          firstSeenAt: gameStartTime,
        },
      ]),
    );

    const playerRows = await upsertPlayersBulk(tx, [...dedupedPlayers.values()]);
    const playerIdByIplId = new Map(playerRows.map((r) => [r.iplId, r.id]));
    for (const entity of playerEntities) {
      const pid = playerIdByIplId.get(entity.originalId);
      if (pid) playerIdByEntityId.set(entity.id, pid);
    }

    // 4. Update Game row
    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );

    await updateGameRow(tx, existingGameId, {
      outcome: sim.outcome,
      scheduledDuration: parsed.meta.duration,
      actualDuration: sim.actualDuration,
      tdfFilename: archiveKey,
    });

    // 5. Insert Teams
    const teamRows = await insertLbGameTeams(
      tx,
      sim.teams.map((t) => ({
        gameId: existingGameId,
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

    // 6. Upsert Battlesuits
    const battlesuitIdByName = new Map<string, string>();
    const battlesuitEntities = parsed.entities
      .filter((e) => !!e.battlesuit)
      .sort((a, b) => a.battlesuit!.localeCompare(b.battlesuit!));

    const battlesuitDeduped = new Map<
      string,
      { centerId: string; name: string; hardwareId: string | null }
    >();
    for (const entity of battlesuitEntities) {
      const hardwareId = entity.type !== "player" ? entity.id : null;
      const existing = battlesuitDeduped.get(entity.battlesuit!);
      if (!existing || (hardwareId !== null && existing.hardwareId === null)) {
        battlesuitDeduped.set(entity.battlesuit!, {
          centerId,
          name: entity.battlesuit!,
          hardwareId,
        });
      }
    }
    const battlesuitRows = await upsertBattlesuitsBulk(tx, [...battlesuitDeduped.values()]);
    for (const row of battlesuitRows) battlesuitIdByName.set(row.name, row.id);

    // 7. Insert Scorecards
    const persistedPlayers = [...sim.playerStats.values()];
    const scorecardInsertRows = persistedPlayers.map((p) => {
      const timePlayedMs =
        p.firstSeen !== null && p.lastSeen !== null ? p.lastSeen - p.firstSeen : 0;
      return {
        gameId: existingGameId,
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

    // 8. Insert Interactions
    const interactionRows = [];
    for (const [key, counts] of sim.interactions) {
      const [actorId, targetId] = key.split("->") as [string, string];
      const actorScorecardId = scorecardIdByEntityId.get(actorId);
      const targetScorecardId = scorecardIdByEntityId.get(targetId);
      if (!actorScorecardId || !targetScorecardId) continue;
      interactionRows.push({
        gameId: existingGameId,
        scorecardId: actorScorecardId,
        targetScorecardId,
        steals: counts.steals,
        blocks: counts.blocks,
        passes: counts.passes,
      });
    }
    await insertLbGamePlayerInteractions(tx, interactionRows);

    // 9. Insert Events
    const eventInsertRows = sim.events.map((e) => ({
      gameId: existingGameId,
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

    // 10. Insert Player States (with new running tally columns)
    const stateRows = [];
    for (const p of persistedPlayers) {
      const scorecardId = scorecardIdByEntityId.get(p.entityId);
      if (!scorecardId) continue;
      for (const snap of p.stateSnapshots) {
        const eventId = eventIdByIndex.get(snap.eventIndex);
        if (!eventId) continue;
        stateRows.push({
          gameId: existingGameId,
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

    // 11. Upsert Player Callsign History
    const callsignHistoryDeduped = new Map<
      string,
      { playerId: string; callsign: string; firstSeenAt: Date; lastSeenAt: Date }
    >();
    for (const entity of playerEntities) {
      const playerId = playerIdByEntityId.get(entity.id);
      if (!playerId) continue;
      const key = `${playerId}:${entity.desc}`;
      if (!callsignHistoryDeduped.has(key)) {
        callsignHistoryDeduped.set(key, {
          playerId,
          callsign: entity.desc,
          firstSeenAt: gameStartTime,
          lastSeenAt: gameStartTime,
        });
      }
    }
    await upsertPlayerCallsignHistoryBulk(tx, [...callsignHistoryDeduped.values()]);

    // 12. Restore game metadata
    await restoreGameMetadata(tx, existingGameId, preservedMeta);
  });
}

// Worker pool
const queue = [...gameList];
printStatus();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, gameList.length) }, async () => {
    while (queue.length > 0) {
      await processGame(queue.shift()!);
      done++;
      printStatus();
    }
  }),
);
process.stdout.write("\n");

console.log(
  `\n${reingested} reingested, ${skipped} skipped, ${failed} failed out of ${gameList.length} games`,
);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(`bulk-reingest-lb-results-${timestamp}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary: {
        total: gameList.length,
        reingested,
        skipped,
        failed: results
          .filter((r) => r.status === "failed")
          .map((r) => ({ id: r.id, reason: r.reason })),
      },
      results: results.sort((a, b) => a.id.localeCompare(b.id)),
    },
    null,
    2,
  ),
);
console.log(`\nResults written to: ${outPath}`);

process.exit(failed > 0 ? 1 : 0);
