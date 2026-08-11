// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Back-fills referee-penalty metadata from the legacy `lfstats` database.
 *
 * The competition migration (`migrate-legacy-competition.ts`) carried across structure
 * only. The penalty *rows* themselves already exist in `lfstats_modern` because chomper
 * re-derives them from the TDF's 0600 events at ingest — but everything a human added on
 * top of them in legacy was left behind:
 *
 *   - `rescinded`   a referee removed the penalty; modern still counts it
 *   - `type`        hand classification (Chasing, Shielding, Dangerous Play, ...)
 *   - `value`       the score impact — **only where modern has none**, see below
 *   - `mvp_value`   the MVP impact
 *   - team penalties, which have no player attribution at all and are simply absent
 *
 * On `value`: chomper now derives the score impact from line 1 `penalty` at ingest, so
 * the TDF is authoritative and legacy is only consulted where modern is 0 (pre-2.003
 * files, which have no `penalty` field). Team penalties and manually created penalties
 * have no TDF source at all, so they still take the legacy value outright.
 *
 * Player penalties are matched by `(tdf_filename, ipl_id)`. Legacy's `penalties` table
 * has no `time` column, so within a group the two sides are paired in order. Where the
 * counts disagree the group is **skipped and reported** rather than guessed at — legacy
 * recording was not always consistent, and a wrong attribution is worse than a gap.
 *
 * Usage:
 *   pnpm --filter @lfstats/db migrate-legacy-penalties --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-penalties
 *   pnpm --filter @lfstats/db migrate-legacy-penalties --report
 *
 * Requires `LEGACY_DATABASE_URL` alongside `DATABASE_URL`.
 */

import postgres from "postgres";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { initDb } from "../client";
import { game, sm5GamePenalty, sm5GameTeam, sm5GameTeamPenalty, sm5Scorecard } from "../schema";
import { addPenalty, addTeamPenalty, updatePenalty } from "../queries/penalties";

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LegacyPenalty = {
  id: number;
  fn: string;
  ipl_id: string | null;
  callsign: string;
  type: string;
  description: string | null;
  value: number;
  mvp_value: number;
  in_game: number;
  rescinded: number;
};

type LegacyTeamPenalty = {
  id: number;
  fn: string;
  team_color: string;
  type: string | null;
  description: string | null;
  value: number;
  idx: number;
};

type ModernPenalty = {
  id: string;
  gameId: string;
  fn: string;
  iplId: string | null;
  callsign: string;
  type: string;
  scoreValue: number;
  mvpValue: number;
  rescinded: boolean;
};

type Mismatch = {
  fn: string;
  callsign: string;
  iplId: string | null;
  legacy: number;
  modern: number;
  reason: string;
};

/** A team-game total, used to measure what the back-fill actually moved. */
type Snapshot = Map<string, number>;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadLegacyPenalties(legacy: Legacy): Promise<LegacyPenalty[]> {
  return (await legacy`
    select p.id::int,
           replace(g.tdf_key, '_', '-') as fn,
           nullif(trim(pl.ipl_id), '') as ipl_id,
           s.player_name as callsign,
           p.type, p.description, p.value::int, p.mvp_value::float8,
           p.in_game::int, p.rescinded::int
    from penalties p
     join scorecards s on s.id = p.scorecard_id
     join games g on g.id = s.game_id
     join events e on e.id = g.event_id
     left join players pl on pl.id = s.player_id
    where e.is_comp and g.tdf_key is not null
    order by s.game_id, s.player_id, p.id
  `) as unknown as LegacyPenalty[];
}

async function loadLegacyTeamPenalties(legacy: Legacy): Promise<LegacyTeamPenalty[]> {
  // team_color is legacy's side discriminator ('red'/'green'), never a colour claim.
  // Resolve it to the TDF team index so the modern row is found by index, preserving
  // whatever colour the TDF actually recorded.
  return (await legacy`
    select tp.id::int,
           replace(g.tdf_key, '_', '-') as fn,
           tp.team_color, tp.type, tp.description, tp.value::int,
           gt.index::int as idx
    from team_penalties tp
     join games g on g.id = tp.game_id
     join game_teams gt on gt.game_id = g.id and gt.color_normal = tp.team_color
    where g.tdf_key is not null
    order by tp.id
  `) as unknown as LegacyTeamPenalty[];
}

