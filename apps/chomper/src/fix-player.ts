// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * fix-player — correct a game played under the wrong codename.
 *
 * Rewrites the archived TDF so the wrong player id (a member's `#xxxxxxx`, or a
 * guest's `@NNN`) becomes the right member, keeps the untouched original under
 * `originals/`, logs the correction under `corrections/`, then reingests the game.
 * Because the archived TDF itself is corrected, the fix survives every future
 * reingest.
 *
 *   pnpm --filter chomper fix-player <game> --map FROM=TO [--map FROM=TO ...]
 *        [--callsign TO=Name] [--file local.tdf] [--out fixed.tdf]
 *        [--dry-run] [--yes] [--no-reingest]
 *
 * <game> is the game slug (`4-19-20261111212439`), its archive key, or its URL.
 * Repeat --map for several players in one game; swaps (A=B and B=A) are fine.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  assertReingestHandlesGameTeamReferences,
  findIngestMvpModels,
  getGameByTdfFilename,
  getPlayerIdentities,
  initDb,
} from "@lfstats/db";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { ParseError, parseTdf } from "./parser.js";
import { reingestSm5Game } from "./reingest-sm5-game.js";
import { fetchTdf, objectExists, putObject } from "./s3.js";
import { runConsistencyCheck, simulate } from "./simulator.js";
import { normalizeEntityId, remapTdfPlayers, RemapError, type PlayerRemap } from "./tdf-remap.js";

const USAGE = `Usage: pnpm --filter chomper fix-player <game> --map FROM=TO [--map FROM=TO ...]
         [--callsign TO=Name] [--file local.tdf] [--out fixed.tdf]
         [--dry-run] [--yes] [--no-reingest]

  <game>        game slug (4-19-20261111212439), archive key, or lfstats.com game URL
  --map         FROM=TO. FROM is the wrong id (8nfsQ93, #8nfsQ93 or a guest's @123);
                TO is the right member's ipl id. Repeat for several players / swaps.
  --callsign    TO=Name. Callsign to record for TO; required when TO has never been
                ingested, otherwise defaults to their current callsign.
  --file        Read the TDF from a local file instead of the archive bucket.
  --out         Also write the corrected TDF to this local path.
  --dry-run     Show what would change and validate it; write nothing.
  --yes         Skip the confirmation prompt.
  --no-reingest Update the archive but don't reingest (run bulk-reingest later).`;

function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  game: string;
  maps: { from: string; to: string }[];
  callsigns: Map<string, string>;
  file: string | null;
  out: string | null;
  dryRun: boolean;
  yes: boolean;
  reingest: boolean;
}

function splitPair(flag: string, value: string | undefined): [string, string] {
  const eq = value?.indexOf("=") ?? -1;
  if (!value || eq <= 0 || eq === value.length - 1) fail(`${flag} expects KEY=VALUE\n\n${USAGE}`);
  return [value.slice(0, eq), value.slice(eq + 1)];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    game: "",
    maps: [],
    callsigns: new Map(),
    file: null,
    out: null,
    dryRun: false,
    yes: false,
    reingest: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    // Accept both `--map X=Y` and `--map=X=Y`.
    const [flag, inline] = a.startsWith("--") && a.includes("=") ? splitOnce(a) : [a, undefined];
    const value = () => inline ?? argv[++i];
    switch (flag) {
      case "--map": {
        const [from, to] = splitPair(flag, value());
        args.maps.push({ from: normalizeEntityId(from), to: normalizeEntityId(to) });
        break;
      }
      case "--callsign": {
        const [to, name] = splitPair(flag, value());
        args.callsigns.set(normalizeEntityId(to), name);
        break;
      }
      case "--file":
        args.file = value() ?? fail("--file needs a path");
        break;
      case "--out":
        args.out = value() ?? fail("--out needs a path");
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--yes":
      case "-y":
        args.yes = true;
        break;
      case "--no-reingest":
        args.reingest = false;
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
      default:
        if (flag.startsWith("-")) fail(`Unknown option ${flag}\n\n${USAGE}`);
        if (args.game) fail(`Unexpected argument ${flag}\n\n${USAGE}`);
        args.game = flag;
    }
  }
  if (!args.game) fail(`Missing <game>\n\n${USAGE}`);
  if (args.maps.length === 0) fail(`At least one --map is required\n\n${USAGE}`);
  return args;
}

