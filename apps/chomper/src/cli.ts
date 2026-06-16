// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { parseTdf, ParseError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { ingestLaserball } from "./laserball/ingester.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";
import { parseGameStartTime } from "./ingester.js";

// Flags: --db writes the simulated game to the database (Laserball only).
const args = process.argv.slice(2);
const writeDb = args.includes("--db");
const filePath = args.find((a) => !a.startsWith("--"));
if (!filePath) {
  console.error("Usage: pnpm ingest [--db] <file.tdf>");
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

// Laserball — separate simulation path (no line-7 ground truth; cross-check goals↔scores)
if (parsed.meta.missionType === LASERBALL_MISSION_TYPE) {
  const lb = simulateLaserball(parsed);
  console.log(
    `Simulated (laserball): outcome=${lb.outcome}, ` +
      `${lb.events.length} events, ${lb.playerStats.size} players, ` +
      `goalCheck=${lb.goalCheck.ok ? "ok" : "MISMATCH"}`,
  );
  if (writeDb) {
    if (!lb.goalCheck.ok) {
      console.error(
        `Refusing to ingest: goal/score mismatch ` +
          `goals=${JSON.stringify(lb.goalCheck.teamGoals)} ` +
          `scoreEvents=${JSON.stringify(lb.goalCheck.scoreEventGoals)}`,
      );
      process.exit(1);
    }
    const gameStartTime = parseGameStartTime(parsed.meta.startTime);
    const gameId = await ingestLaserball(parsed, lb, gameStartTime, null);
    console.log(`Ingested to DB: gameId=${gameId}`);
    process.exit(0);
  }
  const lbDebug = {
    missionType: parsed.meta.missionType,
    outcome: lb.outcome,
    actualDuration: lb.actualDuration,
    goalCheck: lb.goalCheck,
    teams: lb.teams,
    players: Object.fromEntries(
      [...lb.playerStats.entries()].map(([id, p]) => {
        const { actionTimes, chainTracker, stateSnapshots, ...rest } = p;
        void actionTimes;
        void chainTracker;
        void stateSnapshots;
        return [id, rest];
      }),
    ),
  };
  const lbDebugPath = resolve(dirname(absPath), basename(absPath, ".tdf") + ".debug.json");
  writeFileSync(lbDebugPath, JSON.stringify(lbDebug, null, 2));
  console.log(`Debug output: ${lbDebugPath}`);
  process.exit(0);
}

if (writeDb) {
  console.error("--db ingest is only supported for Laserball in the CLI");
  process.exit(1);
}

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

const debugPath = resolve(dirname(absPath), basename(absPath, ".tdf") + ".debug.json");
writeFileSync(debugPath, JSON.stringify(debugOut, null, 2));
console.log(`Debug output: ${debugPath}`);
