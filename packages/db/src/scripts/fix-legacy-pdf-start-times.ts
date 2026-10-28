// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Corrects `game.start_time` for PDF-era games (`game.type = 'sm5_pdf'`) from the start
 * time printed in the header of each game's source PDF scorecard.
 *
 * The migration converted legacy `game_datetime` with `AT TIME ZONE 'America/Los_Angeles'`,
 * but the legacy importer had stored the printed time with a fixed UTC-8 offset, so every
 * daylight-saving-season game came out an hour late; some batches were imported another way
 * entirely. The printed header is the source of truth (docs/Legacy_Migration_PDF_Games.md).
 *
 * The PDFs are public at `https://lfstats-scorecards.s3.amazonaws.com/<pdf_id>.pdf`. The
 * header can't be read from a partial download, so each PDF is fetched in full (~8 MB),
 * read with poppler's `pdftotext -raw` (must be on PATH), and deleted. Parsed headers are
 * cached as JSON lines, so an interrupted fetch resumes where it stopped.
 *
 * Usage:
 *   pnpm --filter @lfstats/db fix-legacy-pdf-start-times --fetch     # download + parse, fill the cache
 *   pnpm --filter @lfstats/db fix-legacy-pdf-start-times --dry-run   # report the corrections
 *   pnpm --filter @lfstats/db fix-legacy-pdf-start-times --apply     # write them
 *   --cache <file>   cache location (default: <tmpdir>/lfstats-pdf-start-times.jsonl)
 *   --concurrency N  parallel downloads for --fetch (default 12)
 *   --verbose        list every correction rather than a sample
 *
 * A correction is skipped, and reported, when it would collide with another game's
 * (center, start_time). Every corrected game is also checked against the TDF-era games at
 * its center: one within 2 minutes is probably the same game, already ingested from its
 * TDF, which the migration's duplicate check missed while the time was wrong. Those are
 * reported only — deleting a game is left to a person.
 */

import { execFile } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { initDb } from "../client";
import { parseHeaderTime } from "../lib/pdf-header-time";
import { getLegacyPdfUrl } from "../lib/tdf";

const execFileAsync = promisify(execFile);

const DUPLICATE_WINDOW_SECONDS = 120;

type Db = Awaited<ReturnType<typeof initDb>>;

/** One cache line per pdf_id. `printed` is the wall time, 'YYYY-MM-DD HH:MM:00'. */
type CacheEntry =
  | { pdfId: string; printed: string }
  | { pdfId: string; printed: null; error: string; header?: string };

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

function loadCache(path: string): Map<string, CacheEntry> {
  const cache = new Map<string, CacheEntry>();
  if (!existsSync(path)) return cache;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as CacheEntry;
    cache.set(entry.pdfId, entry);
  }
  return cache;
}

