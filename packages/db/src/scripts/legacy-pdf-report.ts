// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Profiles the legacy PDF-era games — `games.tdf_key IS NULL` — ahead of migrating them
 * into `lfstats_modern`.
 *
 * These games were ingested from printed PDF scorecards, so they hold end-of-game state
 * only and their players often have no IPL id. Before the migration's mapping rules can
 * be fixed, this report answers:
 *
 *   1. population   how many games, when, which legacy types / events / matches
 *   2. centers      which legacy centers have no modern `center` row
 *   3. timestamps   how legacy `game_datetime` relates to modern local `start_time`,
 *                   calibrated on TDF-era games that exist in both databases
 *   4. collisions   `(center, start_time)` clashes, within the set and against modern
 *   5. players      linked to a modern IPL id, linked to an unknown one, or unlinked
 *   6. domains      position / team / survived / winner values and duration units
 *   7. score basis  whether scorecard scores already have penalties deducted
 *   8. child rows   hits, penalties, team penalties and match penalties
 *
 * Read-only against both databases.
 *
 * Usage:
 *   pnpm --filter @lfstats/db legacy-pdf-report
 */

import postgres from "postgres";
import { sql } from "drizzle-orm";
import { initDb } from "../client";

type Legacy = ReturnType<typeof postgres>;
type Db = Awaited<ReturnType<typeof initDb>>;

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

function heading(title: string): void {
  console.log(`\n=== ${title} ${"=".repeat(Math.max(0, 70 - title.length))}`);
}

// ---------------------------------------------------------------------------
// 1. Population
// ---------------------------------------------------------------------------

async function population(legacy: Legacy): Promise<void> {
  heading("1. Population");
  const [totals] = await legacy`
    select count(*)::int as games,
           min(game_datetime)::text as first,
           max(game_datetime)::text as last,
           count(*) filter (where pdf_id is null)::int as no_pdf_id,
           count(*) filter (where event_id is not null)::int as with_event,
           count(*) filter (where match_id is not null)::int as with_match,
           count(*) filter (where red_team_id is not null or green_team_id is not null)::int as with_event_teams
    from games where tdf_key is null`;
  console.table([totals]);

  console.log("By legacy type:");
  console.table(
    await legacy`
      select type, count(*)::int as games, count(event_id)::int as with_event
      from games where tdf_key is null group by type order by 2 desc`,
  );

  console.log("PDF games after the first TDF game (overlap with the TDF era):");
  console.table(
    await legacy`
      select count(*)::int as games from games
      where tdf_key is null
        and game_datetime >= (select min(game_datetime) from games where tdf_key is not null)`,
  );

  console.log("Games with no pdf_id, or inside the TDF era, by center and year:");
  console.table(
    await legacy`
      with first_tdf as (select min(game_datetime) as t from games where tdf_key is not null)
      select g.center_id::int, extract(year from g.game_datetime)::int as year,
             count(*) filter (where g.pdf_id is null)::int as no_pdf_id,
             count(*) filter (where g.game_datetime >= first_tdf.t)::int as tdf_era,
             count(*)::int as all_games
      from games g, first_tdf
      where g.tdf_key is null and (g.pdf_id is null or g.game_datetime >= first_tdf.t)
      group by 1, 2 order by 1, 2`,
  );

  console.log("Sample games with no pdf_id:");
  console.table(
    await legacy`
      select g.id::int, g.center_id::int, g.game_datetime::text, g.game_name, g.type,
             g.game_length, (select count(*)::int from scorecards s where s.game_id = g.id) as scorecards
      from games g where g.tdf_key is null and g.pdf_id is null
      order by g.game_datetime desc limit 10`,
  );
}

// ---------------------------------------------------------------------------
// 2. Centers
// ---------------------------------------------------------------------------

