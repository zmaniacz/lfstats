// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseTdf, ParseError, RejectionError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";

const demoDir = resolve(import.meta.dirname, "../../../demo_files");
const lbDir = join(demoDir, "laserball");

// Collect SM5 demo files (top-level) and Laserball demo files (laserball/ subdir).
const sm5Files = readdirSync(demoDir)
  .filter((f) => f.endsWith(".tdf"))
  .sort()
  .map((f) => ({ file: f, path: join(demoDir, f) }));
let lbFiles: { file: string; path: string }[] = [];
try {
  lbFiles = readdirSync(lbDir)
    .filter((f) => f.endsWith(".tdf"))
    .sort()
    .map((f) => ({ file: `laserball/${f}`, path: join(lbDir, f) }));
} catch {
  // no laserball dir — fine
}
const entries = [...sm5Files, ...lbFiles];

if (entries.length === 0) {
  console.error("No .tdf files found in demo_files/");
  process.exit(1);
}

for (const dir of [demoDir, lbDir]) {
  let stale: string[] = [];
  try {
    stale = readdirSync(dir).filter((f) => f.endsWith(".debug.json"));
  } catch {
    continue;
  }
  for (const f of stale) rmSync(join(dir, f));
  if (stale.length > 0) console.log(`Deleted ${stale.length} stale .debug.json files in ${dir}`);
}

// Heuristic: a downloaded file that is actually an HTML error page (404), not a TDF.
function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, 64).toString("latin1").toLowerCase();
  return head.includes("<!doctype html") || head.includes("<html") || head.includes("<head");
}

console.log(`Running ingest on ${entries.length} TDF files...\n`);

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: { file: string; reason: string }[] = [];
const skips: { file: string; reason: string }[] = [];
const passes: string[] = [];

for (const { file, path: filePath } of entries) {
  const debugPath = filePath.replace(".tdf", ".debug.json");

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch (err) {
    const reason = `Cannot read file: ${(err as Error).message}`;
    console.error(`FAIL [read error] ${file}`);
    failures.push({ file, reason });
    failed++;
    continue;
  }

  // Some downloaded samples are HTML 404 error pages, not TDFs — skip gracefully.
  if (looksLikeHtml(buffer)) {
    console.log(`SKIP ${file} (not a TDF — HTML page)`);
    skips.push({ file, reason: "not a TDF (HTML page)" });
    skipped++;
    continue;
  }

  let parsed;
  try {
    parsed = parseTdf(buffer);
  } catch (err) {
    if (err instanceof RejectionError) {
      console.log(`PASS [rejected] ${file} — ${err.message}`);
      passes.push(file);
      passed++;
      continue;
    }
    const reason = err instanceof ParseError ? err.message : String(err);
    console.error(`FAIL [parse error] ${file}`);
    failures.push({ file, reason });
    failed++;
    continue;
  }

  // --- Laserball: validate the goals↔line-5-score invariant (no line-7 truth) ---
  if (parsed.meta.missionType === LASERBALL_MISSION_TYPE) {
    let lb;
    try {
      lb = simulateLaserball(parsed);
    } catch (err) {
      console.error(`FAIL [lb sim error] ${file}`);
      failures.push({ file, reason: String(err) });
      failed++;
      continue;
    }
    const lbDebug = {
      missionType: parsed.meta.missionType,
      outcome: lb.outcome,
      actualDuration: lb.actualDuration,
      goalCheck: lb.goalCheck,
      teams: lb.teams,
      playerCount: lb.playerStats.size,
      eventCount: lb.events.length,
    };
    writeFileSync(debugPath, JSON.stringify(lbDebug, null, 2));
    if (lb.goalCheck.ok) {
      console.log(`PASS [lb] ${file} (${lb.outcome}, ${lb.playerStats.size} players)`);
      passes.push(file);
      passed++;
    } else {
      console.error(`FAIL [lb goal/score mismatch] ${file}`);
      failures.push({ file, reason: JSON.stringify(lb.goalCheck, null, 2) });
      failed++;
    }
    continue;
  }

  if (parsed.meta.missionType !== 5) {
    const skipReason = `mission type ${parsed.meta.missionType}`;
    console.log(`SKIP ${file} (${skipReason})`);
    skips.push({ file, reason: skipReason });
    skipped++;
    continue;
  }

  const simResult = simulate(parsed);
  const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
  const { discrepancies, ghostShots, warnings } = runConsistencyCheck(
    simResult.playerStats,
    sm5StatsById,
  );

  const debugOut = {
    consistencyCheck: {
      passed: discrepancies.length === 0,
      discrepancies,
      ghostShots,
      warnings,
    },
    events: simResult.events.map((e, i) => ({ index: i, ...e })),
    playerStates: Object.fromEntries(
      [...simResult.playerStats.entries()].map(([id, ps]) => [
        id,
        {
          ...ps,
          stateSnapshots: ps.stateSnapshots.map((snap) => ({
            ...snap,
            time: simResult.events[snap.eventIndex]?.time ?? null,
            eventType: simResult.events[snap.eventIndex]?.eventType ?? null,
          })),
          tdf: sm5StatsById.get(id) ?? null,
        },
      ]),
    ),
  };

  writeFileSync(debugPath, JSON.stringify(debugOut, null, 2));

  if (discrepancies.length === 0) {
    console.log(`PASS ${file}`);
    passes.push(file);
    passed++;
  } else {
    console.error(`FAIL [consistency] ${file}`);
    failures.push({
      file,
      reason: JSON.stringify(discrepancies, null, 2),
    });
    failed++;
  }
}

const total = passed + failed + skipped;
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped out of ${total} files`);

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const { file, reason } of failures) {
    console.error(`\n  ${file}\n    ${reason.replace(/\n/g, "\n    ")}`);
  }
}

const logsDir = resolve(import.meta.dirname, "../logs");
mkdirSync(logsDir, { recursive: true });

const timestamp = new Date().toISOString();
const fileTimestamp = timestamp.replace(/:/g, "-").replace(/\..+$/, "");
const logPath = join(logsDir, `test-suite-${fileTimestamp}.log`);

const lines: string[] = [
  `Test Suite Run: ${timestamp}`,
  `Files: ${total} total, ${passed} passed, ${failed} failed, ${skipped} skipped`,
  "",
];

if (passes.length > 0) {
  lines.push(`PASSED (${passes.length}):`);
  for (const file of passes) lines.push(`  ${file}`);
  lines.push("");
}

if (skips.length > 0) {
  lines.push(`SKIPPED (${skips.length}):`);
  for (const { file, reason } of skips) lines.push(`  ${file} (${reason})`);
  lines.push("");
}

if (failures.length > 0) {
  lines.push(`FAILED (${failures.length}):`);
  for (const { file, reason } of failures) {
    lines.push(`  ${file}`);
    lines.push(`    ${reason.replace(/\n/g, "\n    ")}`);
    lines.push("");
  }
}

writeFileSync(logPath, lines.join("\n"));
console.log(`\nLog written to ${logPath}`);

if (failures.length > 0) process.exit(1);