async function readPdf(pdfId: string, dir: string): Promise<CacheEntry> {
  const res = await fetch(getLegacyPdfUrl(pdfId));
  if (!res.ok) return { pdfId, printed: null, error: `HTTP ${res.status}` };
  const file = join(dir, `${pdfId}.pdf`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  try {
    // -raw keeps content-stream order; -layout interleaves the time with the overlapping
    // "SCORECARD" title on some older printouts.
    const { stdout } = await execFileAsync("pdftotext", ["-l", "1", "-raw", file, "-"], {
      maxBuffer: 16 * 1024 * 1024,
    });
    const printed = parseHeaderTime(stdout);
    if (printed) return { pdfId, printed };
    const header = stdout.split("\n").slice(0, 6).join(" / ");
    return { pdfId, printed: null, error: "no header time", header };
  } catch (err) {
    return { pdfId, printed: null, error: `pdftotext: ${(err as Error).message.split("\n")[0]}` };
  } finally {
    await rm(file, { force: true });
  }
}

async function fetchAll(db: Db, cachePath: string, concurrency: number): Promise<void> {
  const cache = loadCache(cachePath);
  const rows = await db.execute<{ pdf_id: string }>(sql`
    select pdf_id from sm5_pdf_game where pdf_id is not null order by pdf_id`);
  // Retry failures on every run; only successes are final.
  const todo = rows.map((r) => r.pdf_id).filter((id) => !cache.get(id)?.printed);
  console.log(`${rows.length} PDFs, ${rows.length - todo.length} cached, ${todo.length} to fetch.`);

  const dir = await mkdtemp(join(tmpdir(), "lfstats-pdf-"));
  const out = createWriteStream(cachePath, { flags: "a" });
  let next = 0;
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (next < todo.length) {
      const pdfId = todo[next++]!;
      let entry: CacheEntry;
      try {
        entry = await readPdf(pdfId, dir);
      } catch (err) {
        entry = { pdfId, printed: null, error: (err as Error).message };
      }
      if (!entry.printed) failed++;
      out.write(`${JSON.stringify(entry)}\n`);
      if (++done % 100 === 0 || done === todo.length) {
        console.log(`  ${done}/${todo.length} (${failed} failed)`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    await new Promise<void>((resolve) => out.end(resolve));
    await rm(dir, { recursive: true, force: true });
  }
  console.log(`Done: ${done - failed} parsed, ${failed} failed. Cache: ${cachePath}`);
}

// ---------------------------------------------------------------------------
// Plan + apply
// ---------------------------------------------------------------------------

type PdfGameRow = {
  game_id: string;
  legacy_game_id: number;
  pdf_id: string | null;
  center_id: string;
  center: string;
  start: string; // 'YYYY-MM-DD HH24:MI:SS'
};

type Correction = PdfGameRow & { printed: string; shiftMinutes: number };

/** Seconds since the epoch for a wall time string, treating it as UTC (wall arithmetic only). */
function wallSeconds(s: string): number {
  return Date.parse(`${s.replace(" ", "T")}Z`) / 1000;
}

function describeShift(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes > 0 ? "+" : ""}${minutes / 60}h`;
  return `${minutes > 0 ? "+" : ""}${minutes}m`;
}

async function plan(db: Db, cachePath: string, apply: boolean, verbose: boolean): Promise<void> {
  const cache = loadCache(cachePath);
  const games = await db.execute<PdfGameRow>(sql`
    select g.id as game_id, p.legacy_game_id, p.pdf_id, g.center_id, c.name as center,
           to_char(g.start_time, 'YYYY-MM-DD HH24:MI:SS') as start
    from sm5_pdf_game p
    join game g on g.id = p.game_id
    join center c on c.id = g.center_id
    order by g.start_time`);

  const noPdf: PdfGameRow[] = [];
  const unread: Array<PdfGameRow & { error: string; header?: string }> = [];
  const corrections: Correction[] = [];
  let unchanged = 0;
  for (const g of games) {
    if (!g.pdf_id) {
      noPdf.push(g);
      continue;
    }
    const entry = cache.get(g.pdf_id);
    if (!entry) {
      unread.push({ ...g, error: "not fetched" });
      continue;
    }
    if (entry.printed === null) {
      unread.push({ ...g, error: entry.error, header: entry.header });
      continue;
    }
    if (entry.printed === g.start) {
      unchanged++;
      continue;
    }
    const shiftMinutes = (wallSeconds(g.start) - wallSeconds(entry.printed)) / 60;
    corrections.push({ ...g, printed: entry.printed, shiftMinutes: -shiftMinutes });
  }

  // Final (center, start) of every game once the corrections land.
  const correctedIds = new Set(corrections.map((c) => c.game_id));
  const others = await db.execute<{ id: string; center_id: string; start: string; type: string }>(
    sql`select id, center_id, to_char(start_time, 'YYYY-MM-DD HH24:MI:SS') as start, type from game`,
  );
  const finalSlots = new Map<string, number>();
  const slotKey = (center: string, start: string) => `${center}|${start}`;
  for (const o of others) {
    if (correctedIds.has(o.id)) continue;
    const k = slotKey(o.center_id, o.start);
    finalSlots.set(k, (finalSlots.get(k) ?? 0) + 1);
  }
  for (const c of corrections) {
    const k = slotKey(c.center_id, c.printed);
    finalSlots.set(k, (finalSlots.get(k) ?? 0) + 1);
  }
  const collisions = corrections.filter(
    (c) => finalSlots.get(slotKey(c.center_id, c.printed))! > 1,
  );
  const collisionIds = new Set(collisions.map((c) => c.game_id));
  const toApply = corrections.filter((c) => !collisionIds.has(c.game_id));

  // TDF-era games near a corrected PDF game's new time.
  const tdfByCenter = new Map<string, number[]>();
  for (const o of others) {
    if (o.type === "sm5_pdf") continue;
    const list = tdfByCenter.get(o.center_id) ?? [];
    list.push(wallSeconds(o.start));
    tdfByCenter.set(o.center_id, list);
  }
  const nearTdf = toApply.filter((c) => {
    const t = wallSeconds(c.printed);
    return (tdfByCenter.get(c.center_id) ?? []).some(
      (x) => Math.abs(x - t) <= DUPLICATE_WINDOW_SECONDS,
    );
  });

  // Report.
  console.log(`${games.length} PDF games:`);
  console.log(`  ${unchanged} already match the printed time`);
  console.log(
    `  ${corrections.length} differ — ${toApply.length} to correct, ${collisions.length} blocked by a collision`,
  );
  console.log(`  ${unread.length} PDFs not read, ${noPdf.length} games with no pdf_id`);

  const byShift = new Map<string, number>();
  for (const c of toApply) {
    const k = describeShift(c.shiftMinutes);
    byShift.set(k, (byShift.get(k) ?? 0) + 1);
  }
  console.log("\nCorrections by shift (printed − stored):");
  for (const [k, n] of [...byShift].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padStart(8)}  ${n}`);
  }

  const byBatch = new Map<string, number>();
  for (const c of toApply.filter((c) => Math.abs(c.shiftMinutes) !== 60)) {
    const k = `${c.center} ${c.start.slice(0, 7)} ${describeShift(c.shiftMinutes)}`;
    byBatch.set(k, (byBatch.get(k) ?? 0) + 1);
  }
  console.log("\nCorrections other than ±1h, by center, month and shift:");
  for (const [k, n] of [...byBatch].sort()) console.log(`  ${k}  (${n})`);

  const sample = verbose ? toApply : toApply.filter((_, i) => i % 250 === 0);
  console.log(`\n${verbose ? "All" : "Sample of"} corrections:`);
  for (const c of sample) {
    console.log(
      `  legacy ${c.legacy_game_id}  ${c.center}  ${c.start} → ${c.printed}  (${describeShift(c.shiftMinutes)})`,
    );
  }

  if (collisions.length) {
    console.log("\nBlocked — another game already holds the corrected (center, start_time):");
    for (const c of collisions) {
      console.log(`  legacy ${c.legacy_game_id}  ${c.center}  ${c.start} → ${c.printed}`);
    }
  }
  if (nearTdf.length) {
    console.log(
      `\nWithin ${DUPLICATE_WINDOW_SECONDS / 60} minutes of a TDF-era game at the same center (likely duplicates, not removed):`,
    );
    for (const c of nearTdf) {
      console.log(`  legacy ${c.legacy_game_id}  game ${c.game_id}  ${c.center}  ${c.printed}`);
    }
  }
  if (unread.length) {
    console.log("\nPDFs not read:");
    for (const u of unread) {
      console.log(
        `  legacy ${u.legacy_game_id}  pdf ${u.pdf_id}  ${u.center}  ${u.start}  ${u.error}${u.header ? `  [${u.header.slice(0, 120)}]` : ""}`,
      );
    }
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to write the corrections.");
    return;
  }

  // The collision filter guarantees no clash in the final state, but Postgres checks the
  // non-deferrable unique (center_id, start_time) row by row, so a game must not move onto
  // a slot another corrected game has yet to vacate. Order the updates accordingly.
  await db.transaction(async (tx) => {
    const pending = new Map(toApply.map((c) => [c.game_id, c]));
    const occupiedBy = new Map(toApply.map((c) => [slotKey(c.center_id, c.start), c.game_id]));
    let progress = true;
    while (pending.size && progress) {
      progress = false;
      // Deleting the current entry while iterating a Map is well defined.
      for (const c of pending.values()) {
        const blocker = occupiedBy.get(slotKey(c.center_id, c.printed));
        if (blocker && blocker !== c.game_id && pending.has(blocker)) continue;
        await tx.execute(
          sql`update game set start_time = ${c.printed}::timestamp where id = ${c.game_id}`,
        );
        occupiedBy.delete(slotKey(c.center_id, c.start));
        pending.delete(c.game_id);
        progress = true;
      }
    }
    if (pending.size) {
      throw new Error(
        `${pending.size} corrections form a cycle of swapped slots; nothing written.`,
      );
    }
  });
  console.log(`\nApplied ${toApply.length} corrections.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const option = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const cachePath = option("--cache") ?? join(tmpdir(), "lfstats-pdf-start-times.jsonl");
  const concurrency = Number(option("--concurrency") ?? 12);
  const modes = ["--fetch", "--dry-run", "--apply"].filter(flag);
  if (modes.length !== 1) {
    console.error("Pass exactly one of --fetch, --dry-run or --apply.");
    process.exit(1);
  }
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error("--concurrency takes a positive integer.");
    process.exit(1);
  }

  const db = await initDb();
  if (flag("--fetch")) await fetchAll(db, cachePath, concurrency);
  else await plan(db, cachePath, flag("--apply"), flag("--verbose"));
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
