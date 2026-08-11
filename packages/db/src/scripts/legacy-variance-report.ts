// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Enumerates every remaining difference between the legacy `lfstats` database and the
 * migrated competitions in `lfstats_modern`.
 *
 * The migration (`migrate-legacy-competition.ts`) plus the penalty back-fill
 * (`migrate-legacy-penalties.ts`) do not reproduce the legacy standings exactly, and
 * they are not meant to — the two systems score games differently. This script says
 * *precisely* where they part company, so the residue can be audited rather than
 * assumed:
 *
 *   1. team-seasons whose points differ, and whether the finishing order moved
 *   2. the matches behind each of those point deltas
 *   3. every team-game score disagreement, decomposed against penalty deductions
 *
 * Read-only against both databases.
 *
 * Usage:
 *   pnpm --filter @lfstats/db legacy-variance                 # sections 1-3
 *   pnpm --filter @lfstats/db legacy-variance --scores-only   # section 3 only
 *   pnpm --filter @lfstats/db legacy-variance --all           # itemize every disagreement
 */

import postgres from "postgres";
import { and, eq, inArray, sql } from "drizzle-orm";
import { initDb } from "../client";
import { slugify } from "../lib/slug";
import {
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  sm5GamePenalty,
  sm5GameTeam,
} from "../schema";
import { getCompetitionBySlug } from "../queries/admin";
import { getCompetitionStandings } from "../queries/competition-tournament";
import { ALREADY_MIGRATED, LEGACY_EVENTS } from "./legacy-events";

type Legacy = ReturnType<typeof postgres>;

function connectLegacy(): Legacy {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) throw new Error("Missing env var: LEGACY_DATABASE_URL");
  return postgres(url, {
    max: 2,
    idle_timeout: 20,
    connection: { options: "-c default_transaction_read_only=on" },
  });
}

// ---------------------------------------------------------------------------
// Legacy side
// ---------------------------------------------------------------------------

type LegacyTeamPoints = {
  teamId: number;
  name: string;
  points: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  scoreFor: number;
  scoreAgainst: number;
};

type LegacyMatchRow = {
  matchId: number;
  roundId: number;
  roundNumber: number | null;
  isFinals: number;
  multiplier: number;
  matchNumber: number;
  team1Id: number | null;
  team2Id: number | null;
  team1Points: number;
  team2Points: number;
};

type LegacyGameRow = {
  gameId: number;
  fn: string;
  matchId: number | null;
  leagueGame: number | null;
  redTeamId: number | null;
  greenTeamId: number | null;
  redTotal: number;
  greenTotal: number;
};

/**
 * Legacy standings, computed the way the legacy site did: the sum of
 * `matches.team_N_points` over non-finals rounds.
 *
 * `rounds.multiplier` is deliberately NOT applied here — legacy stored the already
 * weighted award in `team_N_points` (Nerd Sturgis round 4 has a 72-point pool over the
 * same 6 matches that give 36 in rounds 1-3). Multiplying again would double-count it.
 *
 * `event_teams.points` is a dead column — it is 0 for every team in the database — so
 * the match rows are the only stored record of what legacy showed.
 */
function legacyStandings(
  teams: { id: number; name: string }[],
  matches: LegacyMatchRow[],
  games: LegacyGameRow[],
): LegacyTeamPoints[] {
  const byId = new Map<number, LegacyTeamPoints>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        name: t.name,
        points: 0,
        gameWins: 0,
        gameLosses: 0,
        gameDraws: 0,
        matchWins: 0,
        matchLosses: 0,
        matchDraws: 0,
        scoreFor: 0,
        scoreAgainst: 0,
      },
    ]),
  );

  const poolMatches = matches.filter((m) => m.isFinals !== 1);
  const poolMatchIds = new Set(poolMatches.map((m) => m.matchId));

  for (const m of poolMatches) {
    if (m.team1Id !== null) {
      const t = byId.get(m.team1Id);
      if (t) t.points += m.team1Points;
    }
    if (m.team2Id !== null) {
      const t = byId.get(m.team2Id);
      if (t) t.points += m.team2Points;
    }
  }

  // Game-level record and score totals come from the games themselves.
  const gamesByMatch = new Map<number, LegacyGameRow[]>();
  for (const g of games) {
    if (g.matchId === null || !poolMatchIds.has(g.matchId)) continue;
    const list = gamesByMatch.get(g.matchId) ?? [];
    list.push(g);
    gamesByMatch.set(g.matchId, list);
  }

  for (const [matchId, list] of gamesByMatch) {
    const m = poolMatches.find((x) => x.matchId === matchId)!;
    if (m.team1Id === null || m.team2Id === null) continue;
    const t1 = byId.get(m.team1Id);
    const t2 = byId.get(m.team2Id);
    if (!t1 || !t2) continue;

    let s1 = 0;
    let s2 = 0;
    for (const g of list) {
      // red/green here are legacy's side discriminators, not colours.
      const forT1 = g.redTeamId === m.team1Id ? g.redTotal : g.greenTotal;
      const forT2 = g.redTeamId === m.team1Id ? g.greenTotal : g.redTotal;
      s1 += forT1;
      s2 += forT2;
      t1.scoreFor += forT1;
      t1.scoreAgainst += forT2;
      t2.scoreFor += forT2;
      t2.scoreAgainst += forT1;
      if (forT1 > forT2) {
        t1.gameWins++;
        t2.gameLosses++;
      } else if (forT2 > forT1) {
        t2.gameWins++;
        t1.gameLosses++;
      } else {
        t1.gameDraws++;
        t2.gameDraws++;
      }
    }
    if (list.length >= 2) {
      if (s1 > s2) {
        t1.matchWins++;
        t2.matchLosses++;
      } else if (s2 > s1) {
        t2.matchWins++;
        t1.matchLosses++;
      } else {
        t1.matchDraws++;
        t2.matchDraws++;
      }
    }
  }

  return [...byId.values()];
}

