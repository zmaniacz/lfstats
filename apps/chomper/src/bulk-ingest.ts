import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findActiveMvpModel,
  findCenterByNaturalKey,
  findGameByNaturalKey,
  initDb,
} from "@lfstats/db";
import { buildArchiveKey, ingest, parseGameStartTime } from "./ingester.js";
import { calculateMvp } from "./mvp.js";
import { ParseError, parseTdf } from "./parser.js";
import { listTdfs, fetchTdf } from "./s3.js";
import { runConsistencyCheck, simulate } from "./simulator.js";

const DEADLOCK_CODE = "40P01";
const MAX_INGEST_RETRIES = 3;

async function ingestWithRetry(
  ...args: Parameters<typeof ingest>
): Promise<string> {
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
if (!ARCHIVE_BUCKET) {
  console.error("Missing env var: ARCHIVE_BUCKET");
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

const CONCURRENCY = 10;

console.log(`Found ${keys.length} files. Starting ingest (concurrency=${CONCURRENCY})…\n`);

type ResultEntry =
  | { key: string; status: "ingested"; gameId: string }
  | { key: string; status: "skipped"; reason: string }
  | { key: string; status: "failed"; reason: string };

const results: ResultEntry[] = [];
let ingested = 0;
let skipped = 0;
let failed = 0;
let done = 0;

let currentStatus = "";

function printStatus(): void {
  const pct = Math.floor((done / keys.length) * 100);
  currentStatus = `${done}/${keys.length} (${pct}%)  ingested=${ingested}  skipped=${skipped}  failed=${failed}`;
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
    const reason = err instanceof ParseError ? err.message : String(err);
    log(`FAIL [parse] ${key}`);
    results.push({ key, status: "failed", reason: `Parse error: ${reason}` });
    failed++;
    return;
  }

  // 3. Skip non-SM5
  if (parsed.meta.missionType !== 5) {
    log(`SKIP ${key} (mission type ${parsed.meta.missionType})`);
    results.push({ key, status: "skipped", reason: `Mission type ${parsed.meta.missionType} is not SM5` });
    skipped++;
    return;
  }

  // 3b. Skip playerless games (cancelled before anyone joined)
  if (!parsed.entities.some((e) => e.type === "player")) {
    log(`SKIP ${key} (no players — game cancelled before anyone joined)`);
    results.push({ key, status: "skipped", reason: "No player entities — game cancelled before anyone joined" });
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
      results.push({ key, status: "skipped", reason: `Duplicate game: gameId=${existingGame.id}` });
      skipped++;
      return;
    }
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
    gameId = await ingestWithRetry(parsed, simResult, gameStartTime, mvpRows, "sm5");
  } catch (err) {
    const reason = `Ingest failed: ${(err as Error).message}`;
    log(`FAIL [ingest] ${key}`);
    results.push({ key, status: "failed", reason });
    failed++;
    return;
  }

  log(`OK ${key} → gameId=${gameId}`);
  results.push({ key, status: "ingested", gameId });
  ingested++;
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

console.log(`\n${ingested} ingested, ${skipped} skipped, ${failed} failed out of ${keys.length} files`);

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
