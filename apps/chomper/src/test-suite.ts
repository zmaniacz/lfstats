import { readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
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
const failures: { file: string; reason: string }[] = [];

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
    console.log(`SKIP ${file} (mission type ${parsed.meta.missionType})`);
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
    playerStates: Object.fromEntries(
      [...simResult.playerStats.entries()].map(([id, ps]) => [
        id,
        {
          ...ps,
          stateSnapshots: ps.stateSnapshots.map((snap) => ({
            ...snap,
            time: simResult.events[snap.eventIndex]?.time ?? null,
          })),
          tdf: sm5StatsById.get(id) ?? null,
        },
      ]),
    ),
  };

  writeFileSync(debugPath, JSON.stringify(debugOut, null, 2));

  if (discrepancies.length === 0) {
    console.log(`PASS ${file}`);
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

console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} files`);

if (failures.length > 0) {
  console.error("\nFailures:");
  for (const { file, reason } of failures) {
    console.error(`\n  ${file}\n    ${reason.replace(/\n/g, "\n    ")}`);
  }
  process.exit(1);
}
