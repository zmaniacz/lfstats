// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  findActiveMvpModel,
  findCenterByNaturalKey,
  findGameByNaturalKey,
  initDb,
} from "@lfstats/db";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildArchiveKey, ingest, parseGameStartTime } from "./ingester.js";
import { calculateMvp } from "./mvp.js";
import { ParseError, parseTdf, RejectionError } from "./parser.js";
import { archiveTdf, fetchTdf, listTdfs } from "./s3.js";
import { runConsistencyCheck, simulate } from "./simulator.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { ingestLaserball } from "./laserball/ingester.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";

const DEADLOCK_CODE = "40P01";
const MAX_INGEST_RETRIES = 3;

async function ingestWithRetry(...args: Parameters<typeof ingest>): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ingest(...args);
    } catch (err: unknown) {
      const isDeadlock =
        typeof err === "object" &&
        err !== null &&
        "cause" in err &&
        typeof (err as { cause?: unknown }).cause === "object" &&
        (err as { cause?: { code?: string } }).cause?.code === DEADLOCK_CODE;
      if (!isDeadlock || attempt >= MAX_INGEST_RETRIES) throw err;
      console.warn(`Deadlock on ingest attempt ${attempt}, retrying…`);
    }
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regexStr}$`);
}

const pattern = process.argv[2];
if (!pattern) {
  console.error("Usage: pnpm bulk-ingest <pattern>");
  console.error('  e.g. pnpm bulk-ingest "1-1-"       # prefix match');
  console.error('       pnpm bulk-ingest "*2026*"      # wildcard match');
  console.error('       pnpm bulk-ingest "1-1-2026*"   # combined');
  process.exit(1);
}

// Extract the leading literal portion before any wildcard to use as the S3 list prefix.
// The rest of the pattern is applied as a client-side glob filter.
const wildcardIndex = pattern.search(/[*?]/);
const s3Prefix = wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
const filterRegex = wildcardIndex === -1 ? null : globToRegex(pattern);

const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET;
const MODERN_ARCHIVE_BUCKET = process.env.MODERN_ARCHIVE_BUCKET;
const ERROR_BUCKET = process.env.ERROR_BUCKET;
if (!MODERN_ARCHIVE_BUCKET) {
  console.error("Missing env var: MODERN_ARCHIVE_BUCKET");
  process.exit(1);
}
if (!ARCHIVE_BUCKET) {
  console.error("Missing env var: ARCHIVE_BUCKET");
  process.exit(1);
}
if (!ERROR_BUCKET) {
  console.error("Missing env var: ERROR_BUCKET");
  process.exit(1);
}

await initDb();

const mvpModel = await findActiveMvpModel();
if (!mvpModel) {
  console.error("No active MVP model found in database");
  process.exit(1);
}

console.log(`Listing TDF files from s3://${ARCHIVE_BUCKET} matching "${pattern}"…`);
const allKeys = await listTdfs(ARCHIVE_BUCKET, s3Prefix);
const keys = filterRegex ? allKeys.filter((k) => filterRegex.test(k)) : allKeys;

if (keys.length === 0) {
  console.log("No matching TDF files found.");
  process.exit(0);
}

//leaving at one to preserve codename history
const CONCURRENCY = 1;

console.log(`Found ${keys.length} files. Starting ingest (concurrency=${CONCURRENCY})…\n`);

type ResultEntry =
  | { key: string; status: "ingested"; gameId: string }
  | { key: string; status: "skipped"; reason: string }
  | { key: string; status: "rejected"; reason: string }
  | { key: string; status: "failed"; reason: string };

const results: ResultEntry[] = [];
let ingested = 0;
let skipped = 0;
let rejected = 0;
let failed = 0;
let done = 0;

let currentStatus = "";

function printStatus(): void {
  const pct = Math.floor((done / keys.length) * 100);
  currentStatus = `${done}/${keys.length} (${pct}%)  ingested=${ingested}  skipped=${skipped}  rejected=${rejected}  failed=${failed}`;
  process.stdout.write(`\r${currentStatus}`);
}

function log(message: string): void {
  // Clear the status line, print the message on its own line, redraw status.
  process.stdout.write(`\r${" ".repeat(currentStatus.length)}\r${message}\n`);
  if (currentStatus) printStatus();
}