async function centers(legacy: Legacy, db: Db): Promise<void> {
  heading("2. Centers");
  const rows = await legacy<
    { center_id: number; ipl_id: string | null; games: number; first: string; last: string }[]
  >`
    select g.center_id::int, nullif(trim(c.ipl_id), '') as ipl_id, count(*)::int as games,
           min(g.game_datetime)::date::text as first, max(g.game_datetime)::date::text as last
    from games g join centers c on c.id = g.center_id
    where g.tdf_key is null
    group by 1, 2 order by 3 desc`;

  const modern = await db.execute<{ code: string; name: string; timezone: string | null }>(
    sql`select country_code || '-' || site_code as code, name, timezone from center`,
  );
  const byCode = new Map(modern.map((m) => [m.code, m]));

  console.table(
    rows.map((r) => {
      const m = r.ipl_id ? byCode.get(r.ipl_id) : undefined;
      return {
        legacyCenter: r.center_id,
        iplId: r.ipl_id ?? "(none)",
        modern: m ? m.name : "MISSING",
        timezone: m?.timezone ?? "",
        games: r.games,
        first: r.first,
        last: r.last,
      };
    }),
  );

  // Column names on legacy `centers` beyond id / ipl_id are not known here, so dump the
  // whole row for the centers that cannot be mapped.
  console.log("Legacy centers with no ipl_id (full rows):");
  for (const r of await legacy<{ row: Record<string, unknown> }[]>`
    select to_jsonb(c) as row from centers c
    where nullif(trim(c.ipl_id), '') is null
      and c.id in (select center_id from games where tdf_key is null)
    order by c.id`) {
    console.log(JSON.stringify(r.row));
  }
}

// ---------------------------------------------------------------------------
// 3 + 4. Timestamps and collisions
// ---------------------------------------------------------------------------

/**
 * Modern `start_time` is center-local wall time, and for TDF games it equals the
 * timestamp in the TDF filename. Legacy `game_datetime` is `timestamptz`. Comparing the
 * two on games present in both says which conversion reproduces modern's convention.
 */
async function timestamps(legacy: Legacy, db: Db): Promise<void> {
  heading("3. Timestamp calibration (TDF-era games in both databases)");

  const legacyRows = await legacy<{ fn: string; utc: string; ipl_id: string | null }[]>`
    select replace(g.tdf_key, '_', '-') as fn,
           to_char(g.game_datetime at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as utc,
           nullif(trim(c.ipl_id), '') as ipl_id
    from games g join centers c on c.id = g.center_id
    where g.tdf_key is not null`;

  const modernRows = await db.execute<{ fn: string; local: string; timezone: string | null }>(sql`
    select g.tdf_filename as fn,
           to_char(g.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as local,
           c.timezone
    from game g join center c on c.id = g.center_id
    where g.tdf_filename <> ''`);
  const modernByFn = new Map(modernRows.map((r) => [r.fn, r]));

  // Per center: the distribution of (modern local − legacy UTC) in minutes.
  const offsets = new Map<string, Map<number, number>>();
  let matched = 0;
  for (const l of legacyRows) {
    const m = modernByFn.get(l.fn);
    if (!m) continue;
    matched++;
    const diff = Math.round((Date.parse(`${m.local}Z`) - Date.parse(`${l.utc}Z`)) / 60000);
    const key = `${l.ipl_id ?? "?"} (${m.timezone ?? "no tz"})`;
    const dist = offsets.get(key) ?? new Map<number, number>();
    dist.set(diff, (dist.get(diff) ?? 0) + 1);
    offsets.set(key, dist);
  }
  console.log(`Matched ${matched} of ${legacyRows.length} TDF-era legacy games by filename.`);
  console.log(
    "Offset = modern local − legacy UTC, in minutes. 0 means legacy stored local as UTC.",
  );
  console.table(
    [...offsets].map(([center, dist]) => ({
      center,
      offsets: [...dist]
        .sort((a, b) => b[1] - a[1])
        .map(([o, n]) => `${o}m×${n}`)
        .join(", "),
    })),
  );

  heading("4. Collisions");
  console.log("PDF games sharing (center, game_datetime) with another legacy game:");
  console.table(
    await legacy`
      select g.center_id::int, g.game_datetime::text, count(*)::int as games,
             array_agg(g.id order by g.id) as legacy_ids,
             array_agg(coalesce(g.tdf_key, '(pdf)') order by g.id) as keys
      from games g
      where g.center_id in (select center_id from games where tdf_key is null)
      group by 1, 2
      having count(*) > 1 and bool_or(g.tdf_key is null)
      order by 2 limit 50`,
  );
  // Section 3 calibrates TDF-era games only. PDF games came through a different importer
  // that read each printed (center-local) time as US Pacific and stored it as UTC, so their
  // wall time is game_datetime rendered in America/Los_Angeles. A PDF game within a few
  // minutes of a modern game at the same center is probably that game, already ingested
  // from its TDF.
  const pdfRows = await legacy<{ id: number; ipl_id: string; utc: string; has_pdf: boolean }[]>`
    select g.id::int, trim(c.ipl_id) as ipl_id,
           to_char(g.game_datetime at time zone 'America/Los_Angeles', 'YYYY-MM-DD"T"HH24:MI:SS') as utc,
           g.pdf_id is not null as has_pdf
    from games g join centers c on c.id = g.center_id
    where g.tdf_key is null and nullif(trim(c.ipl_id), '') is not null`;
  const modernGames = await db.execute<{ code: string; local: string; type: string }>(sql`
    select c.country_code || '-' || c.site_code as code,
           to_char(g.start_time, 'YYYY-MM-DD"T"HH24:MI:SS') as local, g.type
    from game g join center c on c.id = g.center_id`);
  const modernByCenter = new Map<string, number[]>();
  for (const m of modernGames) {
    const list = modernByCenter.get(m.code) ?? [];
    list.push(Date.parse(`${m.local}Z`));
    modernByCenter.set(m.code, list);
  }
  const near = { exact: 0, within2m: 0, within10m: 0 };
  const samples: { legacyId: number; center: string; at: string; gapSec: number; pdf: boolean }[] =
    [];
  for (const p of pdfRows) {
    const t = Date.parse(`${p.utc}Z`);
    const gap = Math.min(
      ...(modernByCenter.get(p.ipl_id) ?? []).map((m) => Math.abs(m - t) / 1000),
      Infinity,
    );
    if (gap === 0) near.exact++;
    else if (gap <= 120) near.within2m++;
    else if (gap <= 600) near.within10m++;
    else continue;
    if (samples.length < 25) {
      samples.push({ legacyId: p.id, center: p.ipl_id, at: p.utc, gapSec: gap, pdf: p.has_pdf });
    }
  }
  console.log(`PDF games (with a mappable center) near a modern game at the same center:`);
  console.table([{ checked: pdfRows.length, ...near }]);
  if (samples.length) console.table(samples);
}

