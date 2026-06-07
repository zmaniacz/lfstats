// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { eq } from "drizzle-orm";
import { initDb } from "../client";
import { competition, competitionTeam } from "../schema";
import { slugify, resolveUniqueSlug } from "../lib/slug";

async function main() {
  const db = await initDb();

  const competitions = await db
    .select({ id: competition.id, name: competition.name })
    .from(competition);

  const usedCompetitionSlugs = new Set<string>();
  for (const c of competitions) {
    const base = slugify(c.name);
    const slug = await resolveUniqueSlug(base, async (candidate) =>
      usedCompetitionSlugs.has(candidate),
    );
    usedCompetitionSlugs.add(slug);
    await db.update(competition).set({ slug }).where(eq(competition.id, c.id));
    console.log(`competition ${c.name} -> ${slug}`);
  }

  const teams = await db
    .select({
      id: competitionTeam.id,
      competitionId: competitionTeam.competitionId,
      name: competitionTeam.name,
      shortName: competitionTeam.shortName,
    })
    .from(competitionTeam);

  const usedTeamSlugsByCompetition = new Map<string, Set<string>>();
  for (const t of teams) {
    const used =
      usedTeamSlugsByCompetition.get(t.competitionId) ??
      (() => {
        const s = new Set<string>();
        usedTeamSlugsByCompetition.set(t.competitionId, s);
        return s;
      })();

    const base = slugify(t.shortName ?? t.name);
    const slug = await resolveUniqueSlug(base, async (candidate) => used.has(candidate));
    used.add(slug);
    await db.update(competitionTeam).set({ slug }).where(eq(competitionTeam.id, t.id));
    console.log(`  team ${t.name} (${t.competitionId}) -> ${slug}`);
  }

  console.log("Backfill complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
