import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findCenterByNaturalKey,
  findGameByNaturalKey,
  findActiveMvpModel,
} from "@lfstats/db";
import { parseTdf, ParseError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";
import { ingest, parseGameStartTime } from "./ingester.js";
import { calculateMvp } from "./mvp.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: pnpm ingest <file.tdf>");
  process.exit(1);
}

const absPath = resolve(filePath);
console.log(`Ingesting: ${absPath}`);

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
const gameType = "sm5";

// Duplicate check
const gameStartTime = parseGameStartTime(parsed.meta.startTime);
const existingCenter = await findCenterByNaturalKey(
  parsed.meta.countryCode,
  parsed.meta.siteCode,
);
if (existingCenter) {
  const existingGame = await findGameByNaturalKey(
    existingCenter.id,
    gameStartTime,
  );
  if (existingGame) {
    console.warn(`Skipped: duplicate game (gameId=${existingGame.id})`);
    process.exit(0);
  }
}

// Phase 2 — Simulate
const simResult = simulate(parsed);
console.log(
  `Simulated: outcome=${simResult.outcome}, ` +
    `${simResult.events.length} events, ` +
    `${simResult.playerStats.size} players`,
);

const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
runConsistencyCheck(simResult.playerStats, sm5StatsById);

// MVP
const mvpModel = await findActiveMvpModel();
if (!mvpModel) {
  console.error("No active MVP model found");
  process.exit(1);
}

const entityEndsById = new Map(
  parsed.entityEnds.map((e) => [
    e.id,
    { score: e.score, exitType: e.exitType },
  ]),
);
const mvpRows = calculateMvp(
  simResult,
  sm5StatsById,
  entityEndsById,
  mvpModel,
  parsed.meta.duration,
);

// Phase 3 — Ingest
const gameId = await ingest(
  parsed,
  simResult,
  gameStartTime,
  mvpRows,
  gameType,
);
console.log(`Ingested: gameId=${gameId}`);