async function processKey(key: string): Promise<void> {
  // 1. Download
  let buffer: Buffer;
  try {
    buffer = await fetchTdf(ARCHIVE_BUCKET!, key);
  } catch (err) {
    const reason = `S3 download failed: ${(err as Error).message}`;
    log(`FAIL [download] ${key}`);
    results.push({ key, status: "failed", reason });
    failed++;
    return;
  }

  // 2. Parse
  let parsed;
  try {
    parsed = parseTdf(buffer);
  } catch (err) {
    if (err instanceof RejectionError) {
      const reason = `Rejected: ${err.message}`;
      log(`REJECT ${key}: ${reason}`);
      results.push({ key, status: "rejected", reason });
      rejected++;
      await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
      return;
    }
    if (err instanceof ParseError) {
      const reason = `Parse error: ${err.message}`;
      log(`FAIL [parse] ${key}: ${reason}`);
      results.push({ key, status: "failed", reason });
      failed++;
      await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
      return;
    }
    const reason = `Unexpected parse error: ${(err as Error).message}`;
    log(`FAIL [parse] ${key}: ${reason}`);
    results.push({ key, status: "failed", reason });
    failed++;
    await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
    return;
  }

  // 3. Skip mission types we don't track
  if (parsed.meta.missionType !== 5 && parsed.meta.missionType !== LASERBALL_MISSION_TYPE) {
    log(`SKIP ${key} (mission type ${parsed.meta.missionType})`);
    results.push({
      key,
      status: "skipped",
      reason: `Mission type ${parsed.meta.missionType} is not SM5 or Laserball`,
    });
    skipped++;
    return;
  }

  // 3b. Skip playerless games (cancelled before anyone joined)
  if (!parsed.entities.some((e) => e.type === "player")) {
    log(`SKIP ${key} (no players — game cancelled before anyone joined)`);
    results.push({
      key,
      status: "skipped",
      reason: "No player entities — game cancelled before anyone joined",
    });
    skipped++;
    return;
  }

  // 4. Duplicate check
  const gameStartTime = parseGameStartTime(parsed.meta.startTime);
  const existingCenter = await findCenterByNaturalKey(
    parsed.meta.countryCode,
    parsed.meta.siteCode,
  );
  if (existingCenter) {
    const existingGame = await findGameByNaturalKey(existingCenter.id, gameStartTime);
    if (existingGame) {
      log(`SKIP ${key} (duplicate game ${existingGame.id})`);
      results.push({
        key,
        status: "skipped",
        reason: `Duplicate game: gameId=${existingGame.id}`,
      });
      skipped++;
      return;
    }
  }

  // 4b. Laserball path (no line-7 consistency / MVP; assert goals↔score invariant)
  if (parsed.meta.missionType === LASERBALL_MISSION_TYPE) {
    let lbGameId: string;
    try {
      const lb = simulateLaserball(parsed);
      if (!lb.goalCheck.ok) {
        throw new Error(
          `goal/score mismatch goals=${JSON.stringify(lb.goalCheck.teamGoals)} ` +
            `scoreEvents=${JSON.stringify(lb.goalCheck.scoreEventGoals)}`,
        );
      }
      lbGameId = await ingestLaserball(parsed, lb, gameStartTime, null);
    } catch (err) {
      const reason = `Laserball ingest failed: ${(err as Error).message}`;
      log(`FAIL [laserball] ${key}`);
      results.push({ key, status: "failed", reason });
      failed++;
      await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
      return;
    }
    log(`OK ${key} → gameId=${lbGameId} (laserball)`);
    results.push({ key, status: "ingested", gameId: lbGameId });
    ingested++;
    const lbArchiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );
    await archiveTdf(ARCHIVE_BUCKET!, key, MODERN_ARCHIVE_BUCKET!, lbArchiveKey, false);
    return;
  }

  // 5. Simulate
  let simResult;
  try {
    simResult = simulate(parsed);
  } catch (err) {
    const reason = `Simulation failed: ${(err as Error).message}`;
    log(`FAIL [simulate] ${key}`);
    results.push({ key, status: "failed", reason });
    failed++;
    await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
    return;
  }

  // 6. Consistency check
  const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
  const { discrepancies } = runConsistencyCheck(simResult.playerStats, sm5StatsById);
  if (discrepancies.length > 0) {
    const reason = `Consistency check failed:\n${JSON.stringify(discrepancies, null, 2)}`;
    log(`FAIL [consistency] ${key}`);
    results.push({ key, status: "failed", reason });
    failed++;
    await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
    return;
  }

  // 7. MVP calculation
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

  // 8. Ingest to database
  let gameId: string;
  try {
    gameId = await ingestWithRetry(parsed, simResult, gameStartTime, mvpRows, "sm5", null);
  } catch (err) {
    const reason = `Ingest failed: ${(err as Error).message}`;
    log(`FAIL [ingest] ${key}`);
    results.push({ key, status: "failed", reason });
    failed++;
    await archiveTdf(ARCHIVE_BUCKET!, key, ERROR_BUCKET!, key, false);
    return;
  }

  log(`OK ${key} → gameId=${gameId}`);
  results.push({ key, status: "ingested", gameId });
  ingested++;
  const archiveKey = buildArchiveKey(
    parsed.meta.countryCode,
    parsed.meta.siteCode,
    parsed.meta.startTime,
  );
  await archiveTdf(ARCHIVE_BUCKET!, key, MODERN_ARCHIVE_BUCKET!, archiveKey, false);
}

// Worker pool: each worker pulls from the queue until empty.
const queue = [...keys];
printStatus();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, keys.length) }, async () => {
    while (queue.length > 0) {
      await processKey(queue.shift()!);
      done++;
      printStatus();
    }
  }),
);
// Move past the status line before printing the summary.
process.stdout.write("\n");

console.log(
  `\n${ingested} ingested, ${skipped} skipped, ${failed} failed out of ${keys.length} files`,
);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = resolve(`bulk-ingest-results-${timestamp}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      summary: {
        total: keys.length,
        ingested,
        skipped,
        failed: results
          .filter((r) => r.status === "failed")
          .map((r) => ({ key: r.key, reason: r.reason })),
      },
      pattern,
      bucket: ARCHIVE_BUCKET,
      results: results.sort((a, b) => a.key.localeCompare(b.key)),
    },
    null,
    2,
  ),
);
console.log(`\nResults written to: ${outPath}`);

process.exit(failed > 0 ? 1 : 0);
