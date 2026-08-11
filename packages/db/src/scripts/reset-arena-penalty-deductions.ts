// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * One-time policy migration: clears the arena's in-game penalty deduction out of
 * `sm5_game_penalty.score_value`.
 *
 * League policy is that an in-game penalty costs nothing — it is logged at 0 score and 0
 * MVP, and only a referee escalation decided after the game carries a deduction (see
 * docs/SM5-penalty-definitions.md). Chomper now applies that at ingest, but rows written
 * by the *old* ingest still hold `-abs(line 1 penalty)`, and reingest deliberately
 * preserves `score_value` so escalations survive — so a reingest alone cannot clear them.
 * This script does, and the legacy back-fill then writes the real escalations back:
 *
 *   1. pnpm --filter @lfstats/db reset-arena-penalties     <- this script
 *   2. pnpm --filter @lfstats/chomper bulk-reingest        <- rebuilds scores from the TDF
 *   3. pnpm --filter @lfstats/db migrate-legacy-penalties  <- restores referee escalations
 *
 * Only `score_value` is touched. `mvp_value` is deliberately left alone: 16 in-game
 * penalties on games that never existed in legacy carry a hand-entered `-5` with no score
 * (2026 games at 4-23, descriptions like "Chase on Medic"), and nothing could restore
 * those. For legacy games the back-fill rewrites `mvp_value` from legacy anyway.
 *
 * Safety: every scored row on a game absent from legacy was checked to carry the
 * ingester's untouched signature — `type` and `description` both "Common Foul", `mvp_value`
 * 0 — so no hand-entered escalation is being discarded. The script re-checks that
 * invariant at run time and refuses to touch anything that fails it.
 *
 * Usage:
 *   pnpm --filter @lfstats/db reset-arena-penalties --dry-run
 *   pnpm --filter @lfstats/db reset-arena-penalties
 *
 * Requires `LEGACY_DATABASE_URL` alongside `DATABASE_URL`.
 */

import postgres from "postgres";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { initDb } from "../client";
import { game, sm5GamePenalty, sm5Scorecard } from "../schema";
import { updatePenalty } from "../queries/penalties";

type Legacy = ReturnType<typeof postgres>;

function connectLegacy(): Legacy {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) throw new Error("Missing env var: LEGACY_DATABASE_URL");
  // The legacy site is still live — enforce read-only server-side.
  return postgres(url, {
    max: 2,
    idle_timeout: 20,
    connection: { options: "-c default_transaction_read_only=on" },
  });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const db = await initDb();
  const legacy = connectLegacy();

  try {
    const legacyGames = (await legacy`
      select distinct replace(g.tdf_key,'_','-') as fn from games g where g.tdf_key is not null
    `) as unknown as { fn: string }[];
    const inLegacy = new Set(legacyGames.map((r) => r.fn));

    const rows = await db
      .select({
        id: sm5GamePenalty.id,
        fn: game.tdfFilename,
        callsign: sm5Scorecard.callsign,
        type: sm5GamePenalty.type,
        description: sm5GamePenalty.description,
        scoreValue: sm5GamePenalty.scoreValue,
        mvpValue: sm5GamePenalty.mvpValue,
      })
      .from(sm5GamePenalty)
      .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
      .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
      .where(and(isNotNull(sm5GamePenalty.time), ne(sm5GamePenalty.scoreValue, 0)));

    // A scored row on a game legacy never held can only have come from the old ingest.
    // If it looks hand-edited, something is wrong with that assumption — stop.
    const untouched = (r: (typeof rows)[number]) =>
      r.type === "Common Foul" && r.description === "Common Foul" && r.mvpValue === 0;
    const suspicious = rows.filter((r) => !inLegacy.has(r.fn) && !untouched(r));

    const restorable = rows.filter((r) => inLegacy.has(r.fn));
    const artifacts = rows.filter((r) => !inLegacy.has(r.fn) && untouched(r));

    console.log(`\n${"=".repeat(76)}`);
    console.log(`RESET ARENA PENALTY DEDUCTIONS${dryRun ? "  (dry run)" : ""}`);
    console.log("=".repeat(76));
    console.log(`  in-game penalties with a non-zero score : ${rows.length}`);
    console.log(`    on a game legacy holds — back-fill restores : ${restorable.length}`);
    console.log(`    on a game absent from legacy, ingest default : ${artifacts.length}`);
    console.log(`    hand-edited outside legacy — REFUSED         : ${suspicious.length}`);

    if (suspicious.length > 0) {
      console.log(`\n--- REFUSING TO TOUCH THESE --------------------------------------`);
      for (const r of suspicious) {
        console.log(
          `    ${r.fn}  ${r.callsign.padEnd(20)} ${r.type.padEnd(24)} ` +
            `score=${r.scoreValue} mvp=${r.mvpValue}`,
        );
      }
      console.log(`\nNothing was written. Review these rows first.`);
      return;
    }

    const [{ mvpKept }] = await db
      .select({ mvpKept: sql<number>`count(*)::int` })
      .from(sm5GamePenalty)
      .where(and(isNotNull(sm5GamePenalty.time), ne(sm5GamePenalty.mvpValue, 0)));
    console.log(`  in-game MVP values left untouched       : ${mvpKept}`);

    if (dryRun) {
      console.log(`\nDry run — nothing was written.`);
      return;
    }

    const targets = [...restorable, ...artifacts];
    console.log(`\n--- APPLYING -----------------------------------------------------`);
    let n = 0;
    for (const r of targets) {
      // updatePenalty recalculates the game result when score_value changes.
      await updatePenalty(r.id, { scoreValue: 0 });
      if (++n % 200 === 0) console.log(`    ${n}/${targets.length}`);
    }
    console.log(`  cleared ${targets.length} in-game penalty deductions`);
    console.log(`\nNext: bulk-reingest, then migrate-legacy-penalties.`);
  } finally {
    await legacy.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
