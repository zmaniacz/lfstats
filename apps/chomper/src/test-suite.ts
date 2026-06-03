import { readdirSync, readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseTdf, ParseError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";

const demoDir = resolve(import.meta.dirname, "../../../demo_files");

const files = readdirSync(demoDir)
  .filter((f) => f.endsWith(".tdf"))
  .sort();

if (files.length === 0) {
  console.error("No .tdf files found in demo_files/");
  process.exit(1);
}

const staleDebug = readdirSync(demoDir).filter((f) => f.endsWith(".debug.json"));
for (const f of staleDebug) rmSync(join(demoDir, f));
if (staleDebug.length > 0) console.log(`Deleted ${staleDebug.length} stale .debug.json files\n`);

console.log(`Running ingest on ${files.length} TDF files...\n`);

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: { file: string; reason: string }[] = [];
const skips: { file: string; reason: string }[] = [];
const passes: string[] = [];

for (const file of files) {
  const filePath = join(demoDir, file);
  const debugPath = join(demoDir, file.replace(".tdf", ".debug.json"));

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

  let parsed;
  try {
    parsed = parseTdf(buffer);
  } catch (err) {
    const reason =
      err instanceof ParseError ? err.message : String(err);
    console.error(`FAIL [parse error] ${file}`);
    failures.push({ file, reason });
    failed++;
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
  const { discrepancies, ghostShots, warnings } = runConsistencyCheck(simResult.playerStats, sm5StatsById);

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
