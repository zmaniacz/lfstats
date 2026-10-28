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
 *
 * **Closed 2026-10-17.** Writing runs exit unless given `--reopen-closed-migration`;
 * `--report` and `--dry-run` still work. See LEGACY_MIGRATION_CLOSED in legacy-events.ts.
 *
 * **Scopes.** By default the script covers legacy *competitive* events (`is_comp`), which
 * is what was applied before the close. `--social` covers TDF games in legacy social
 * events instead, which the original run never touched:
 *
 *   pnpm --filter @lfstats/db migrate-legacy-penalties --social --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-penalties --social --reopen-closed-migration
 *
 * The two scopes never overlap. On top of the legacy `is_comp` split, `--social` drops any
 * game that belongs to a competition in *modern* — admins have edited those penalties
 * since the close, and the hand-built competitions are not `is_comp` in legacy's sense.
 */

import postgres from "postgres";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { initDb } from "../client";
import {
  competitionMatchGame,
  game,
  sm5GamePenalty,
  sm5GameTeam,
  sm5GameTeamPenalty,
  sm5Scorecard,
} from "../schema";
import { addPenalty, addTeamPenalty, updatePenalty } from "../queries/penalties";
import { assertLegacyMigrationOpen } from "./legacy-events";

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
  /** The scorecard's `sm5_game_team` id, for projecting the effect on the result. */
  teamId: string;
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

/**
 * Legacy-side scope: competitive events, or (`social`) everything else. Every legacy
 * query joins `events e` with a left join, so a game with no event counts as social.
 */
function eventScope(legacy: Legacy, social: boolean) {
  return social ? legacy`not coalesce(e.is_comp, false)` : legacy`coalesce(e.is_comp, false)`;
}

