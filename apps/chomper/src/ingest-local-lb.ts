// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Local batch ingester for Laserball TDFs from a directory on disk (no S3).
// Usage: pnpm --filter chomper exec tsx --env-file=../../packages/db/.env \
//          src/ingest-local-lb.ts ../../demo_files/laserball
//
// Skips non-TDF (HTML) files, non-Laserball mission types, duplicates already in
// the DB, and games whose goals↔line-5-score invariant fails.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findCenterByNaturalKey, findGameByNaturalKey } from "@lfstats/db";
import { parseTdf, ParseError, RejectionError } from "./parser.js";
import { parseGameStartTime } from "./ingester.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { ingestLaserball } from "./laserball/ingester.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";

const dir = resolve(process.argv[2] ?? "../../demo_files/laserball");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".tdf"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 64).toString("latin1").toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<head");
}

let ingested = 0;
let skipped = 0;
let failed = 0;
const failures: { file: string; reason: string }[] = [];

console.log(`Ingesting Laserball TDFs from ${dir} (${files.length} files)\n`);

for (const file of files) {
  const path = join(dir, file);
  try {
    const buf = readFileSync(path);
    if (looksLikeHtml(buf)) {
      skipped++;
      console.log(`SKIP ${file} (not a TDF)`);
      continue;
    }

    const parsed = parseTdf(buf);
    if (parsed.meta.missionType !== LASERBALL_MISSION_TYPE) {
      skipped++;
      console.log(`SKIP ${file} (mission type ${parsed.meta.missionType})`);
      continue;
    }
    if (!parsed.entities.some((e) => e.type === "player")) {
      skipped++;
      console.log(`SKIP ${file} (no players)`);
      continue;
    }

    const gameStartTime = parseGameStartTime(parsed.meta.startTime);
    const center = await findCenterByNaturalKey(parsed.meta.countryCode, parsed.meta.siteCode);
    if (center) {
      const existing = await findGameByNaturalKey(center.id, gameStartTime);
      if (existing) {
        skipped++;
        console.log(`SKIP ${file} (duplicate game ${existing.id})`);
        continue;
      }
    }

    const lb = simulateLaserball(parsed);
    if (lb.playerStats.size === 0) {
      skipped++;
      console.log(`SKIP ${file} (no qualifying players — all under playtime threshold)`);
      continue;
    }
    if (!lb.goalCheck.ok) {
      failed++;
      const reason = `goal/score mismatch ${JSON.stringify(lb.goalCheck)}`;
      failures.push({ file, reason });
      console.error(`FAIL ${file} (${reason})`);
      continue;
    }

    const gameId = await ingestLaserball(parsed, lb, gameStartTime, null);
    ingested++;
    console.log(`OK   ${file} → ${gameId} (${lb.outcome}, ${lb.playerStats.size} players)`);
  } catch (err) {
    failed++;
    const reason =
      err instanceof RejectionError || err instanceof ParseError
        ? err.message
        : String((err as Error)?.stack ?? err);
    failures.push({ file, reason });
    console.error(`FAIL ${file} (${reason})`);
  }
}

console.log(
  `\nDone: ${ingested} ingested, ${skipped} skipped, ${failed} failed (of ${files.length}).`,
);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const { file, reason } of failures) console.log(`  ${file}: ${reason}`);
}
process.exit(failed > 0 ? 1 : 0);