function splitOnce(a: string): [string, string] {
  const eq = a.indexOf("=");
  return [a.slice(0, eq), a.slice(eq + 1)];
}

/** `https://lfstats.com/games/4-19-2026…?tab=x`, `4-19-2026….tdf` or the bare slug → slug. */
function gameSlug(raw: string): string {
  const slug = raw
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .split("/")
    .pop()!
    .replace(/\.tdf$/i, "");
  if (!/^\d+-\d+-\d{14}$/.test(slug)) fail(`Not a game slug: ${raw}`);
  return slug;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs(process.argv.slice(2));
const archiveKey = `${gameSlug(args.game)}.tdf`;

const BUCKET = process.env.MODERN_ARCHIVE_BUCKET;
if (!BUCKET) fail("Missing env var: MODERN_ARCHIVE_BUCKET");

await initDb();

const gameRow = await getGameByTdfFilename(archiveKey);
if (!gameRow) fail(`No game with archive key ${archiveKey}`);

// Load the TDF
let original: Buffer;
if (args.file) {
  original = readFileSync(resolve(args.file));
  console.log(`Read ${args.file}`);
} else {
  try {
    original = await fetchTdf(BUCKET, archiveKey);
  } catch (err) {
    fail(`Could not download s3://${BUCKET}/${archiveKey}: ${(err as Error).message}`);
  }
  console.log(`Downloaded s3://${BUCKET}/${archiveKey}`);
}

// Resolve each target's identity: callsign and centre member id.
const memberIds = [...new Set(args.maps.flatMap((m) => [m.from, m.to]))].filter((id) =>
  id.startsWith("#"),
);
const known = new Map((await getPlayerIdentities(memberIds)).map((p) => [p.iplId, p]));

const remaps: PlayerRemap[] = args.maps.map(({ from, to }) => {
  const target = known.get(to);
  const callsign = args.callsigns.get(to) ?? target?.currentCallsign;
  if (!callsign) {
    fail(`${to} has never been ingested, so pass their callsign: --callsign ${to}=<callsign>`);
  }
  return { from, to, callsign, memberId: target?.memberId ?? null };
});
for (const to of args.callsigns.keys()) {
  if (!args.maps.some((m) => m.to === to)) fail(`--callsign ${to} has no matching --map target`);
}

// Rewrite
let result;
try {
  result = remapTdfPlayers(original, remaps);
} catch (err) {
  if (err instanceof RemapError) fail(err.message);
  throw err;
}

console.log(`\nGame ${archiveKey} (${gameRow.type})\n`);
for (const r of remaps) {
  const was = result.originalCallsigns.get(r.from) ?? "?";
  const lines = result.counts
    .get(r.from)!
    .map((c) => `L${c.lineType}×${c.fields}`)
    .join(" ");
  console.log(`  ${r.from} "${was}"  →  ${r.to} "${r.callsign}"`);
  console.log(`      memberId → ${r.memberId ?? "(blank)"}`);
  console.log(`      fields rewritten: ${lines}`);
  if (!known.has(r.to)) console.log(`      note: ${r.to} is new to LFstats`);
}

// Validate the corrected file the same way ingest will see it.
let parsed;
try {
  parsed = parseTdf(result.buffer);
} catch (err) {
  fail(`Corrected TDF does not parse: ${err instanceof ParseError ? err.message : String(err)}`);
}
const ids = new Set(parsed.entities.map((e) => e.originalId));
for (const r of remaps) {
  if (!ids.has(r.to)) fail(`Validation: ${r.to} missing from the corrected TDF`);
  if (ids.has(r.from) && !remaps.some((x) => x.to === r.from)) {
    fail(`Validation: ${r.from} still present in the corrected TDF`);
  }
  const entity = parsed.entities.find((e) => e.originalId === r.to)!;
  if (entity.desc !== r.callsign) fail(`Validation: callsign for ${r.to} was not rewritten`);
}
if (parsed.meta.missionType === LASERBALL_MISSION_TYPE) {
  const lb = simulateLaserball(parsed);
  if (!lb.goalCheck.ok) fail("Validation: Laserball goal cross-check fails on the corrected TDF");
} else {
  const sim = simulate(parsed);
  const { discrepancies } = runConsistencyCheck(
    sim.playerStats,
    new Map(parsed.sm5Stats.map((s) => [s.id, s])),
    sim.resourceLog,
  );
  if (discrepancies.length > 0) {
    fail(`Validation: consistency check fails:\n${JSON.stringify(discrepancies, null, 2)}`);
  }
}
console.log("\n✔ Corrected TDF parses, simulates and passes the consistency check");

if (args.out) {
  writeFileSync(resolve(args.out), result.buffer);
  console.log(`Wrote ${args.out}`);
}

if (args.dryRun) {
  console.log("\nDry run — nothing written to S3 or the database.");
  process.exit(0);
}

const guestSources = remaps.filter((r) => r.from.startsWith("@"));
if (guestSources.length > 0 && gameRow.type === "sm5") {
  // Admin edits to a guest's penalties are keyed without an ipl id, so there is
  // nothing to carry them across to the new member by.
  console.log(
    "\nNote: penalty edits recorded against a guest (@NNN) are not carried over to the member.",
  );
}

if (!args.yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `\nOverwrite s3://${BUCKET}/${archiveKey}${args.reingest ? " and reingest the game" : ""}? [y/N] `,
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("Aborted.");
    process.exit(1);
  }
}