// ---------------------------------------------------------------------------
// 5. Players
// ---------------------------------------------------------------------------

async function players(legacy: Legacy, db: Db): Promise<void> {
  heading("5. Players");

  const rows = await legacy<{ player_id: number; ipl_id: string | null; scorecards: number }[]>`
    with ids as (
      select s.player_id, count(*)::int as scorecards
      from scorecards s where s.game_id in (select id from games where tdf_key is null)
      group by 1
      union all
      select h.player_id, 0 from hits h
        join scorecards s on s.id = h.scorecard_id
        where s.game_id in (select id from games where tdf_key is null)
      union all
      select h.target_id, 0 from hits h
        join scorecards s on s.id = h.scorecard_id
        where s.game_id in (select id from games where tdf_key is null)
    )
    select ids.player_id::int, nullif(trim(p.ipl_id), '') as ipl_id, sum(ids.scorecards)::int as scorecards
    from ids join players p on p.id = ids.player_id
    group by 1, 2`;

  const modern = await db.execute<{ ipl_id: string }>(sql`select ipl_id from player`);
  const known = new Set(modern.map((m) => m.ipl_id));

  const buckets = { linkedKnown: 0, linkedUnknown: 0, unlinked: 0, hitsOnly: 0 };
  const scorecardsBy = { linkedKnown: 0, linkedUnknown: 0, unlinked: 0 };
  const iplCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.scorecards === 0) buckets.hitsOnly++;
    const bucket = !r.ipl_id ? "unlinked" : known.has(r.ipl_id) ? "linkedKnown" : "linkedUnknown";
    buckets[bucket]++;
    scorecardsBy[bucket] += r.scorecards;
    if (r.ipl_id) iplCounts.set(r.ipl_id, (iplCounts.get(r.ipl_id) ?? 0) + 1);
  }
  console.table([
    {
      players: rows.length,
      ...buckets,
      scLinkedKnown: scorecardsBy.linkedKnown,
      scLinkedUnknown: scorecardsBy.linkedUnknown,
      scUnlinked: scorecardsBy.unlinked,
    },
  ]);

  const shared = [...iplCounts].filter(([, n]) => n > 1);
  console.log(`IPL ids shared by more than one legacy player_id: ${shared.length}`);
  if (shared.length) console.table(shared.slice(0, 20).map(([ipl, n]) => ({ ipl, players: n })));

  console.log("Same player with two scorecards in one PDF game:");
  console.table(
    await legacy`
      select game_id::int, player_id::int, count(*)::int as scorecards,
             array_agg(player_name) as names
      from scorecards where game_id in (select id from games where tdf_key is null)
      group by 1, 2 having count(*) > 1 limit 20`,
  );

  console.log("Distinct callsigns per legacy player (max / players with >1):");
  console.table(
    await legacy`
      select max(n)::int as max_callsigns, count(*) filter (where n > 1)::int as players_with_several
      from (select player_id, count(distinct player_name) as n
            from scorecards where game_id in (select id from games where tdf_key is null) group by 1) t`,
  );
}

