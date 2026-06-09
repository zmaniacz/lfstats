// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  findActiveMvpModel,
  getCompetitionMatchGameForReingest,
  getGameById,
  getGameIdsForReingest,
  getPenaltiesWithIplForReingest,
  getScorecardsIsMercenaryForReingest,
  initDb,
} from "@lfstats/db";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseGameStartTime } from "./ingester.js";
import { calculateMvp } from "./mvp.js";
import { ParseError, parseTdf, RejectionError } from "./parser.js";
import type { PreservedGameMeta } from "./reingester.js";
import { reingest } from "./reingester.js";
import { fetchTdf } from "./s3.js";
import { runConsistencyCheck, simulate } from "./simulator.js";

const DEADLOCK_CODE = "40P01";
const MAX_REINGEST_RETRIES = 3;

async function reingestWithRetry(...args: Parameters<typeof reingest>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await reingest(...args);
    } catch (err: unknown) {
      const isDeadlock =
        typeof err === "object" &&
        err !== null &&
        "cause" in err &&
        typeof (err as { cause?: unknown }).cause === "object" &&
        (err as { cause?: { code?: string } }).cause?.code === DEADLOCK_CODE;
      if (!isDeadlock || attempt >= MAX_REINGEST_RETRIES) throw err;
      console.warn(`Deadlock on reingest attempt ${attempt}, retrying…`);
    }
  }
}

const targetGameId = process.argv[2] ?? null;

const MODERN_ARCHIVE_BUCKET = process.env.MODERN_ARCHIVE_BUCKET;
if (!MODERN_ARCHIVE_BUCKET) {
  console.error("Missing env var: MODERN_ARCHIVE_BUCKET");
  process.exit(1);
}

await initDb();

const mvpModel = await findActiveMvpModel();
if (!mvpModel) {
  console.error("No active MVP model found in database");
  process.exit(1);
}

// Build list of games to process
let gameList: { id: string; tdfFilename: string }[];

if (targetGameId) {
  const row = await getGameById(targetGameId);
  if (!row) {
    console.error(`Game not found: ${targetGameId}`);
    process.exit(1);
  }
  gameList = [{ id: row.id, tdfFilename: row.tdfFilename }];
  console.log(`Single-game reingest: ${targetGameId}`);
} else {
  gameList = await getGameIdsForReingest();
  console.log(`Bulk reingest: ${gameList.length} games`);
}

if (gameList.length === 0) {
  console.log("No games to reingest.");
  process.exit(0);
}

const CONCURRENCY = 5;

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

  // 3. Skip non-SM5 (sanity check — all DB games should be SM5)
  if (parsed.meta.missionType !== 5) {
    const reason = `Mission type ${parsed.meta.missionType} is not SM5`;
    log(`SKIP ${gameId}: ${reason}`);
    results.push({ id: gameId, status: "skipped", reason });
    skipped++;
    return;
  }

  // 4. Simulate
  let simResult;
  try {
    simResult = simulate(parsed);
  } catch (err) {
    const reason = `Simulation failed: ${(err as Error).message}`;
    log(`FAIL [simulate] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  // 5. Consistency check
  const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
  const { discrepancies } = runConsistencyCheck(simResult.playerStats, sm5StatsById);
  if (discrepancies.length > 0) {
    const reason = `Consistency check failed:\n${JSON.stringify(discrepancies, null, 2)}`;
    log(`FAIL [consistency] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  // 6. Snapshot metadata to preserve
  const [gameRow, matchGameRow, penaltyRows, mercenaryRows] = await Promise.all([
    getGameById(gameId),
    getCompetitionMatchGameForReingest(gameId),
    getPenaltiesWithIplForReingest(gameId),
    getScorecardsIsMercenaryForReingest(gameId),
  ]);

  if (!gameRow) {
    const reason = "Game row disappeared between listing and reingest";
    log(`FAIL [missing] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  const inGamePenalties = new Map<
    string,
    { rescinded: boolean; type: string; mvpValue: number; description: string; inGame: boolean }
  >();
  const postGamePenalties: PreservedGameMeta["postGamePenalties"] = [];

  for (const p of penaltyRows) {
    if (p.time !== null) {
      const key = `${p.iplId ?? ""}:${p.time}`;
      inGamePenalties.set(key, {
        rescinded: p.rescinded,
        type: p.type,
        mvpValue: p.mvpValue,
        description: p.description,
        inGame: p.inGame,
      });
    } else {
      postGamePenalties.push({
        iplId: p.iplId,
        refereeIplId: p.refereeIplId,
        refereeHardwareId: p.refereeHardwareId,
        scoreValue: p.scoreValue,
        description: p.description,
        type: p.type,
        mvpValue: p.mvpValue,
        inGame: p.inGame,
        rescinded: p.rescinded,
      });
    }
  }

  const preservedMeta: PreservedGameMeta = {
    competitionId: gameRow.competitionId ?? null,
    exclude: gameRow.exclude,
    description: gameRow.description ?? null,
    matchGame: matchGameRow
      ? {
          matchId: matchGameRow.matchId,
          gameNumber: matchGameRow.gameNumber,
          team1TdfTeamIndex: matchGameRow.team1TdfTeamIndex,
          team2TdfTeamIndex: matchGameRow.team2TdfTeamIndex,
        }
      : null,
    inGamePenalties,
    postGamePenalties,
    mercenaries: new Set(mercenaryRows.map((r) => r.iplId).filter((id): id is string => !!id)),
  };

  // 7. Calculate MVP
  const gameStartTime = parseGameStartTime(parsed.meta.startTime);
  const entityEndsById = new Map(
    parsed.entityEnds.map((e) => [e.id, { score: e.score, exitType: e.exitType }]),
  );
  const mvpRows = calculateMvp(
    simResult,
    sm5StatsById,
    entityEndsById,
    mvpModel!,
    parsed.meta.duration,
  );

  // 8. Reingest
  try {
    await reingestWithRetry(
      gameId,
      preservedMeta,
      parsed,
      simResult,
      gameStartTime,
      mvpRows,
      "sm5",
    );
  } catch (err) {
    const reason = `Reingest failed: ${(err as Error).message}`;
    log(`FAIL [reingest] ${gameId}`);
    results.push({ id: gameId, status: "failed", reason });
    failed++;
    return;
  }

  log(`OK ${gameId}`);
  results.push({ id: gameId, status: "reingested" });
  reingested++;
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
const outPath = resolve(`bulk-reingest-results-${timestamp}.json`);
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