async function fetchLegacyEvent(legacy: Legacy, legacyId: number) {
  const teams = (await legacy`
    select id::int, name from event_teams where event_id = ${legacyId} order by id
  `) as unknown as { id: number; name: string }[];

  const matches = (await legacy`
    select m.id::int as "matchId", m.round_id::int as "roundId",
           r.round::int as "roundNumber", r.is_finals::int as "isFinals",
           r.multiplier::int as multiplier, m.match::int as "matchNumber",
           m.team_1_id::int as "team1Id", m.team_2_id::int as "team2Id",
           coalesce(m.team_1_points,0)::int as "team1Points",
           coalesce(m.team_2_points,0)::int as "team2Points"
    from matches m join rounds r on r.id = m.round_id
    where r.event_id = ${legacyId}
    order by r.is_finals, r.round nulls last, r.id, m.match
  `) as unknown as LegacyMatchRow[];

  const games = (await legacy`
    select g.id::int as "gameId", replace(g.tdf_key,'_','-') as fn,
           g.match_id::int as "matchId", g.league_game::int as "leagueGame",
           g.red_team_id::int as "redTeamId", g.green_team_id::int as "greenTeamId",
           (g.red_score + g.red_adj)::int as "redTotal",
           (g.green_score + g.green_adj)::int as "greenTotal"
    from games g
    where g.event_id = ${legacyId} and g.tdf_key is not null
    order by g.game_datetime
  `) as unknown as LegacyGameRow[];

  // Which legacy event team played which TDF team index in each game. `color_normal` is
  // legacy's side discriminator, never a colour claim — see the migration script.
  const sides = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           (case when gt.color_normal='red' then g.red_team_id else g.green_team_id end)::int
             as "eventTeamId"
    from games g join game_teams gt on gt.game_id = g.id
    where g.event_id = ${legacyId} and g.tdf_key is not null
      and gt.neutral_team is not true and coalesce(gt.color_normal,'') <> ''
  `) as unknown as { fn: string; idx: number; eventTeamId: number | null }[];

  return { teams, matches, games, sides };
}

// ---------------------------------------------------------------------------
// Section 1 + 2: standings and the matches behind them
// ---------------------------------------------------------------------------

type ModernGameRow = {
  fn: string;
  matchNumber: number;
  roundNumber: number;
  roundType: string;
  gameNumber: number;
  team1Name: string | null;
  team2Name: string | null;
  team1Idx: number;
  team2Idx: number;
  team1Score: number;
  team2Score: number;
};

async function modernMatchGames(
  db: Awaited<ReturnType<typeof initDb>>,
  competitionId: string,
): Promise<ModernGameRow[]> {
  return (await db
    .select({
      fn: game.tdfFilename,
      matchNumber: competitionMatch.matchNumber,
      roundNumber: competitionRound.roundNumber,
      roundType: competitionRound.type,
      gameNumber: competitionMatchGame.gameNumber,
      team1Name: sql<string | null>`ct1.name`,
      team2Name: sql<string | null>`ct2.name`,
      team1Idx: sql<number>`t1.tdf_team_index`,
      team2Idx: sql<number>`t2.tdf_team_index`,
      team1Score: sql<number>`(t1.score + t1.elimination_bonus + coalesce(t1.penalty_score,0))::int`,
      team2Score: sql<number>`(t2.score + t2.elimination_bonus + coalesce(t2.penalty_score,0))::int`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .leftJoin(sql`competition_team ct1`, sql`ct1.id = ${competitionMatch.team1Id}`)
    .leftJoin(sql`competition_team ct2`, sql`ct2.id = ${competitionMatch.team2Id}`)
    .where(eq(competitionMatch.competitionId, competitionId))) as ModernGameRow[];
}

/**
 * Maps legacy `event_teams.id` to modern `competition_team.name`.
 *
 * Names are useless as a join key here — the five hand-built competitions were named
 * independently of legacy ("BrisBOOM (Rusty's)" on one side, something else on the
 * other). The TDF team index is not: both databases read it from the same file. Every
 * game the two teams share casts a vote, and the majority wins, so a single mis-sided
 * game cannot flip the mapping.
 */
function mapTeams(
  sides: { fn: string; idx: number; eventTeamId: number | null }[],
  modern: ModernGameRow[],
): Map<number, string> {
  const votes = new Map<number, Map<string, number>>();
  const cast = (legacyTeamId: number | null | undefined, modernName: string | null) => {
    if (legacyTeamId === null || legacyTeamId === undefined || !modernName) return;
    const m = votes.get(legacyTeamId) ?? new Map<string, number>();
    m.set(modernName.trim(), (m.get(modernName.trim()) ?? 0) + 1);
    votes.set(legacyTeamId, m);
  };

  const legacyByKey = new Map(sides.map((s) => [`${s.fn}:${s.idx}`, s.eventTeamId]));
  for (const g of modern) {
    cast(legacyByKey.get(`${g.fn}:${g.team1Idx}`), g.team1Name);
    cast(legacyByKey.get(`${g.fn}:${g.team2Idx}`), g.team2Name);
  }

  const out = new Map<number, string>();
  for (const [legacyTeamId, tally] of votes) {
    const best = [...tally].sort((a, b) => b[1] - a[1])[0];
    if (best) out.set(legacyTeamId, best[0]);
  }
  return out;
}

function rankOf<T>(rows: T[], key: (r: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  const ranks = new Map<T, number>();
  sorted.forEach((r, i) => ranks.set(r, i + 1));
  return ranks;
}

// ---------------------------------------------------------------------------
// Section 3: every team-game score disagreement
// ---------------------------------------------------------------------------

/**
 * Where a team-game total parts company between the two databases.
 *
 * A legacy total is `score + adj`, with `adj` lumping the elimination bonus together
 * with every manual score award. Modern keeps three columns: `score`,
 * `elimination_bonus` and `penalty_score` — and a penalty deduction lands in either the
 * first or the last of those depending on whether it came off the TDF score or was
 * applied afterwards, so only the *total* is comparable.
 *
 * A penalty is scored twice over, and the two databases take different views of each:
 *
 *   in-game     the arena deducts line 1 `penalty` on every 0600 event. That setting is
 *               per game — center 4-19 runs -1000 normally but was set to 0 for the
 *               Internationals 2024 files. Modern counts it; legacy stored a
 *               deduction-free score and did not.
 *   escalation  referees meet after the game and decide which penalties are escalated,
 *               normally to -1000 score and -5 MVP. That decision lives only in legacy
 *               `penalties.value`, and only the back-fill can carry it across.
 *
 * So the delta runs both ways: modern lower where it counts an in-game deduction legacy
 * dropped, modern higher where legacy holds an escalation modern has not received. Both
 * are worth 1000 a time, so every delta is tested against `1000 x k + e`, `e` being
 * either nothing or the whole 10000 elimination bonus that legacy left out of `adj` on
 * some games. `k` has to be covered by penalties actually on record on the side that
 * charged more. Note that `score_value` cannot be summed instead: where the arena
 * deducted in-game on a pre-2.003 TDF the amount is baked into the line 5 score stream
 * and the row's own `score_value` is 0. The sums are still printed for the residue rows,
 * where they are worth reading.
 *
 * Penalties were also used to correct scores after pack malfunctions, which is why a few
 * legacy values are not multiples of 1000. Those cases usually came with a hand edit to
 * the player's scorecard as well, which the TDF knows nothing about — see the residue.
 */
type DeltaCause =
  | "arena-deduction" // modern counts the arena's in-game deduction, legacy did not
  | "escalation-missing" // legacy holds a referee escalation modern has not received
  | "elim-bonus" // legacy left the 10000 elimination bonus out of `adj`
  | "review"; // residue no penalty or bonus bookkeeping accounts for

type ScoreVariance = {
  fn: string;
  idx: number;
  competition: string;
  legacyScore: number;
  legacyAdj: number;
  modernScore: number;
  modernElim: number;
  modernPen: number;
  legacyTotal: number;
  modernTotal: number;
  delta: number;
  /** Sum of `score_value` on each side's own penalty rows — evidence, not the model. */
  legacyCharge: number;
  modernCharge: number;
  /** Penalties on record, either side, non-rescinded and rescinded. */
  legacyLive: number;
  legacyRescinded: number;
  live: number;
  rescinded: number;
  /** How many 1000-point deductions the delta implies, when it implies a whole number. */
  impliedPenalties: number | null;
  causes: DeltaCause[];
};

/**
 * Tries to write `delta` as `1000 x k + e`, with `e` either 0 or the full elimination
 * bonus and `k` covered by penalties on record on whichever side charged more. Returns
 * the causes that explains, or `["review"]` when nothing does.
 */
function explainDelta(
  delta: number,
  penalties: { legacyLive: number; legacyResc: number; modernLive: number; modernResc: number },
  modernElim: number,
): { causes: DeltaCause[]; k: number | null } {
  const legacyOnRecord = penalties.legacyLive + penalties.legacyResc;
  const modernOnRecord = penalties.modernLive + penalties.modernResc;

  for (const e of modernElim > 0 ? [0, modernElim] : [0]) {
    const remainder = delta - e;
    if (remainder % 1000 !== 0) continue;
    const k = remainder / 1000;
    const causes: DeltaCause[] = [];
    if (k < 0) {
      if (-k > modernOnRecord) continue;
      causes.push("arena-deduction");
    } else if (k > 0) {
      if (k > legacyOnRecord) continue;
      causes.push("escalation-missing");
    }
    if (e > 0) causes.push("elim-bonus");
    if (causes.length > 0) return { causes, k };
  }
  return { causes: ["review"], k: null };
}

async function scoreVariances(
  db: Awaited<ReturnType<typeof initDb>>,
  legacy: Legacy,
): Promise<ScoreVariance[]> {
  const legacyRows = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx, e.name as event,
           (case when gt.color_normal='red' then g.red_score else g.green_score end)::int as score,
           (case when gt.color_normal='red' then g.red_adj   else g.green_adj   end)::int as adj
    from games g
     join events e on e.id = g.event_id
     join game_teams gt on gt.game_id = g.id
    where e.is_comp and g.tdf_key is not null
      and gt.neutral_team is not true and coalesce(gt.color_normal,'') <> ''
  `) as unknown as { fn: string; idx: number; event: string; score: number; adj: number }[];

  const filenames = [...new Set(legacyRows.map((r) => r.fn))];

  const modernRows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      score: sql<number>`coalesce(${sm5GameTeam.score},0)::int`,
      elim: sql<number>`coalesce(${sm5GameTeam.eliminationBonus},0)::int`,
      pen: sql<number>`coalesce(${sm5GameTeam.penaltyScore},0)::int`,
    })
    .from(sm5GameTeam)
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .where(and(inArray(game.tdfFilename, filenames), eq(sm5GameTeam.isNeutral, false)));
  const modernByKey = new Map(modernRows.map((r) => [`${r.fn}:${r.idx}`, r]));

  // Modern penalty counts and the deduction modern says it charged.
  const penRows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      total: sql<number>`count(*)::int`,
      rescinded: sql<number>`count(*) filter (where ${sm5GamePenalty.rescinded})::int`,
      charge: sql<number>`coalesce(sum(${sm5GamePenalty.scoreValue}) filter (where not ${sm5GamePenalty.rescinded}),0)::int`,
    })
    .from(sm5GamePenalty)
    .innerJoin(sql`sm5_scorecard sc`, sql`sc.id = ${sm5GamePenalty.scorecardId}`)
    .innerJoin(sm5GameTeam, sql`${sm5GameTeam.id} = sc.team_id`)
    .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
    .where(inArray(game.tdfFilename, filenames))
    .groupBy(game.tdfFilename, sm5GameTeam.tdfTeamIndex);
  const penByKey = new Map(penRows.map((r) => [`${r.fn}:${r.idx}`, r]));

  // Team penalties, which carry no player attribution, on both sides.
  const teamPenRows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      charge: sql<number>`coalesce(sum(tp.score_value) filter (where not tp.rescinded),0)::int`,
    })
    .from(sql`sm5_game_team_penalty tp`)
    .innerJoin(sm5GameTeam, sql`${sm5GameTeam.id} = tp.game_team_id`)
    .innerJoin(game, sql`${game.id} = tp.game_id`)
    .where(inArray(game.tdfFilename, filenames))
    .groupBy(game.tdfFilename, sm5GameTeam.tdfTeamIndex);
  for (const r of teamPenRows) {
    const key = `${r.fn}:${r.idx}`;
    const existing = penByKey.get(key);
    if (existing) existing.charge += r.charge;
    else penByKey.set(key, { fn: r.fn, idx: r.idx, total: 0, rescinded: 0, charge: r.charge });
  }

  // Legacy's own penalty ledger, player and team rows alike. `scorecards.team_index` is
  // 0 on every row and means nothing — the side comes from `team_id` -> `game_teams`.
  const legacyPenRows = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           count(*) filter (where coalesce(p.rescinded,0) = 0)::int as live,
           count(*) filter (where coalesce(p.rescinded,0) <> 0)::int as rescinded,
           coalesce(sum(p.value) filter (where coalesce(p.rescinded,0) = 0),0)::int as charge
    from penalties p
     join scorecards s on s.id = p.scorecard_id
     join game_teams gt on gt.id = s.team_id
     join games g on g.id = s.game_id
     join events e on e.id = g.event_id
    where e.is_comp and g.tdf_key is not null
    group by 1,2
    union all
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           count(*)::int as live, 0 as rescinded, coalesce(sum(tp.value),0)::int as charge
    from team_penalties tp
     join games g on g.id = tp.game_id
     join events e on e.id = g.event_id
     join game_teams gt on gt.game_id = g.id and gt.color_normal = tp.team_color
    where e.is_comp and g.tdf_key is not null
    group by 1,2
  `) as unknown as { fn: string; idx: number; live: number; rescinded: number; charge: number }[];
  const legacyPenByKey = new Map<string, { live: number; rescinded: number; charge: number }>();
  for (const r of legacyPenRows) {
    const key = `${r.fn}:${r.idx}`;
    const acc = legacyPenByKey.get(key) ?? { live: 0, rescinded: 0, charge: 0 };
    acc.live += r.live;
    acc.rescinded += r.rescinded;
    acc.charge += r.charge;
    legacyPenByKey.set(key, acc);
  }

  const out: ScoreVariance[] = [];
  for (const l of legacyRows) {
    const key = `${l.fn}:${l.idx}`;
    const m = modernByKey.get(key);
    if (!m) continue;
    const legacyTotal = l.score + l.adj;
    const modernTotal = m.score + m.elim + m.pen;
    if (legacyTotal === modernTotal) continue;

    const pen = penByKey.get(key);
    const live = (pen?.total ?? 0) - (pen?.rescinded ?? 0);
    const lpen = legacyPenByKey.get(key) ?? { live: 0, rescinded: 0, charge: 0 };

    const { causes, k } = explainDelta(
      modernTotal - legacyTotal,
      {
        legacyLive: lpen.live,
        legacyResc: lpen.rescinded,
        modernLive: live,
        modernResc: pen?.rescinded ?? 0,
      },
      m.elim,
    );

    out.push({
      fn: l.fn,
      idx: l.idx,
      competition: l.event,
      legacyScore: l.score,
      legacyAdj: l.adj,
      modernScore: m.score,
      modernElim: m.elim,
      modernPen: m.pen,
      legacyTotal,
      modernTotal,
      delta: modernTotal - legacyTotal,
      legacyCharge: lpen.charge,
      modernCharge: pen?.charge ?? 0,
      legacyLive: lpen.live,
      legacyRescinded: lpen.rescinded,
      live,
      rescinded: pen?.rescinded ?? 0,
      impliedPenalties: k,
      causes,
    });
  }
  return out.sort((a, b) => a.competition.localeCompare(b.competition) || a.fn.localeCompare(b.fn));
}

/** One penalty as either database records it, for the side-by-side residue dump. */
type LedgerRow = {
  side: "legacy" | "modern";
  callsign: string;
  type: string;
  scoreValue: number;
  mvpValue: number;
  inGame: boolean;
  rescinded: boolean;
  time: number | null;
};

/**
 * Both databases' penalty rows for the given team-games, so a residue row can be read
 * without going back to SQL. Keyed `filename:index`.
 */
async function penaltyLedger(
  db: Awaited<ReturnType<typeof initDb>>,
  legacy: Legacy,
  keys: { fn: string; idx: number }[],
): Promise<Map<string, LedgerRow[]>> {
  const out = new Map<string, LedgerRow[]>();
  if (keys.length === 0) return out;
  const wanted = new Set(keys.map((k) => `${k.fn}:${k.idx}`));
  const filenames = [...new Set(keys.map((k) => k.fn))];

  const push = (fn: string, idx: number, row: LedgerRow) => {
    const key = `${fn}:${idx}`;
    if (!wanted.has(key)) return;
    const list = out.get(key) ?? [];
    list.push(row);
    out.set(key, list);
  };

  const legacyRows = (await legacy`
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           s.player_name as callsign, p.type, p.value::int as score_value,
           p.mvp_value::float8 as mvp_value, p.in_game::int as in_game,
           p.rescinded::int as rescinded
    from penalties p
     join scorecards s on s.id = p.scorecard_id
     join game_teams gt on gt.id = s.team_id
     join games g on g.id = s.game_id
    where replace(g.tdf_key,'_','-') = any(${filenames})
    union all
    select replace(g.tdf_key,'_','-') as fn, gt.index::int as idx,
           '(team)' as callsign, coalesce(tp.type,'?') as type, tp.value::int as score_value,
           0::float8 as mvp_value, 1 as in_game, 0 as rescinded
    from team_penalties tp
     join games g on g.id = tp.game_id
     join game_teams gt on gt.game_id = g.id and gt.color_normal = tp.team_color
    where replace(g.tdf_key,'_','-') = any(${filenames})
  `) as unknown as {
    fn: string;
    idx: number;
    callsign: string;
    type: string;
    score_value: number;
    mvp_value: number;
    in_game: number;
    rescinded: number;
  }[];
  for (const r of legacyRows) {
    push(r.fn, r.idx, {
      side: "legacy",
      callsign: r.callsign,
      type: r.type,
      scoreValue: r.score_value,
      mvpValue: r.mvp_value,
      inGame: r.in_game === 1,
      rescinded: r.rescinded !== 0,
      time: null,
    });
  }

  const modernRows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      callsign: sql<string>`coalesce(sc.callsign, '?')`,
      type: sm5GamePenalty.type,
      scoreValue: sm5GamePenalty.scoreValue,
      mvpValue: sm5GamePenalty.mvpValue,
      inGame: sm5GamePenalty.inGame,
      rescinded: sm5GamePenalty.rescinded,
      time: sm5GamePenalty.time,
    })
    .from(sm5GamePenalty)
    .innerJoin(sql`sm5_scorecard sc`, sql`sc.id = ${sm5GamePenalty.scorecardId}`)
    .innerJoin(sm5GameTeam, sql`${sm5GameTeam.id} = sc.team_id`)
    .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
    .where(inArray(game.tdfFilename, filenames));
  for (const r of modernRows) {
    push(r.fn, r.idx, { ...r, side: "modern" });
  }

  const modernTeamRows = await db
    .select({
      fn: game.tdfFilename,
      idx: sm5GameTeam.tdfTeamIndex,
      type: sql<string>`tp.type`,
      scoreValue: sql<number>`tp.score_value::int`,
      inGame: sql<boolean>`tp.in_game`,
      rescinded: sql<boolean>`tp.rescinded`,
      time: sql<number | null>`tp.time`,
    })
    .from(sql`sm5_game_team_penalty tp`)
    .innerJoin(sm5GameTeam, sql`${sm5GameTeam.id} = tp.game_team_id`)
    .innerJoin(game, sql`${game.id} = tp.game_id`)
    .where(inArray(game.tdfFilename, filenames));
  for (const r of modernTeamRows) {
    push(r.fn, r.idx, { ...r, side: "modern", callsign: "(team)", mvpValue: 0 });
  }

  for (const list of out.values()) {
    list.sort((a, b) => a.side.localeCompare(b.side) || a.callsign.localeCompare(b.callsign));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function pad(s: string | number, n: number): string {
  return String(s).padEnd(n);
}
function lpad(s: string | number, n: number): string {
  return String(s).padStart(n);
}

async function main() {
  const args = process.argv.slice(2);
  const scoresOnly = args.includes("--scores-only");
  const listAll = args.includes("--all");

  const legacy = connectLegacy();
  const db = await initDb();

  try {
    const targets: { legacyId: number; slug: string; label: string }[] = [
      ...LEGACY_EVENTS.filter((e) => e.kind === "team").map((e) => ({
        legacyId: e.legacyId,
        slug: slugify(e.name ?? e.legacyName),
        label: e.name ?? e.legacyName,
      })),
      ...Object.entries(ALREADY_MIGRATED).map(([id, slug]) => ({
        legacyId: Number(id),
        slug,
        label: `${slug} (built by hand)`,
      })),
    ];

    if (!scoresOnly) {
      console.log(`\n${"=".repeat(96)}`);
      console.log(`SECTION 1 — TEAM-SEASON STANDINGS VARIANCE`);
      console.log("=".repeat(96));

      const summary: string[] = [];
      const details: string[] = [];
      let totalTeams = 0;
      let totalDiff = 0;

      for (const t of targets) {
        const comp = await getCompetitionBySlug(t.slug);
        if (!comp) {
          summary.push(`  ${pad(t.label, 40)} SKIPPED — no modern competition "${t.slug}"`);
          continue;
        }
        const { teams, matches, games, sides } = await fetchLegacyEvent(legacy, t.legacyId);
        if (teams.length === 0) {
          summary.push(`  ${pad(t.label, 40)} SKIPPED — no legacy teams`);
          continue;
        }

        const lStand = legacyStandings(teams, matches, games);
        const mStand = await getCompetitionStandings(comp.id);
        const mGames = await modernMatchGames(db, comp.id);

        // Map legacy event team -> modern competition team through the TDF team index,
        // which both databases derive from the same file. Names cannot be used: the
        // hand-built competitions were named independently of legacy.
        const teamMap = mapTeams(sides, mGames);
        if (teamMap.size === 0) {
          // A legacy event that was set up but never played: placeholder teams, no
          // games. Nothing to compare against.
          summary.push(
            `  ${pad(t.label, 40)} SKIPPED — legacy event has no games (${teams.length} placeholder teams)`,
          );
          continue;
        }

        const mByLegacyId = new Map(
          [...teamMap].flatMap(([lid, mname]) => {
            const row = mStand.find((r) => r.teamName.trim() === mname);
            return row ? ([[lid, row]] as [number, (typeof mStand)[number]][]) : [];
          }),
        );
        const lRank = rankOf(lStand, (r) => r.points);
        const mRank = new Map(mStand.map((r, i) => [r.teamName.trim(), i + 1]));

        const rows: string[] = [];
        let differing = 0;
        let orderMoved = false;
        for (const l of lStand.sort((a, b) => b.points - a.points)) {
          totalTeams++;
          const m = mByLegacyId.get(l.teamId);
          if (!m) {
            differing++;
            rows.push(
              `    ${pad(l.name.slice(0, 34), 36)} legacy=${lpad(l.points, 3)}  NO MODERN TEAM COULD BE MAPPED`,
            );
            continue;
          }
          const dp = m.matchPoints - l.points;
          const lr = lRank.get(l)!;
          const mr = mRank.get(m.teamName.trim())!;
          if (lr !== mr) orderMoved = true;
          if (dp === 0 && lr === mr) continue;
          differing++;
          totalDiff++;
          const gw = `${l.gameWins}-${l.gameLosses}-${l.gameDraws}`;
          const mgw = `${m.gameWins}-${m.gameLosses}-${m.gameDraws}`;
          const mw = `${l.matchWins}-${l.matchLosses}-${l.matchDraws}`;
          const mmw = `${m.matchWins}-${m.matchLosses}-${m.matchDraws}`;
          const label = m.teamName.trim() === l.name.trim() ? l.name : `${l.name} = ${m.teamName}`;
          rows.push(
            `    ${pad(label.slice(0, 44), 46)} pts ${lpad(l.points, 3)} -> ${lpad(m.matchPoints, 3)} (${dp > 0 ? "+" : ""}${dp})` +
              `  games ${pad(gw, 9)} -> ${pad(mgw, 9)}  match ${pad(mw, 8)} -> ${pad(mmw, 8)}` +
              `  rank ${lr} -> ${mr}${lr !== mr ? "  <-- MOVED" : ""}`,
          );
        }

        summary.push(
          `  ${pad(t.label, 40)} ${lpad(lStand.length, 2)} teams, ${lpad(differing, 2)} differ` +
            `${orderMoved ? "   ORDER CHANGED" : ""}`,
        );

        if (rows.length > 0) {
          details.push(`\n  ${t.label}  [${t.slug}]`);
          details.push(...rows);
          // The matches behind the deltas.
          const mByKey = new Map(mGames.map((g) => [g.fn, g]));
          const sideIdx = new Map(sides.map((s) => [`${s.fn}:${s.eventTeamId}`, s.idx]));
          const poolMatchIds = new Set(
            matches.filter((mm) => mm.isFinals !== 1).map((mm) => mm.matchId),
          );
          const gamesByMatch = new Map<number, LegacyGameRow[]>();
          for (const g of games) {
            if (g.matchId === null || !poolMatchIds.has(g.matchId)) continue;
            const list = gamesByMatch.get(g.matchId) ?? [];
            list.push(g);
            gamesByMatch.set(g.matchId, list);
          }
          const teamName = new Map(teams.map((x) => [x.id, x.name]));
          const flips: string[] = [];
          for (const [matchId, list] of gamesByMatch) {
            const mm = matches.find((x) => x.matchId === matchId)!;
            if (mm.team1Id === null || mm.team2Id === null) continue;
            let l1 = 0;
            let l2 = 0;
            let n1 = 0;
            let n2 = 0;
            const perGame: string[] = [];
            let anyDiff = false;
            for (const g of list.sort((a, b) => (a.leagueGame ?? 0) - (b.leagueGame ?? 0))) {
              const lFor1 = g.redTeamId === mm.team1Id ? g.redTotal : g.greenTotal;
              const lFor2 = g.redTeamId === mm.team1Id ? g.greenTotal : g.redTotal;
              l1 += lFor1;
              l2 += lFor2;
              const mg = mByKey.get(g.fn);
              if (!mg) {
                perGame.push(`      ${g.fn}  legacy ${lFor1}-${lFor2}  MODERN GAME NOT IN A MATCH`);
                anyDiff = true;
                continue;
              }
              // Orient the modern row against the legacy one by TDF team index — the
              // one identifier both databases read from the same file.
              const idx1 = sideIdx.get(`${g.fn}:${mm.team1Id}`);
              const swap = idx1 !== undefined && mg.team1Idx !== idx1;
              const mFor1 = swap ? mg.team2Score : mg.team1Score;
              const mFor2 = swap ? mg.team1Score : mg.team2Score;
              n1 += mFor1;
              n2 += mFor2;
              const lWin = lFor1 > lFor2 ? 1 : lFor2 > lFor1 ? 2 : 0;
              const mWin = mFor1 > mFor2 ? 1 : mFor2 > mFor1 ? 2 : 0;
              if (lWin !== mWin) {
                anyDiff = true;
                perGame.push(
                  `      GAME FLIP  ${g.fn}  legacy ${lFor1}-${lFor2} (win ${lWin || "draw"})` +
                    `  modern ${mFor1}-${mFor2} (win ${mWin || "draw"})`,
                );
              }
            }
            const lm = l1 > l2 ? 1 : l2 > l1 ? 2 : 0;
            const nm = n1 > n2 ? 1 : n2 > n1 ? 2 : 0;
            if (lm !== nm) {
              anyDiff = true;
              perGame.push(
                `      MATCH FLIP  combined legacy ${l1}-${l2} (win ${lm || "draw"})` +
                  `  modern ${n1}-${n2} (win ${nm || "draw"})`,
              );
            }
            if (list.length < 2) {
              anyDiff = true;
              perGame.push(
                `      SINGLE-GAME MATCH — modern awards no match bonus (legacy points ` +
                  `${mm.team1Points}/${mm.team2Points})`,
              );
            }
            if (anyDiff) {
              flips.push(
                `    R${mm.roundNumber ?? "?"} M${mm.matchNumber}  ` +
                  `${teamName.get(mm.team1Id)} vs ${teamName.get(mm.team2Id)}` +
                  `${mm.multiplier !== 1 ? `   [multiplier x${mm.multiplier} NOT applied in modern]` : ""}`,
              );
              flips.push(...perGame);
            }
          }
          if (flips.length > 0) {
            details.push(`\n    Matches behind the deltas:`);
            details.push(...flips);
          }
        }
      }

      console.log(`\n  ${pad("competition", 40)} teams / differing`);
      for (const s of summary) console.log(s);
      console.log(
        `\n  ${totalDiff} of ${totalTeams} team-seasons differ across ${targets.length} competitions.`,
      );

      console.log(`\n${"=".repeat(96)}`);
      console.log(`SECTION 2 — WHERE EACH VARIANCE COMES FROM`);
      console.log("=".repeat(96));
      for (const d of details) console.log(d);
    }

    // --- section 3 ---------------------------------------------------------
    console.log(`\n${"=".repeat(96)}`);
    console.log(`SECTION 3 — TEAM-GAME SCORE DISAGREEMENTS`);
    console.log("=".repeat(96));
    const sv = await scoreVariances(db, legacy);
    const has = (c: DeltaCause) => sv.filter((v) => v.causes.includes(c));
    const review = has("review");
    const fullyExplained = sv.filter((v) => !v.causes.includes("review"));
    console.log(`  disagreeing team-games : ${sv.length}`);
    console.log(
      `    modern counts the arena's in-game deduction, legacy did not          : ${has("arena-deduction").length}`,
    );
    console.log(
      `    legacy holds a referee escalation modern has not received            : ${has("escalation-missing").length}`,
    );
    console.log(
      `    the 10000 elimination bonus, absent from legacy \`adj\`                : ${has("elim-bonus").length}`,
    );
    console.log(
      `    fully accounted for by the above                                     : ${fullyExplained.length}`,
    );
    console.log(
      `    residue left over — listed in full below                             : ${review.length}`,
    );

    if (review.length > 0) {
      const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));
      console.log(`\n  --- UNEXPLAINED RESIDUE — REVIEW THESE (${review.length}) ---`);
      console.log(
        `    ${pad("competition", 30)} ${pad("tdf", 26)} idx  ` +
          `${lpad("L score", 8)} ${lpad("L adj", 7)} | ${lpad("M score", 8)} ${lpad("M elim", 7)} ${lpad("M pen", 7)} | ` +
          `${lpad("delta", 7)}  penalties (legacy | modern)`,
      );
      for (const v of review) {
        console.log(
          `    ${pad(v.competition.slice(0, 28), 30)} ${pad(v.fn, 26)} ${v.idx}    ` +
            `${lpad(v.legacyScore, 8)} ${lpad(v.legacyAdj, 7)} | ${lpad(v.modernScore, 8)} ` +
            `${lpad(v.modernElim, 7)} ${lpad(v.modernPen, 7)} | ${lpad(sgn(v.delta), 7)}  ` +
            `${v.legacyLive}L/${v.legacyRescinded}R chg ${v.legacyCharge} | ` +
            `${v.live}L/${v.rescinded}R chg ${v.modernCharge}`,
        );
      }

      // The penalty rows behind each residue, both sides, so it can be read from here.
      const ledger = await penaltyLedger(db, legacy, review);
      console.log(`\n  --- RESIDUE PENALTY LEDGERS ---`);
      for (const v of review) {
        console.log(
          `\n    ${v.fn} idx ${v.idx}  (${v.competition})  ` +
            `legacy ${v.legacyTotal} vs modern ${v.modernTotal} = ${sgn(v.delta)}`,
        );
        const rows = ledger.get(`${v.fn}:${v.idx}`) ?? [];
        if (rows.length === 0) {
          console.log(`      no penalty rows on either side`);
          continue;
        }
        for (const r of rows) {
          const flags = [r.inGame ? "in-game" : "post-game", r.rescinded ? "rescinded" : null]
            .filter(Boolean)
            .join(", ");
          console.log(
            `      ${pad(r.side, 7)} ${pad(r.callsign.slice(0, 20), 22)} ${pad(r.type.slice(0, 26), 28)} ` +
              `score=${lpad(sgn(r.scoreValue), 6)} mvp=${lpad(r.mvpValue, 6)}  ` +
              `${r.time !== null ? `t=${r.time} ` : ""}(${flags})`,
          );
        }
      }
    }

    if (listAll) {
      const sgn = (n: number) => (n > 0 ? `+${n}` : String(n));
      console.log(`\n  --- EVERY DISAGREEING TEAM-GAME (${sv.length}) ---`);
      console.log(
        `    ${pad("competition", 30)} ${pad("tdf", 26)} idx  ` +
          `${lpad("L total", 9)} ${lpad("M total", 9)} ${lpad("delta", 7)}  ` +
          `${pad("cause", 20)} where`,
      );
      for (const v of sv) {
        // Whether the deduction sits in the raw score or in penalty_score decides
        // which fix applies, so say it here rather than making it a second query.
        const where = v.modernPen !== 0 ? "penalty_score" : "score";
        console.log(
          `    ${pad(v.competition.slice(0, 28), 30)} ${pad(v.fn, 26)} ${v.idx}    ` +
            `${lpad(v.legacyTotal, 9)} ${lpad(v.modernTotal, 9)} ${lpad(sgn(v.delta), 7)}  ` +
            `${pad(v.causes.join("+"), 20)} ${where}`,
        );
      }
    }

    console.log(`\n  --- ALL DISAGREEMENTS BY COMPETITION ---`);
    console.log(
      `    ${pad("competition", 46)} ${lpad("rows", 5)} ${lpad("arena", 6)} ${lpad("escal", 7)} ${lpad("elim", 5)} ${lpad("review", 7)} ${lpad("net", 10)}`,
    );
    const byComp = new Map<string, ScoreVariance[]>();
    for (const v of sv) {
      const list = byComp.get(v.competition) ?? [];
      list.push(v);
      byComp.set(v.competition, list);
    }
    for (const [comp, list] of [...byComp].sort((a, b) => b[1].length - a[1].length)) {
      const n = (c: DeltaCause) => list.filter((v) => v.causes.includes(c)).length;
      console.log(
        `    ${pad(comp.slice(0, 44), 46)} ${lpad(list.length, 5)} ${lpad(n("arena-deduction"), 6)} ` +
          `${lpad(n("escalation-missing"), 7)} ` +
          `${lpad(n("elim-bonus"), 5)} ${lpad(n("review"), 7)} ` +
          `${lpad(
            list.reduce((s, v) => s + v.delta, 0),
            10,
          )}`,
      );
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