// Refuse before touching S3 if reingest would destroy admin data.
if (args.reingest) await assertReingestHandlesGameTeamReferences();

// Keep the very first original: a second correction must not overwrite it with an
// already-corrected copy.
const originalKey = `originals/${archiveKey}`;
if (await objectExists(BUCKET, originalKey)) {
  console.log(`Original already backed up at s3://${BUCKET}/${originalKey}`);
} else {
  // Always back up what is in the archive, even when the edit started from --file.
  const source = args.file ? await fetchTdf(BUCKET, archiveKey) : original;
  await putObject(BUCKET, originalKey, source);
  console.log(`Backed up original to s3://${BUCKET}/${originalKey}`);
}

await putObject(BUCKET, archiveKey, result.buffer);
console.log(`Wrote corrected TDF to s3://${BUCKET}/${archiveKey}`);

// Append to the correction log so there is a record of what was changed and why
// the archived file differs from what the centre uploaded.
const logKey = `corrections/${archiveKey.replace(/\.tdf$/, "")}.json`;
let history: unknown[] = [];
if (await objectExists(BUCKET, logKey)) {
  history = JSON.parse((await fetchTdf(BUCKET, logKey)).toString("utf8")) as unknown[];
}
history.push({
  at: new Date().toISOString(),
  remaps: remaps.map((r) => ({
    from: r.from,
    fromCallsign: result.originalCallsigns.get(r.from) ?? null,
    to: r.to,
    toCallsign: r.callsign,
    memberId: r.memberId,
  })),
});
await putObject(BUCKET, logKey, Buffer.from(JSON.stringify(history, null, 2)), "application/json");
console.log(`Logged correction to s3://${BUCKET}/${logKey}`);

if (!args.reingest) {
  console.log(`\nSkipped reingest. Run: pnpm --filter chomper bulk-reingest ${gameRow.id}`);
  process.exit(0);
}

console.log(`\nReingesting game ${gameRow.id}…`);
if (gameRow.type === "lb") {
  // Laserball keeps no ipl-keyed admin metadata, so the stock reingest is enough.
  const chomperDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const run = spawnSync("pnpm", ["bulk-reingest-lb", gameRow.id], {
    cwd: chomperDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (run.status !== 0) {
    fail(`Laserball reingest failed — rerun: pnpm --filter chomper bulk-reingest-lb ${gameRow.id}`);
  }
} else {
  const iplRemap = new Map(remaps.filter((r) => r.from.startsWith("#")).map((r) => [r.from, r.to]));
  const outcome = await reingestSm5Game(gameRow.id, result.buffer, await findIngestMvpModels(), {
    iplRemap,
  });
  if (outcome.status !== "reingested") {
    fail(
      `Reingest ${outcome.status}: ${outcome.reason}\n` +
        `The corrected TDF is in S3; rerun: pnpm --filter chomper bulk-reingest ${gameRow.id}`,
    );
  }
}

console.log("✔ Reingested");
console.log(
  "\nThe global player rating is not recomputed here. When convenient:\n" +
    "  pnpm --filter @lfstats/db recalc-rating",
);
process.exit(0);