async function loadLegacyPenalties(legacy: Legacy, social: boolean): Promise<LegacyPenalty[]> {
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
     left join events e on e.id = g.event_id
     left join players pl on pl.id = s.player_id
    where ${eventScope(legacy, social)} and g.tdf_key is not null
    order by s.game_id, s.player_id, p.id
  `) as unknown as LegacyPenalty[];
}

async function loadLegacyTeamPenalties(
  legacy: Legacy,
  social: boolean,
): Promise<LegacyTeamPenalty[]> {
  // team_color is legacy's side discriminator ('red'/'green'), never a colour claim.
  // Resolve it to the TDF team index so the modern row is found by index, preserving
  // whatever colour the TDF actually recorded.
  //
  // The pre-close run had no event filter here, so it also considered team penalties
  // on social games; those it inserted show up as "already present" in a social run.
  return (await legacy`
    select tp.id::int,
           replace(g.tdf_key, '_', '-') as fn,
           tp.team_color, tp.type, tp.description, tp.value::int,
           gt.index::int as idx
    from team_penalties tp
     join games g on g.id = tp.game_id
     left join events e on e.id = g.event_id
     join game_teams gt on gt.game_id = g.id and gt.color_normal = tp.team_color
    where g.tdf_key is not null and ${eventScope(legacy, social)}
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
      teamId: sm5Scorecard.teamId,
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

type TeamRow = {
  id: string;
  gameId: string;
  fn: string;
  idx: number;
  /** score + elimination bonus + penalty_score, as recalculateGameResult() sees it. */
  total: number;
  outcome: string;
};

async function loadTeams(
  db: Awaited<ReturnType<typeof initDb>>,
  filenames: string[],
): Promise<TeamRow[]> {
  if (filenames.length === 0) return [];
  return db
    .select({
      id: sm5GameTeam.id,
      gameId: game.id,
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      total: sql<number>`(coalesce(${sm5GameTeam.score},0) + coalesce(${sm5GameTeam.eliminationBonus},0) + coalesce(${sm5GameTeam.penaltyScore},0))::int`,
      outcome: game.outcome,
    })
    .from(sm5GameTeam)
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .where(and(inArray(game.tdfFilename, filenames), eq(sm5GameTeam.isNeutral, false)));
}

/** The winning team id, or "draw" — the same rule as recalculateGameResult(). */
function winnerOf(teams: { id: string; total: number }[]): string {
  const max = Math.max(...teams.map((t) => t.total));
  const top = teams.filter((t) => t.total === max);
  return top.length > 1 ? "draw" : top[0].id;
}

/** Legacy team-game totals: score plus the combined `adj` column. */
async function legacyTotals(legacy: Legacy, social: boolean): Promise<Snapshot> {
  const rows = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           ((case when gt.color_normal='red' then g.red_score else g.green_score end)
          + (case when gt.color_normal='red' then g.red_adj   else g.green_adj   end))::int as total
    from games g
     left join events e on e.id = g.event_id
     join game_teams gt on gt.game_id = g.id
    where ${eventScope(legacy, social)} and g.tdf_key is not null
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
  const social = args.includes("--social");
  if (!dryRun && !reportOnly) assertLegacyMigrationOpen(args);

  const legacy = connectLegacy();
  const db = await initDb();

  try {
    const legacyPens = await loadLegacyPenalties(legacy, social);
    const legacyTeamPens = await loadLegacyTeamPenalties(legacy, social);
    const filenames = [
      ...new Set(legacyPens.map((p) => p.fn).concat(legacyTeamPens.map((p) => p.fn))),
    ];

    // Only games that actually exist in the modern database.
    const modernGames = await db
      .select({
        fn: game.tdfFilename,
        inCompetition: sql<boolean>`(${game.competitionId} is not null or exists (
          select 1 from ${competitionMatchGame} where ${competitionMatchGame.gameId} = ${game.id}))`,
      })
      .from(game)
      .where(inArray(game.tdfFilename, filenames));
    // A social run must never reach a game that is in a modern competition: admins have
    // edited those penalties since the close, and legacy's is_comp does not cover the
    // competitions that were built by hand in modern.
    const compGames = social
      ? new Set(modernGames.filter((r) => r.inCompetition).map((r) => r.fn))
      : new Set<string>();
    const present = new Set(modernGames.map((r) => r.fn).filter((f) => !compGames.has(f)));
    const scope = filenames.filter((f) => present.has(f));
    const skippedGames = filenames.length - scope.length - compGames.size;

    const modernPens = await loadModernPenalties(db, scope);
    const before = await snapshotTotals(db, scope);
    const legacyTot = await legacyTotals(legacy, social);

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

    // --- manual entries: resolve the scorecard each attaches to ------------
    // sm5_game_penalty requires a scorecard_id, so a penalty can only be created where
    // the player actually has a scorecard in that game. Resolved before the report so
    // a dry run shows exactly what a real run would create.
    const placed: ((typeof inserts)[number] & {
      scorecardId: string;
      gameId: string;
      teamId: string;
    })[] = [];
    if (inserts.length > 0) {
      const scRows = await db
        .select({
          id: sm5Scorecard.id,
          gameId: sm5Scorecard.gameId,
          teamId: sm5Scorecard.teamId,
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
      for (const i of inserts) {
        const sc = scByKey.get(`${i.fn}|${i.iplId}`);
        if (unplaceable.has(i.fn) || !sc) {
          mismatches.push({
            fn: i.fn,
            callsign: i.legacy.callsign,
            iplId: i.iplId,
            legacy: 1,
            modern: 0,
            reason: sc
              ? "manual penalty: withheld — another penalty in this game cannot be placed"
              : "manual penalty: player has no scorecard in the modern game",
          });
          continue;
        }
        placed.push({ ...i, scorecardId: sc.id, gameId: sc.gameId, teamId: sc.teamId });
      }
    }

    // --- projected effect on game results -----------------------------------
    // What recalculateGameResult() will make of the game once everything above is
    // applied: a rescinded penalty contributes nothing, an active one its score value.
    const effective = (scoreValue: number, rescinded: boolean) => (rescinded ? 0 : scoreValue);
    const delta = new Map<string, number>();
    const bump = (teamId: string, by: number) =>
      by !== 0 && delta.set(teamId, (delta.get(teamId) ?? 0) + by);
    for (const u of updates) {
      bump(
        u.before.teamId,
        effective(
          u.data.scoreValue ?? u.before.scoreValue,
          u.data.rescinded ?? u.before.rescinded,
        ) - effective(u.before.scoreValue, u.before.rescinded),
      );
    }
    for (const p of placed) bump(p.teamId, effective(p.legacy.value, p.legacy.rescinded === 1));
    for (const t of teamTargets) bump(t.gameTeamId, t.tp.value);

    const teamsByGame = groupBy(await loadTeams(db, scope), (t) => t.gameId);
    const flips: string[] = [];
    let flipsIgnored = 0;
    let gamesMoved = 0;
    // Projected agreement with legacy's team totals, over the team-games this run
    // moves — the check that an added score value is an escalation legacy also counted,
    // not a deduction the TDF score already holds.
    let agreeBefore = 0,
      agreeAfter = 0;
    const projBroken: string[] = [];
    for (const teams of teamsByGame.values()) {
      if (teams.length < 2 || !teams.some((t) => delta.has(t.id))) continue;
      gamesMoved++;
      for (const t of teams) {
        const l = legacyTot.get(`${t.fn}:${t.idx}`);
        if (l === undefined || !delta.has(t.id)) continue;
        const a = t.total + delta.get(t.id)!;
        if (t.total === l) agreeBefore++;
        if (a === l) agreeAfter++;
        if (a !== l) {
          projBroken.push(
            `${t.fn}:${t.idx}  legacy=${l} now=${t.total} after=${a}${t.total === l ? "  (matches now)" : ""}`,
          );
        }
      }
      const was = winnerOf(teams);
      const now = winnerOf(
        teams.map((t) => ({ id: t.id, total: t.total + (delta.get(t.id) ?? 0) })),
      );
      if (was === now) continue;
      // Elimination/forfeit results are not score-decided and are left alone.
      if (teams[0].outcome === "elimination" || teams[0].outcome === "forfeit") {
        flipsIgnored++;
        continue;
      }
      const label = (w: string) =>
        w === "draw" ? "draw" : `team ${teams.find((t) => t.id === w)!.idx}`;
      const scores = teams
        .map((t) => `${t.idx}: ${t.total} -> ${t.total + (delta.get(t.id) ?? 0)}`)
        .join(", ");
      flips.push(`${teams[0].fn}  ${label(was)} -> ${label(now)}  (${scores})`);
    }

    // --- report ------------------------------------------------------------
    console.log(`\n${"=".repeat(76)}`);
    console.log(
      `LEGACY PENALTY BACK-FILL — ${social ? "SOCIAL" : "COMPETITIVE"} EVENTS` +
        `${dryRun ? "  (dry run)" : reportOnly ? "  (report only)" : ""}`,
    );
    console.log("=".repeat(76));
    console.log(
      `  legacy player penalties in scope : ${legacyPens.filter((p) => present.has(p.fn)).length}`,
    );
    console.log(`  modern player penalties in scope : ${modernPens.length}`);
    console.log(
      `  games in scope                   : ${scope.length}${skippedGames ? ` (${skippedGames} legacy game(s) not in modern)` : ""}`,
    );
    if (social) {
      console.log(
        `  excluded: in a modern competition: ${compGames.size}${compGames.size ? `  (${[...compGames].sort().join(", ")})` : ""}`,
      );
    }
    const count = (f: (u: (typeof updates)[number]) => boolean) => updates.filter(f).length;
    console.log(`  player penalties to update       : ${updates.length}`);
    console.log(
      `    rescinded ${count((u) => u.data.rescinded !== u.before.rescinded)}, ` +
        `score ${count((u) => u.data.scoreValue !== u.before.scoreValue)}, ` +
        `type ${count((u) => u.data.type !== u.before.type)}, ` +
        `mvp ${count((u) => u.data.mvpValue !== u.before.mvpValue)}`,
    );
    console.log(
      `  player penalties to create       : ${placed.length}  (manual legacy entries with no TDF event)`,
    );
    console.log(`  team penalties to insert         : ${teamTargets.length}`);
    console.log(`  groups skipped for review        : ${mismatches.length}`);
    console.log(`  groups applied but order-sensitive: ${ordering.length}`);
    console.log(`  games whose total would move     : ${gamesMoved}`);
    console.log(
      `  games whose WINNER would change  : ${flips.length}` +
        `${flipsIgnored ? `  (+${flipsIgnored} elimination/forfeit, result kept)` : ""}`,
    );
    console.log(
      `  moved team-games matching legacy : ${agreeBefore} now -> ${agreeAfter} after  (of ${delta.size})`,
    );
    if (projBroken.length > 0) {
      console.log(`  moved team-games that would not match legacy:`);
      for (const b of projBroken.sort()) console.log(`    ${b}`);
    }

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

    if (placed.length > 0) {
      console.log(`\n--- CREATING (manual legacy penalties absent from modern) -------------`);
      for (const i of placed.sort((a, b) => a.fn.localeCompare(b.fn))) {
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

    if (teamTargets.length > 0) {
      console.log(`\n--- INSERTING TEAM PENALTIES -----------------------------------------`);
      for (const t of teamTargets.sort((a, b) => a.fn.localeCompare(b.fn))) {
        const v = t.tp.value;
        console.log(
          `    ${t.fn}  team ${t.idx}  ${t.tp.type ?? ""}  score=${v >= 0 ? "+" : ""}${v}`,
        );
      }
    }

    if (flips.length > 0) {
      console.log(`\n--- WINNER WOULD CHANGE ----------------------------------------------`);
      for (const f of flips.sort()) console.log(`    ${f}`);
    }

    if (reportOnly || dryRun) {
      if (dryRun) console.log(`\nDry run — nothing was written.`);
      return;
    }

    // --- apply -------------------------------------------------------------
    if (social) {
      // Belt and braces for the scope rule above: re-check, at write time, that no
      // game this run touches has joined a competition since the scope was computed.
      const touched = [
        ...new Set([
          ...updates.map((u) => u.before.gameId),
          ...placed.map((p) => p.gameId),
          ...teamTargets.map((t) => t.gameId),
        ]),
      ];
      const inComp = touched.length
        ? await db
            .select({ fn: game.tdfFilename })
            .from(game)
            .where(
              and(
                inArray(game.id, touched),
                or(
                  isNotNull(game.competitionId),
                  sql`exists (select 1 from ${competitionMatchGame} where ${competitionMatchGame.gameId} = ${game.id})`,
                ),
              ),
            )
        : [];
      if (inComp.length > 0) {
        throw new Error(
          `--social would touch competition game(s): ${inComp.map((r) => r.fn).join(", ")}`,
        );
      }
    }

    console.log(`
--- APPLYING ---------------------------------------------------------`);
    let n = 0;
    for (const u of updates) {
      await updatePenalty(u.id, u.data);
      if (++n % 200 === 0) console.log(`    ${n}/${updates.length} player penalties`);
    }
    console.log(`  updated ${updates.length} player penalties`);

    for (const p of placed) {
      const id = await addPenalty({
        scorecardId: p.scorecardId,
        gameId: p.gameId,
        type: p.legacy.type,
        description: p.legacy.description ?? "",
        scoreValue: p.legacy.value,
        mvpValue: p.legacy.mvp_value,
        inGame: p.legacy.in_game === 1,
      });
      // addPenalty() always creates an active row; carry legacy's rescinded flag over
      // so the record survives without counting.
      if (p.legacy.rescinded === 1) await updatePenalty(id, { rescinded: true });
    }
    console.log(`  created ${placed.length} manual player penalties`);

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
