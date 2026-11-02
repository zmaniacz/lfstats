// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Regenerates game highlights for a range of games, one game at a time with a pause between
 * them: the replay tables are most of the database and share a VM with the web container.
 *
 * Dates are center-local and inclusive. A range or --all is required, so a bare run cannot
 * touch the whole archive by accident. --dry-run reports what would be stored and writes nothing.
 *
 * Usage:
 *   pnpm --filter @lfstats/db backfill-highlights --from 2026-11-01 --to 2026-11-02
 *   pnpm --filter @lfstats/db backfill-highlights --from 2026-11-01 --to 2026-11-02 --dry-run
 *   pnpm --filter @lfstats/db backfill-highlights --all --category comeback --pause-ms 500
 */

import { parseArgs } from "node:util";
import { initDb } from "../client";
import { HIGHLIGHT_CATEGORIES, type HighlightCategory } from "../lib/highlights/detectors";
import {
  findGameHighlights,
  generateHighlights,
  getGameIdsForHighlights,
} from "../queries/highlights";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCategory(value: string): value is HighlightCategory {
  return HIGHLIGHT_CATEGORIES.some((c) => c === value);
}

const { values } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    all: { type: "boolean", default: false },
    category: { type: "string", multiple: true },
    "pause-ms": { type: "string", default: "150" },
    "dry-run": { type: "boolean", default: false },
  },
});

const { from, to, all } = values;
const dryRun = values["dry-run"];
const pauseMs = Number(values["pause-ms"]);
const requested = values.category ?? [];
const categories = requested.filter(isCategory);

if (all === Boolean(from || to)) {
  console.error("Pass either --from and --to, or --all.");
  process.exit(1);
}
if (!all && !(from && to && DATE_RE.test(from) && DATE_RE.test(to))) {
  console.error("--from and --to must both be YYYY-MM-DD.");
  process.exit(1);
}
if (categories.length !== requested.length) {
  console.error(`--category must be one of: ${HIGHLIGHT_CATEGORIES.join(", ")}`);
  process.exit(1);
}
if (!Number.isFinite(pauseMs) || pauseMs < 0) {
  console.error("--pause-ms must be a non-negative number.");
  process.exit(1);
}

await initDb();

const games = await getGameIdsForHighlights({ from, to });
console.log(
  `${dryRun ? "Dry run over" : "Backfilling"} ${games.length} SM5 games ` +
    `(${all ? "whole archive" : `${from} to ${to}`})`,
);

const totals = new Map<HighlightCategory, number>();
const failed: string[] = [];
let withHighlights = 0;

for (const [index, { id, tdfFilename }] of games.entries()) {
  try {
    const found = dryRun
      ? (await findGameHighlights(id)).filter(
          (h) => categories.length === 0 || categories.includes(h.category),
        )
      : await generateHighlights(id, categories.length > 0 ? categories : undefined);

    if (found.length > 0) withHighlights++;
    for (const h of found) totals.set(h.category, (totals.get(h.category) ?? 0) + 1);
    console.log(`[${index + 1}/${games.length}] ${tdfFilename}: ${found.length}`);
  } catch (err) {
    failed.push(id);
    console.error(`[${index + 1}/${games.length}] ${tdfFilename} failed:`, err);
  }
  await new Promise((resolve) => setTimeout(resolve, pauseMs));
}

console.log(`\n${withHighlights} of ${games.length} games have highlights`);
for (const category of HIGHLIGHT_CATEGORIES) {
  console.log(`  ${category}: ${totals.get(category) ?? 0}`);
}
if (failed.length > 0) {
  console.error(`\n${failed.length} failed: ${failed.join(", ")}`);
  process.exitCode = 1;
}
process.exit();
