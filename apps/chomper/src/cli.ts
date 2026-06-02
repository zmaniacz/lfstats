import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { parseTdf, ParseError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: pnpm ingest <file.tdf>");
  process.exit(1);
}

const absPath = resolve(filePath);
console.log(`Parsing: ${absPath}`);

let buffer: Buffer;
try {
  buffer = readFileSync(absPath);
} catch (err) {
  console.error(`Cannot read file: ${(err as Error).message}`);
  process.exit(1);
}

// Phase 1 — Parse
let parsed;
try {
  parsed = parseTdf(buffer);
} catch (err) {
  if (err instanceof ParseError) {
    console.error(`Parse error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

console.log(
  `Parsed: mission type ${parsed.meta.missionType}, ` +
    `${parsed.entities.length} entities, ` +
    `${parsed.events.length} events`,
);

if (parsed.meta.missionType !== 5) {
  console.warn(`Skipped: mission type ${parsed.meta.missionType} is not SM5`);
  process.exit(0);
}

// Phase 2 — Simulate
const simResult = simulate(parsed);
console.log(
  `Simulated: outcome=${simResult.outcome}, ` +
    `${simResult.events.length} events, ` +
    `${simResult.playerStats.size} players`,
);

const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
const { discrepancies, ghostShots } = runConsistencyCheck(simResult.playerStats, sm5StatsById);

const debugOut = {
  consistencyCheck: {
    passed: discrepancies.length === 0,
    discrepancies,
    ghostShots,
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

const debugPath = resolve(
  dirname(absPath),
  basename(absPath, ".tdf") + ".debug.json",
);
writeFileSync(debugPath, JSON.stringify(debugOut, null, 2));
console.log(`Debug output: ${debugPath}`);