async function loadModernPenalties(
  db: Awaited<ReturnType<typeof initDb>>,
  filenames: string[],
): Promise<ModernPenalty[]> {
  const rows = await db
    .select({
      id: sm5GamePenalty.id,
      gameId: sm5GamePenalty.gameId,
      fn: game.tdfFilename,
      iplId: sm5Scorecard.iplId,
      callsign: sm5Scorecard.callsign,
      type: sm5GamePenalty.type,
      scoreValue: sm5GamePenalty.scoreValue,
      mvpValue: sm5GamePenalty.mvpValue,
      rescinded: sm5GamePenalty.rescinded,
      time: sm5GamePenalty.time,
    })
    .from(sm5GamePenalty)
    .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
    .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
    .where(inArray(game.tdfFilename, filenames))
    .orderBy(game.tdfFilename, sm5Scorecard.iplId, sm5GamePenalty.time, sm5GamePenalty.id);
  return rows.map(({ time: _time, ...r }) => r);
}

/** Team-game totals, keyed `filename:index` — the number that decides a game. */
async function snapshotTotals(
  db: Awaited<ReturnType<typeof initDb>>,
  filenames: string[],
): Promise<Snapshot> {
  const rows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      total: sql<number>`(${sm5GameTeam.score} + coalesce(${sm5GameTeam.eliminationBonus},0) + coalesce(${sm5GameTeam.penaltyScore},0))::int`,
    })
    .from(sm5GameTeam)
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .where(and(inArray(game.tdfFilename, filenames), eq(sm5GameTeam.isNeutral, false)));
  return new Map(rows.map((r) => [`${r.fn}:${r.idx}`, r.total]));
}

