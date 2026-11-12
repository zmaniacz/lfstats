// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  findIngestMvpModels,
  getGameById,
  getGameIdsForReingest,
  assertReingestHandlesGameTeamReferences,
  initDb,
} from "@lfstats/db";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { reingestSm5Game } from "./reingest-sm5-game.js";
import { fetchTdf } from "./s3.js";

const targetGameId = process.argv[2] ?? null;

const MODERN_ARCHIVE_BUCKET = process.env.MODERN_ARCHIVE_BUCKET;
if (!MODERN_ARCHIVE_BUCKET) {
  console.error("Missing env var: MODERN_ARCHIVE_BUCKET");
  process.exit(1);
}

await initDb();
await assertReingestHandlesGameTeamReferences();

let mvpModels: Awaited<ReturnType<typeof findIngestMvpModels>>;
try {
  mvpModels = await findIngestMvpModels();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
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

  // 2. Parse, simulate, check and rebuild
  const result = await reingestSm5Game(gameId, buffer, mvpModels);
  if (result.status === "skipped") {
    log(`SKIP ${gameId}: ${result.reason}`);
    results.push({ id: gameId, status: "skipped", reason: result.reason });
    skipped++;
    return;
  }
  if (result.status === "failed") {
    log(
      result.stage === "parse"
        ? `FAIL [parse] ${gameId}: ${result.reason}`
        : `FAIL [${result.stage}] ${gameId}`,
    );
    results.push({ id: gameId, status: "failed", reason: result.reason });
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
