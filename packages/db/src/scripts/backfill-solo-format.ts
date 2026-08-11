// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Flags already-migrated legacy solo events as `format = 'solo'`.
 *
 * The legacy migration created these competitions before the solo format existed, so
 * they carry `format = 'team'` and render an empty team standings table. This flips the
 * flag so the solo standings page takes over.
 *
 * It enrolls nobody: every player with games in the competition then surfaces in the
 * "not enrolled" block for an admin to add deliberately (or in bulk from the UI).
 * Legacy `event_players.handicap` did not survive the migration and cannot be recovered,
 * so any handicaps must be re-entered by hand.
 *
 *   pnpm --filter @lfstats/db backfill-solo-format --dry-run
 *   pnpm --filter @lfstats/db backfill-solo-format
 */

import { eq } from "drizzle-orm";
import { initDb } from "../client";
import { competition } from "../schema";
import { slugify } from "../lib/slug";
import { LEGACY_EVENTS } from "./legacy-events";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = await initDb();

  const soloEvents = LEGACY_EVENTS.filter((e) => e.kind === "solo");
  console.log(`${soloEvents.length} legacy solo event(s) in config${dryRun ? " (dry run)" : ""}\n`);

  let updated = 0;
  let already = 0;
  const missing: string[] = [];

  for (const cfg of soloEvents) {
    // The migration derives the slug the same way, from the override name when present.
    const name = cfg.name ?? cfg.legacyName;
    const slug = slugify(name);

    const [row] = await db
      .select({ id: competition.id, name: competition.name, format: competition.format })
      .from(competition)
      .where(eq(competition.slug, slug));

    if (!row) {
      missing.push(`${cfg.legacyId} ${name} (expected slug "${slug}")`);
      console.log(`  MISS  ${name} — no competition with slug "${slug}"`);
      continue;
    }

    if (row.format === "solo") {
      already++;
      console.log(`  skip  ${row.name} — already solo`);
      continue;
    }

    if (!dryRun) {
      // Set the column directly rather than going through updateCompetition(): that
      // helper re-slugs when a name is supplied, and this must never touch the slug.
      await db.update(competition).set({ format: "solo" }).where(eq(competition.id, row.id));
    }
    updated++;
    console.log(`  ${dryRun ? "would set" : "set"}   ${row.name} -> solo`);
  }

  console.log(
    `\n${updated} updated, ${already} already solo, ${missing.length} not found in the modern database`,
  );

  if (missing.length > 0) {
    // A miss means a competition was renamed or never migrated. Fail loudly rather than
    // silently leaving an event on the team standings page.
    console.error("\nUnresolved events:");
    for (const m of missing) console.error(`  ${m}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