// ---------------------------------------------------------------------------
// 6. Value domains
// ---------------------------------------------------------------------------

async function domains(legacy: Legacy): Promise<void> {
  heading("6. Value domains");

  console.log("scorecards.position:");
  console.table(
    await legacy`select position, count(*)::int from scorecards where game_id in (select id from games where tdf_key is null) group by 1 order by 2 desc`,
  );
  console.log("scorecards.team:");
  console.table(
    await legacy`select team, count(*)::int from scorecards where game_id in (select id from games where tdf_key is null) group by 1 order by 2 desc`,
  );
  console.log("scorecards.survived against game_length and lives_left:");
  console.table(
    await legacy`
      select case when s.survived is null then 'null'
                  when s.survived >= coalesce(g.game_length, 900) then 'full game'
                  else 'partial' end as survived,
             (s.lives_left = 0) as no_lives_left,
             count(*)::int
      from scorecards s join games g on g.id = s.game_id
      where g.tdf_key is null group by 1, 2 order by 1, 2`,
  );
  console.log("scorecards.is_sub / type:");
  console.table(
    await legacy`select is_sub, type, count(*)::int from scorecards where game_id in (select id from games where tdf_key is null) group by 1, 2 order by 3 desc`,
  );
  console.log("games.winner and eliminations:");
  console.table(
    await legacy`
      select winner, red_eliminated, green_eliminated, count(*)::int
      from games where tdf_key is null group by 1, 2, 3 order by 4 desc`,
  );
  console.log("Durations (units unknown — compare against a 15 minute game):");
  console.table(
    await legacy`
      select min(game_length)::int as len_min, max(game_length)::int as len_max,
             round(avg(game_length))::int as len_avg, count(game_length)::int as len_n,
             min(duration)::int as dur_min, max(duration)::int as dur_max,
             round(avg(duration))::int as dur_avg, count(duration)::int as dur_n
      from games where tdf_key is null`,
  );
  console.log("Players per game:");
  console.table(
    await legacy`
      select n::int as players, count(*)::int as games from (
        select game_id, count(*) as n from scorecards where game_id in (select id from games where tdf_key is null) group by 1) t
      group by 1 order by 1`,
  );
  console.log("Non-null optional scorecard columns (are any TDF-only fields populated?):");
  console.table(
    await legacy`
      select count(*)::int as scorecards,
             count(max_score)::int as max_score, count(uptime)::int as uptime,
             count(mvp_details)::int as mvp_details, count(battlesuit)::int as battlesuit,
             count(team_id)::int as game_team_id,
             count(*) filter (where times_team_missiled <> 0)::int as times_team_missiled_nonzero,
             count(*) filter (where shots_fired_during_rapid <> 0)::int as rapid_shots_nonzero
      from scorecards where game_id in (select id from games where tdf_key is null)`,
  );
  console.log("Sample mvp_details (one per position):");
  for (const r of await legacy<{ position: string; mvp_points: number; mvp_details: unknown }[]>`
    select distinct on (position) position, mvp_points::float8, mvp_details
    from scorecards where game_id in (select id from games where tdf_key is null)
    order by position, id desc`) {
    console.log(`${r.position} (${r.mvp_points}): ${JSON.stringify(r.mvp_details)}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Score basis
// ---------------------------------------------------------------------------

/**
 * Modern stores penalty-free scores and adds `penalty_score` on top. The legacy TDF-era
 * convention was a deduction-free score with escalations in `adj`. Check whether PDF
 * scorecards follow it: do the scorecards sum to the side score, and does `adj` equal
 * the penalties recorded against that side?
 */
async function scoreBasis(legacy: Legacy): Promise<void> {
  heading("7. Score basis");
  const rows = await legacy<
    {
      side: string;
      games: number;
      sum_matches: number;
      sum_diff_avg: number;
      adj_nonzero: number;
      adj_matches_pen: number;
    }[]
  >`
    with sides as (
      select g.id, 'red' as side, g.red_score as score, g.red_adj as adj from games g where g.tdf_key is null
      union all
      select g.id, 'green', g.green_score, g.green_adj from games g where g.tdf_key is null
    ),
    sc as (
      select s.game_id, lower(s.team) as team, sum(s.score) as score
      from scorecards s where s.game_id in (select id from games where tdf_key is null) group by 1, 2
    ),
    pen as (
      select s.game_id, lower(s.team) as team, sum(p.value) filter (where p.rescinded = 0) as value
      from penalties p join scorecards s on s.id = p.scorecard_id
      where s.game_id in (select id from games where tdf_key is null) group by 1, 2
    ),
    tpen as (
      select game_id, lower(team_color) as team, sum(value) as value
      from team_penalties where game_id in (select id from games where tdf_key is null) group by 1, 2
    )
    select sides.side, count(*)::int as games,
           count(*) filter (where sc.score = sides.score)::int as sum_matches,
           round(avg(sc.score - sides.score))::int as sum_diff_avg,
           count(*) filter (where sides.adj <> 0)::int as adj_nonzero,
           count(*) filter (where sides.adj <> 0
                              and sides.adj = coalesce(pen.value, 0) + coalesce(tpen.value, 0))::int
             as adj_matches_pen
    from sides
    left join sc on sc.game_id = sides.id and sc.team like sides.side || '%'
    left join pen on pen.game_id = sides.id and pen.team like sides.side || '%'
    left join tpen on tpen.game_id = sides.id and tpen.team like sides.side || '%'
    group by 1`;
  console.log(
    "sum_matches: Σ scorecard.score = side score. adj_matches_pen: adj = non-rescinded player + team penalties.",
  );
  console.log("If team names are not red*/green* (see section 6) the joins here undercount.");
  console.table(rows);

  // What is in adj besides penalties? Bucket the residual by whether this side eliminated
  // the other, to see whether it is an elimination bonus.
  console.log("adj − (player + team penalties), by whether the opponent was eliminated:");
  console.table(
    await legacy`
      with sides as (
        select g.id, 'red' as side, g.red_adj as adj, g.green_eliminated = 1 as elim_opp
        from games g where g.tdf_key is null
        union all
        select g.id, 'green', g.green_adj, g.red_eliminated = 1 from games g where g.tdf_key is null
      ),
      pen as (
        select s.game_id, lower(s.team) as team, sum(p.value) filter (where p.rescinded = 0) as value
        from penalties p join scorecards s on s.id = p.scorecard_id
        where s.game_id in (select id from games where tdf_key is null) group by 1, 2
      ),
      tpen as (
        select game_id, lower(team_color) as team, sum(value) as value
        from team_penalties where game_id in (select id from games where tdf_key is null) group by 1, 2
      )
      select sides.elim_opp,
             (sides.adj - coalesce(pen.value, 0) - coalesce(tpen.value, 0))::int as residual,
             count(*)::int as sides
      from sides
      left join pen on pen.game_id = sides.id and pen.team = sides.side
      left join tpen on tpen.game_id = sides.id and tpen.team = sides.side
      group by 1, 2 order by 3 desc limit 20`,
  );
}

// ---------------------------------------------------------------------------
// 8. Child rows
// ---------------------------------------------------------------------------

async function childRows(legacy: Legacy): Promise<void> {
  heading("8. Child rows");

  console.table(
    await legacy`
      select
        (select count(*)::int from scorecards where game_id in (select id from games where tdf_key is null)) as scorecards,
        (select count(*)::int from hits h join scorecards s on s.id = h.scorecard_id
           where s.game_id in (select id from games where tdf_key is null)) as hits,
        (select count(*)::int from penalties p join scorecards s on s.id = p.scorecard_id
           where s.game_id in (select id from games where tdf_key is null)) as penalties,
        (select count(*)::int from team_penalties where game_id in (select id from games where tdf_key is null)) as team_penalties,
        (select count(*)::int from match_penalties
           where team_id in (select red_team_id from games where tdf_key is null
                             union select green_team_id from games where tdf_key is null)) as match_penalties`,
  );

  console.log("Hits whose target has no scorecard in the same game, or has several:");
  console.table(
    await legacy`
      select count(*) filter (where n = 0)::int as no_target_scorecard,
             count(*) filter (where n > 1)::int as ambiguous_target,
             count(*) filter (where shooter_mismatch)::int as shooter_not_scorecard_player
      from (
        select h.id,
               (select count(*) from scorecards t
                  where t.game_id = s.game_id and t.player_id = h.target_id) as n,
               h.player_id <> s.player_id as shooter_mismatch
        from hits h join scorecards s on s.id = h.scorecard_id
        where s.game_id in (select id from games where tdf_key is null)) t`,
  );

  console.log("Sample hits with no target scorecard in the game:");
  console.table(
    await legacy`
      select s.game_id::int, h.player_id::int as shooter, h.target_id::int as target,
             h.hits::int, h.missiles::int,
             (select count(*)::int from scorecards t where t.game_id = s.game_id) as game_scorecards,
             (select string_agg(distinct t.player_name, ', ') from scorecards t
                where t.player_id = h.target_id) as target_names_anywhere,
             (select count(*)::int from scorecards t where t.player_id = h.target_id) as target_scorecards_anywhere
      from hits h join scorecards s on s.id = h.scorecard_id
      where s.game_id in (select id from games where tdf_key is null)
        and not exists (select 1 from scorecards t where t.game_id = s.game_id and t.player_id = h.target_id)
      order by s.game_id desc limit 15`,
  );
  console.log("No-target hits: totals and number of games affected:");
  console.table(
    await legacy`
      select count(*)::int as rows, count(distinct s.game_id)::int as games,
             sum(h.hits)::int as hits, sum(h.missiles)::int as missiles,
             count(*) filter (where h.hits = 0 and h.missiles = 0)::int as zero_rows
      from hits h join scorecards s on s.id = h.scorecard_id
      where s.game_id in (select id from games where tdf_key is null)
        and not exists (select 1 from scorecards t where t.game_id = s.game_id and t.player_id = h.target_id)`,
  );

  console.log("Penalty types:");
  console.table(
    await legacy`
      select p.type, count(*)::int, count(*) filter (where p.rescinded = 1)::int as rescinded,
             count(*) filter (where p.in_game = 0)::int as post_game,
             min(p.value)::int as min_value, max(p.value)::int as max_value,
             min(p.mvp_value)::float8 as min_mvp, max(p.mvp_value)::float8 as max_mvp
      from penalties p join scorecards s on s.id = p.scorecard_id
      where s.game_id in (select id from games where tdf_key is null) group by 1 order by 2 desc`,
  );

  console.log("Team penalties by team_color:");
  console.table(
    await legacy`
      select team_color, type, count(*)::int, sum(value)::int as total
      from team_penalties where game_id in (select id from games where tdf_key is null) group by 1, 2 order by 3 desc`,
  );

  console.log("penalty_count vs penalty rows per scorecard (disagreements):");
  console.table(
    await legacy`
      select count(*)::int as scorecards_disagreeing from (
        select s.id, s.penalty_count, count(p.id) as n
        from scorecards s left join penalties p on p.scorecard_id = s.id
        where s.game_id in (select id from games where tdf_key is null) group by 1, 2 having s.penalty_count <> count(p.id)) t`,
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const db = await initDb();
  const legacy = connectLegacy();
  try {
    await population(legacy);
    await centers(legacy, db);
    await timestamps(legacy, db);
    await players(legacy, db);
    await domains(legacy);
    await scoreBasis(legacy);
    await childRows(legacy);
  } finally {
    await legacy.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
