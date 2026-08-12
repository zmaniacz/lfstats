// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Sorts the existing competitions into the three browse categories.
 *
 * `competition.category` was added with a default of `tournament`, so every pre-existing
 * row already sits in the largest bucket and the site works without this script. What it
 * does is move the events that belong somewhere else: the world/continental championships
 * into `internationals`, and the local site seasons into `league`.
 *
 * The mapping below is a set of judgement calls, not derived data — an admin can change
 * any competition's category in the admin UI afterwards. Re-running the script re-asserts
 * the map, so it is a one-time backfill rather than a recurring job.
 *
 *   pnpm --filter @lfstats/db backfill-competition-category --dry-run
 *   pnpm --filter @lfstats/db backfill-competition-category
 */

import { asc, eq } from "drizzle-orm";
import { initDb } from "../client";
import { competition } from "../schema";

type Category = "internationals" | "tournament" | "league";

/**
 * Keyed by competition slug. Anything not listed keeps the column default (`tournament`),
 * so only the two minority buckets need entries.
 */
const CATEGORY_BY_SLUG: Record<string, Category> = {
  // The big annual championships.
  wct_2022: "internationals",
  internationals_2023: "internationals",
  "(inter)nationals_2024": "internationals",
  ect_2025: "internationals",
  internationals_2025: "internationals",
  internationals_2026: "internationals",

  // Local site seasons — a league runs over weeks at one center, team or solo.
  brisbane_2020_season_1: "league",
  "brisbane_2020_season_2_-_round_1": "league",
  "brisbane_2020_season_2_-_round_2": "league",
  "brisbane_2020_season_2_-_round_3": "league",
  "brisbane_2020_season_2_-_round_4": "league",
  brisbane_2021_season_2: "league",
  darmstadt_2021_season_1: "league",
  llt_summer_2022: "league",
  auckland_triple_threat_2022: "league",
  loveland_duos_2023: "league",
  loveland_summer_league_2023: "league",
  loveland_winter_league_2023: "league",
  st_george_summer_league_2025: "league",
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = await initDb();

  const rows = await db
    .select({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      category: competition.category,
    })
    .from(competition)
    .orderBy(asc(competition.startDate));

  console.log(`${rows.length} competition(s)${dryRun ? " (dry run)" : ""}\n`);

  let updated = 0;
  let already = 0;
  const defaulted: string[] = [];

  for (const row of rows) {
    const target = CATEGORY_BY_SLUG[row.slug];

    if (!target) {
      defaulted.push(`${row.name} (${row.category})`);
      continue;
    }

    if (row.category === target) {
      already++;
      console.log(`  skip  ${row.name} — already ${target}`);
      continue;
    }

    if (!dryRun) {
      // Set the column directly rather than going through updateCompetition(): that
      // helper re-slugs when a name is supplied, and this must never touch the slug.
      await db.update(competition).set({ category: target }).where(eq(competition.id, row.id));
    }
    updated++;
    console.log(`  ${dryRun ? "would set" : "set"}   ${row.name} -> ${target}`);
  }

  console.log(`\n${updated} updated, ${already} already correct`);

  // Not an error — an unlisted competition is simply one the map has no opinion about,
  // and `tournament` is the right home for most of them. Printed so they can be checked.
  if (defaulted.length > 0) {
    console.log(`\n${defaulted.length} left as-is (not in the map):`);
    for (const d of defaulted) console.log(`  ${d}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