/** Legacy team-game totals: score plus the combined `adj` column. */
async function legacyTotals(legacy: Legacy): Promise<Snapshot> {
  const rows = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           ((case when gt.color_normal='red' then g.red_score else g.green_score end)
          + (case when gt.color_normal='red' then g.red_adj   else g.green_adj   end))::int as total
    from games g
     join events e on e.id = g.event_id
     join game_teams gt on gt.game_id = g.id
    where e.is_comp and g.tdf_key is not null
      and gt.neutral_team is not true and coalesce(gt.color_normal,'') <> ''
  `) as unknown as { fn: string; idx: number; total: number }[];
  return new Map(rows.map((r) => [`${r.fn}:${r.idx}`, r.total]));
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const reportOnly = args.includes("--report");

  const legacy = connectLegacy();
  const db = await initDb();

  try {
    const legacyPens = await loadLegacyPenalties(legacy);
    const legacyTeamPens = await loadLegacyTeamPenalties(legacy);
    const filenames = [
      ...new Set(legacyPens.map((p) => p.fn).concat(legacyTeamPens.map((p) => p.fn))),
    ];

    // Only games that actually exist in the modern database.
    const present = new Set(
      (
        await db
          .select({ fn: game.tdfFilename })
          .from(game)
          .where(inArray(game.tdfFilename, filenames))
      ).map((r) => r.fn),
    );
    const scope = filenames.filter((f) => present.has(f));
    const skippedGames = filenames.length - scope.length;

    const modernPens = await loadModernPenalties(db, scope);
    const before = await snapshotTotals(db, scope);
    const legacyTot = await legacyTotals(legacy);

    // --- pair up player penalties -----------------------------------------
    const lg = groupBy(
      legacyPens.filter((p) => present.has(p.fn)),
      (p) => `${p.fn}|${p.ipl_id ?? ""}`,
    );
    const mg = groupBy(modernPens, (p) => `${p.fn}|${p.iplId ?? ""}`);

    const mismatches: Mismatch[] = [];
    const updates: {
      id: string;
      data: Parameters<typeof updatePenalty>[1];
      fn: string;
      /** The modern row as it stands, so the report can show what would change. */
      before: ModernPenalty;
    }[] = [];
    const inserts: { fn: string; iplId: string; legacy: LegacyPenalty }[] = [];
    const ordering: Mismatch[] = [];

    for (const [key, lrows] of lg) {
      const [fn, ipl] = key.split("|");
      const mrows = mg.get(key);
      if (!ipl) {
        mismatches.push({
          fn,
          callsign: lrows[0].callsign,
          iplId: null,
          legacy: lrows.length,
          modern: 0,
          reason: "legacy player has no ipl_id — cannot be matched",
        });
        continue;
      }
      if (!mrows) {
        // Legacy has penalties here and modern has none at all. These are manual
        // entries a referee added by hand — score adjustments and misconduct calls
        // with no TDF 0600 event behind them ("Unknown +6232", "Game Misconduct
        // -5122"). With nothing on the modern side there is no attribution to get
        // wrong, so create them rather than skipping.
        inserts.push(...lrows.map((l) => ({ fn, iplId: ipl, legacy: l })));
        continue;
      }
      if (mrows.length !== lrows.length) {
        mismatches.push({
          fn,
          callsign: lrows[0].callsign,
          iplId: ipl,
          legacy: lrows.length,
          modern: mrows.length,
          reason: "penalty count differs — attribution would be a guess",
        });
        continue;
      }
      // Counts match, so the rows pair up — but legacy orders by `id` and modern by
      // `time`, and legacy has no timestamp to check that against. When a group holds
      // more than one penalty and they are not all identical, the pairing could be
      // transposed: the totals stay right, the per-penalty type/MVP may not.
      if (lrows.length > 1) {
        const distinct = new Set(
          lrows.map((l) => `${l.type}|${l.value}|${l.mvp_value}|${l.rescinded}`),
        );
        if (distinct.size > 1) {
          ordering.push({
            fn,
            callsign: lrows[0].callsign,
            iplId: ipl,
            legacy: lrows.length,
            modern: mrows.length,
            reason: "order-sensitive: several differing penalties for one player in one game",
          });
        }
      }
      for (let i = 0; i < lrows.length; i++) {
        const l = lrows[i];
        const m = mrows[i];
        const data = {
          type: l.type,
          description: l.description ?? "",
          // The TDF owns the score value wherever it has one. This script was written
          // when chomper recorded 0 for every in-game penalty — it was failing to read
          // line 1 `penalty` — which made legacy the only source. That is fixed, so
          // taking the legacy value unconditionally would now overwrite the correct
          // figure: 283 penalties would be zeroed back out. Legacy still fills the gap
          // where modern is 0, which is mostly pre-2.003 files that have no `penalty`
          // field at all. Checked against the data first: no penalty is non-zero in
          // both and disagrees, so preferring the TDF loses nothing.
          scoreValue: m.scoreValue !== 0 ? m.scoreValue : l.value,
          mvpValue: l.mvp_value,
          rescinded: l.rescinded === 1,
        };
        const unchanged =
          m.type === data.type &&
          m.scoreValue === data.scoreValue &&
          m.mvpValue === data.mvpValue &&
          m.rescinded === data.rescinded;
        if (!unchanged) updates.push({ id: m.id, data, fn, before: m });
      }
    }

    // modern penalties with no legacy counterpart at all
    for (const [key, mrows] of mg) {
      if (!lg.has(key)) {
        const [fn] = key.split("|");
        mismatches.push({
          fn,
          callsign: mrows[0].callsign,
          iplId: mrows[0].iplId,
          legacy: 0,
          modern: mrows.length,
          reason: "present in modern, absent in legacy",
        });
      }
    }

    // --- team penalties ----------------------------------------------------
    const existingTeamPens = await db
      .select({ gameId: sm5GameTeamPenalty.gameId })
      .from(sm5GameTeamPenalty);
    const teamPenGames = new Set(existingTeamPens.map((r) => r.gameId));

    const teamTargets: {
      fn: string;
      idx: number;
      tp: LegacyTeamPenalty;
      gameTeamId: string;
      gameId: string;
    }[] = [];
    const inScopeTeamPens = legacyTeamPens.filter((p) => present.has(p.fn));
    if (inScopeTeamPens.length > 0) {
      const teamRows = await db
        .select({
          id: sm5GameTeam.id,
          gameId: game.id,
          fn: game.tdfFilename,
          idx: sm5GameTeam.tdfTeamIndex,
        })
        .from(sm5GameTeam)
        .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
        .where(
          inArray(
            game.tdfFilename,
            inScopeTeamPens.map((p) => p.fn),
          ),
        );
      const byKey = new Map(teamRows.map((r) => [`${r.fn}:${r.idx}`, r]));
      for (const tp of inScopeTeamPens) {
        const t = byKey.get(`${tp.fn}:${tp.idx}`);
        if (!t) {
          mismatches.push({
            fn: tp.fn,
            callsign: `(team ${tp.team_color})`,
            iplId: null,
            legacy: 1,
            modern: 0,
            reason: "team penalty: no modern game team at that index",
          });
          continue;
        }
        if (teamPenGames.has(t.gameId)) {
          mismatches.push({
            fn: tp.fn,
            callsign: `(team ${tp.team_color})`,
            iplId: null,
            legacy: 1,
            modern: 1,
            reason: "team penalty already present in modern — skipped",
          });
          continue;
        }
        teamTargets.push({ fn: tp.fn, idx: tp.idx, tp, gameTeamId: t.id, gameId: t.gameId });
      }
    }

    // --- report ------------------------------------------------------------
    console.log(`\n${"=".repeat(76)}`);
    console.log(
      `LEGACY PENALTY BACK-FILL${dryRun ? "  (dry run)" : reportOnly ? "  (report only)" : ""}`,
    );
    console.log("=".repeat(76));
    console.log(
      `  legacy player penalties in scope : ${legacyPens.filter((p) => present.has(p.fn)).length}`,
    );
    console.log(`  modern player penalties in scope : ${modernPens.length}`);
    console.log(
      `  games in scope                   : ${scope.length}${skippedGames ? ` (${skippedGames} legacy game(s) not in modern)` : ""}`,
    );
    console.log(`  player penalties to update       : ${updates.length}`);
    console.log(
      `  player penalties to create       : ${inserts.length}  (manual legacy entries with no TDF event)`,
    );
    console.log(`  team penalties to insert         : ${teamTargets.length}`);
    console.log(`  groups skipped for review        : ${mismatches.length}`);
    console.log(`  groups applied but order-sensitive: ${ordering.length}`);

    if (ordering.length > 0) {
      console.log(`
--- APPLIED, BUT WORTH A LOOK ----------------------------------------`);
      console.log(`  One player, several differing penalties in one game. Totals are correct`);
      console.log(`  either way; the type/MVP split between them may be transposed.`);
      for (const o of ordering.sort((a, b) => a.fn.localeCompare(b.fn))) {
        console.log(`    ${o.fn}  ${o.callsign.padEnd(22)} ${o.legacy} penalties`);
      }
    }

    if (updates.length > 0) {
      console.log(`\n--- UPDATING (modern row differs from legacy) -------------------------`);
      const field = (name: string, from: unknown, to: unknown) =>
        from === to ? null : `${name} ${JSON.stringify(from)} -> ${JSON.stringify(to)}`;
      for (const u of updates.sort((a, b) => a.fn.localeCompare(b.fn))) {
        const changed = [
          field("type", u.before.type, u.data.type),
          field("score", u.before.scoreValue, u.data.scoreValue),
          field("mvp", u.before.mvpValue, u.data.mvpValue),
          field("rescinded", u.before.rescinded, u.data.rescinded),
        ]
          .filter(Boolean)
          .join(", ");
        console.log(
          `    ${u.fn}  ${u.before.callsign.padEnd(20)} ${u.before.type.padEnd(24)} ${changed}`,
        );
      }
    }

    if (inserts.length > 0) {
      console.log(`\n--- CREATING (manual legacy penalties absent from modern) -------------`);
      for (const i of inserts.sort((a, b) => a.fn.localeCompare(b.fn))) {
        const v = i.legacy.value;
        console.log(
          `    ${i.fn}  ${i.legacy.callsign.padEnd(20)} ${i.legacy.type.padEnd(16)} ` +
            `score=${v >= 0 ? "+" : ""}${v} mvp=${i.legacy.mvp_value}${i.legacy.rescinded ? " [rescinded]" : ""}`,
        );
      }
    }

    if (mismatches.length > 0) {
      console.log(`\n--- SKIPPED, NEEDS A MANUAL PASS -------------------------------------`);
      const byReason = groupBy(mismatches, (m) => m.reason);
      for (const [reason, list] of byReason) {
        console.log(`\n  ${reason}  (${list.length})`);
        for (const m of list.sort((a, b) => a.fn.localeCompare(b.fn))) {
          console.log(
            `    ${m.fn}  ${m.callsign.padEnd(22)} legacy=${m.legacy} modern=${m.modern}`,
          );
        }
      }
    }

    if (reportOnly || dryRun) {
      if (dryRun) console.log(`\nDry run — nothing was written.`);
      return;
    }

    // --- apply -------------------------------------------------------------
    console.log(`\n--- APPLYING ---------------------------------------------------------`);
    let n = 0;
    for (const u of updates) {
      await updatePenalty(u.id, u.data);
      if (++n % 200 === 0) console.log(`    ${n}/${updates.length} player penalties`);
    }
    console.log(`  updated ${updates.length} player penalties`);

    if (inserts.length > 0) {
      // Resolve the scorecard each manual penalty attaches to. sm5_game_penalty
      // requires a scorecard_id, so a penalty can only be created where the player
      // actually has a scorecard in that game.
      const scRows = await db
        .select({
          id: sm5Scorecard.id,
          gameId: sm5Scorecard.gameId,
          fn: game.tdfFilename,
          iplId: sm5Scorecard.iplId,
        })
        .from(sm5Scorecard)
        .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
        .where(
          and(
            inArray(game.tdfFilename, [...new Set(inserts.map((i) => i.fn))]),
            isNotNull(sm5Scorecard.iplId),
          ),
        );
      const scByKey = new Map(scRows.map((r) => [`${r.fn}|${r.iplId}`, r]));

      // Manual legacy penalties often come in offsetting pairs on the same team — a
      // score transfer between two players, netting zero. Creating only half of one
      // because the other player has no scorecard in modern's version of the game
      // leaves the team credited or docked for nothing. So if any manual penalty in a
      // game cannot be placed, skip every manual penalty in that game.
      const unplaceable = new Set(
        inserts.filter((i) => !scByKey.has(`${i.fn}|${i.iplId}`)).map((i) => i.fn),
      );
      for (const fn of unplaceable) {
        for (const i of inserts.filter((x) => x.fn === fn)) {
          mismatches.push({
            fn,
            callsign: i.legacy.callsign,
            iplId: i.iplId,
            legacy: 1,
            modern: 0,
            reason: scByKey.has(`${fn}|${i.iplId}`)
              ? "manual penalty: withheld — another penalty in this game cannot be placed"
              : "manual penalty: player has no scorecard in the modern game",
          });
        }
      }

      let created = 0;
      for (const i of inserts) {
        if (unplaceable.has(i.fn)) continue;
        const sc = scByKey.get(`${i.fn}|${i.iplId}`);
        if (!sc) continue;
        await addPenalty({
          scorecardId: sc.id,
          gameId: sc.gameId,
          type: i.legacy.type,
          description: i.legacy.description ?? "",
          scoreValue: i.legacy.value,
          mvpValue: i.legacy.mvp_value,
          inGame: i.legacy.in_game === 1,
        });
        created++;
      }
      console.log(`  created ${created} manual player penalties`);
      // Anything that fell out here was discovered after the skip list was printed,
      // so surface it again rather than letting it vanish from the review list.
      const late = inserts.length - created;
      if (late > 0) {
        console.log(`\n  ADDITIONAL SKIPS — no scorecard for this player in the modern game:`);
        for (const m of mismatches.filter((x) =>
          x.reason.startsWith("manual penalty: player has no scorecard"),
        )) {
          console.log(`    ${m.fn}  ${m.callsign}`);
        }
      }
    }

    for (const t of teamTargets) {
      await addTeamPenalty({
        gameTeamId: t.gameTeamId,
        gameId: t.gameId,
        type: t.tp.type?.trim() || "Common Foul",
        description: t.tp.description?.trim() || "Migrated from legacy team penalty",
        scoreValue: t.tp.value,
        inGame: false,
      });
      console.log(
        `    team penalty ${t.tp.value >= 0 ? "+" : ""}${t.tp.value} -> ${t.fn} team ${t.idx}`,
      );
    }
    console.log(`  inserted ${teamTargets.length} team penalties`);

    // --- impact ------------------------------------------------------------
    const after = await snapshotTotals(db, scope);
    let moved = 0,
      agreedBefore = 0,
      agreedAfter = 0,
      newlyBroken = 0,
      newlyFixed = 0;
    const broken: string[] = [];
    for (const [k, a] of after) {
      const b = before.get(k);
      const l = legacyTot.get(k);
      if (b !== undefined && b !== a) moved++;
      if (l === undefined) continue;
      const okBefore = b === l,
        okAfter = a === l;
      if (okBefore) agreedBefore++;
      if (okAfter) agreedAfter++;
      if (okBefore && !okAfter) {
        newlyBroken++;
        broken.push(`${k}  legacy=${l} was=${b} now=${a}`);
      }
      if (!okBefore && okAfter) newlyFixed++;
    }
    console.log(`\n--- IMPACT ON TEAM-GAME TOTALS ---------------------------------------`);
    console.log(`  totals changed by this back-fill : ${moved}`);
    console.log(`  agreed with legacy before        : ${agreedBefore}`);
    console.log(
      `  agreed with legacy after         : ${agreedAfter}  (${agreedAfter - agreedBefore >= 0 ? "+" : ""}${agreedAfter - agreedBefore})`,
    );
    console.log(`  newly agreeing                   : ${newlyFixed}`);
    console.log(`  newly DISAGREEING                : ${newlyBroken}`);
    if (broken.length > 0) {
      console.log(`\n  Rows that agreed before and no longer do — review these:`);
      for (const b of broken.sort()) console.log(`    ${b}`);
    }
  } finally {
    await legacy.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
