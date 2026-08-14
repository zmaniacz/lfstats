// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Rebuilds the global player ranking.
 *
 * The rating is a batch fit over every game in the window at once, so one new
 * game shifts every player's number — there is no correct incremental update.
 * A full replay is also what keeps the board honest for free: penalty edits,
 * reingests, and `exclude` flips all change past results, and replaying picks
 * every one of them up without a bespoke invalidation path.
 *
 * The whole run is a few seconds of compute plus the bootstrap, so this is
 * cheap enough to schedule nightly.
 *
 * Usage:
 *   pnpm --filter @lfstats/db recalc-rating
 *   pnpm --filter @lfstats/db recalc-rating --dry-run   # compute, print, do not write
 *   pnpm --filter @lfstats/db recalc-rating --window=36 # override window months
 */

import { computeRatings, DEFAULT_RATING_PARAMETERS, type RatingParameters } from "../lib/rating";
import { initDb } from "../client";
import { getActiveRatingModel, getGamesForRating, replacePlayerRatings } from "../queries/ratings";

const dryRun = process.argv.includes("--dry-run");

function flag(name: string): number | null {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return null;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number, got: ${raw}`);
  return value;
}

await initDb();

const model = await getActiveRatingModel();
if (!model) {
  console.error("No active rating model found. Run migrations — 0048 seeds version 2026.08.");
  process.exit(1);
}

// The migration seeds these; CLI flags override for experimentation.
const stored = (model.parameters ?? {}) as Partial<RatingParameters> & {
  windowMonths?: number;
};
const params: RatingParameters = { ...DEFAULT_RATING_PARAMETERS, ...stored };
const windowMonths = flag("window") ?? stored.windowMonths ?? 24;

const windowEnd = new Date();
const windowStart = new Date(windowEnd);
windowStart.setMonth(windowStart.getMonth() - windowMonths);

console.log(`Rating model ${model.version}`);
console.log(
  `Window: ${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)} (${windowMonths} months)`,
);
console.log(`Minimum games: ${params.minGames}`);

const games = await getGamesForRating(windowStart);
console.log(`Loaded ${games.length} rateable SM5 games`);

if (games.length === 0) {
  console.error("No games in window — refusing to publish an empty ranking.");
  process.exit(1);
}

const started = Date.now();
const results = computeRatings(games, params);
console.log(
  `Rated ${results.length} qualifying players in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);

if (results.length === 0) {
  console.error(
    `No player reached the ${params.minGames}-game minimum — refusing to publish an empty ranking.`,
  );
  process.exit(1);
}

const groups = new Set(results.slice(0, params.groupedHead).map((r) => r.ratingGroup));
console.log(`Top ${params.groupedHead} splits into ${groups.size} display groups`);
console.log("\nTop 15:");
for (const r of results.slice(0, 15)) {
  const se = r.standardError === null ? "—" : `±${r.standardError.toFixed(3)}`;
  console.log(
    `  ${String(r.rank).padStart(3)}  grp ${r.ratingGroup}  ${r.rating.toFixed(3).padStart(7)} ${se.padStart(7)}  ` +
      `${String(r.gamesPlayed).padStart(4)}g  ${r.wins}-${r.losses}-${r.draws}  ${r.playerId}`,
  );
}

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

await replacePlayerRatings(model.id, windowStart, windowEnd, results);
console.log(`\nWrote ${results.length} ratings for model ${model.version}.`);
process.exit(0);
