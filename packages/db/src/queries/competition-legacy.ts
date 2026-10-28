// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { sql, type SQL } from "drizzle-orm";
import { db } from "../client";
import {
  competitionScopeGameIdsSql,
  teamScorecardSql,
  type CompetitionPositionScorecard,
  type CompetitionTeamPlayerStat,
  type CompetitionTopPlayersOptions,
} from "./competition-tournament";
import type { GameScopeFilter } from "./scope";

// Per-player competition stats for competitions that hold PDF-era games (sm5_pdf). The
// TDF-only queries in competition-tournament.ts read sm5_scorecard and stay the path for every
// other competition; callers pick this module with competitionHasLegacyGames(). PDF games are
// never read here outside a single competition's scope, so they stay out of career stats,
// leaderboards and the rating.
//
// Stats both scorecard kinds record (score, accuracy, hit diff, medic hits, times hit,
// survival, penalties, results) average over every game. Modern MVP and the event-derived
// stats come from TDF games only, and legacy MVP from PDF games only: the two MVPs use
// different formulas and are never averaged together.

/** True when a competition holds any PDF-era game. */
export async function competitionHasLegacyGames(competitionId: string): Promise<boolean> {
  const rows = await db.execute<{ found: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM game WHERE competition_id = ${competitionId} AND type = 'sm5_pdf'
    ) AS found`);
  return Boolean([...rows][0]?.found);
}

// Both scorecard kinds in one row shape, with the side's result. Columns a PDF scorecard has
// no source for are null on its rows, so avg() skips them.
const SCORECARDS = sql`(
  SELECT s.id, s.game_id, s.team_id, s.player_id, s.position, s.is_mercenary,
         false AS legacy, s.score, s.accuracy, s.hit_diff, s.medic_hits, s.times_hit,
         s.eliminated, s.penalties, s.mvp_points, NULL::float AS legacy_mvp_points,
         s.deactivated_opponent, s.assists, s.reset_opponent, s.eliminated_opponent,
         s.uptime::float / nullif(s.uptime + s.resupply_downtime + s.other_downtime, 0)
           AS uptime_pct,
         gt.result
  FROM sm5_scorecard s
  JOIN sm5_game_team gt ON gt.id = s.team_id
  UNION ALL
  SELECT p.id, p.game_id, p.team_id, p.player_id, p.position, p.is_mercenary,
         true, p.score, p.accuracy, p.hit_diff, p.medic_hits, p.times_hit,
         p.eliminated, p.penalties, NULL, p.legacy_mvp_points,
         NULL, NULL, NULL, NULL, NULL,
         gt.result
  FROM sm5_pdf_scorecard p
  JOIN sm5_pdf_game_team gt ON gt.id = p.team_id
)`;

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * getCompetitionTeamPlayerStats for a competition with PDF-era games: the same rows, with
 * `avgLegacyMvp` filled in and the event-derived stats null where no TDF game supplies them.
 */
export async function getLegacyCompetitionTeamPlayerStats(
  teamId: string,
): Promise<CompetitionTeamPlayerStat[]> {
  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT sc.player_id, sc.position,
           count(*)::int AS games_played,
           avg(sc.mvp_points)::float AS avg_mvp,
           avg(sc.legacy_mvp_points)::float AS avg_legacy_mvp,
           avg(sc.score)::float AS avg_score,
           avg(sc.hit_diff)::float AS avg_hit_diff,
           avg(sc.medic_hits)::float AS avg_medic_hits,
           avg(sc.accuracy)::float AS avg_accuracy,
           avg(sc.deactivated_opponent)::float AS avg_deactivations,
           avg(sc.assists)::float AS avg_assists,
           avg(sc.times_hit)::float AS avg_times_hit,
           avg(sc.reset_opponent)::float AS avg_resets,
           avg(sc.eliminated_opponent)::float AS avg_eliminations,
           (count(*) FILTER (WHERE sc.result = 'win'))::float / count(*) AS win_rate,
           avg(CASE WHEN sc.eliminated THEN 0 ELSE 1 END)::float AS survival_rate,
           avg(sc.uptime_pct) AS avg_uptime_pct,
           avg(sc.penalties)::float AS avg_penalties
    FROM ${SCORECARDS} sc
    JOIN game g ON g.id = sc.game_id
    WHERE sc.player_id IS NOT NULL
      AND g.exclude = false
      AND ${teamScorecardSql(teamId, sql`sc.team_id`, sql`sc.player_id`)}
    GROUP BY GROUPING SETS ((sc.player_id, sc.position), (sc.player_id))
    ORDER BY sc.player_id, sc.position`);

  return [...rows].map((r) => ({
    playerId: String(r.player_id),
    position: num(r.position),
    gamesPlayed: Number(r.games_played),
    avgMvp: num(r.avg_mvp),
    avgLegacyMvp: num(r.avg_legacy_mvp),
    avgScore: Number(r.avg_score),
    avgHitDiff: Number(r.avg_hit_diff),
    avgMedicHits: Number(r.avg_medic_hits),
    avgAccuracy: Number(r.avg_accuracy),
    avgDeactivations: num(r.avg_deactivations),
    avgAssists: num(r.avg_assists),
    avgTimesHit: Number(r.avg_times_hit),
    avgResets: num(r.avg_resets),
    avgEliminations: num(r.avg_eliminations),
    winRate: Number(r.win_rate),
    survivalRate: Number(r.survival_rate),
    avgUptimePct: num(r.avg_uptime_pct),
    avgPenalties: Number(r.avg_penalties),
  }));
}

// The scorecards a competition-scoped leaderboard covers: the competition's games under the
// round toggles, players only, and mercenaries unless asked for. Null when nothing is selected
// or the scope is not one competition.
function scopeConditions(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions,
): SQL | null {
  if (scopeFilter.scope !== "competition" || !scopeFilter.competitionId) return null;
  const gameIds = competitionScopeGameIdsSql(
    scopeFilter.competitionId,
    scopeFilter.format,
    options,
  );
  if (!gameIds) return null;
  const mercs = options.showMercs ? sql`true` : sql`sc.is_mercenary = false`;
  return sql`sc.game_id IN (${gameIds}) AND sc.player_id IS NOT NULL AND ${mercs}`;
}

export type LegacyPositionStats = {
  avgLegacyMvp: number | null;
  avgAccuracy: number;
  wins: number;
  totalGames: number;
};

export type LegacyCompetitionTopPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  /** Legacy MVP over the player's PDF-era games; null when they played none. */
  avgLegacyMvp: number | null;
  totalLegacyMvp: number | null;
  legacyGames: number;
  /** Modern MVP over the player's TDF games; null when they played none. */
  avgMvp: number | null;
  tdfGames: number;
  avgScore: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgMedicHits: number;
  survivalRate: number;
  wins: number;
  totalGames: number;
  byPosition: Partial<Record<number, LegacyPositionStats>>;
};

export async function getLegacyCompetitionTopPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<LegacyCompetitionTopPlayer[]> {
  const where = scopeConditions(scopeFilter, options);
  if (!where) return [];

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT pl.id AS player_id, pl.ipl_id, pl.current_callsign,
           avg(sc.legacy_mvp_points) AS avg_legacy_mvp,
           sum(sc.legacy_mvp_points) AS total_legacy_mvp,
           (count(*) FILTER (WHERE sc.legacy))::int AS legacy_games,
           avg(sc.mvp_points) AS avg_mvp,
           (count(*) FILTER (WHERE NOT sc.legacy))::int AS tdf_games,
           avg(sc.score) AS avg_score,
           avg(sc.accuracy) AS avg_accuracy,
           avg(sc.hit_diff) AS avg_hit_diff,
           avg(sc.medic_hits) AS avg_medic_hits,
           avg(CASE WHEN sc.eliminated THEN 0 ELSE 1 END) AS survival_rate,
           (count(*) FILTER (WHERE sc.result = 'win'))::int AS wins,
           count(*)::int AS total_games
    FROM ${SCORECARDS} sc
    JOIN player pl ON pl.id = sc.player_id
    WHERE ${where}
    GROUP BY pl.id, pl.ipl_id, pl.current_callsign`);

  // Per-position rows come from a second, grouped pass rather than FILTERed columns: five
  // positions × four stats read more clearly as one row each.
  const positionRows = await db.execute<Record<string, unknown>>(sql`
    SELECT sc.player_id, sc.position,
           avg(sc.legacy_mvp_points) AS avg_legacy_mvp,
           avg(sc.accuracy) AS avg_accuracy,
           (count(*) FILTER (WHERE sc.result = 'win'))::int AS wins,
           count(*)::int AS total_games
    FROM ${SCORECARDS} sc
    WHERE ${where}
    GROUP BY sc.player_id, sc.position`);

  const byPlayer = new Map<string, Partial<Record<number, LegacyPositionStats>>>();
  for (const r of positionRows) {
    const id = String(r.player_id);
    if (!byPlayer.has(id)) byPlayer.set(id, {});
    byPlayer.get(id)![Number(r.position)] = {
      avgLegacyMvp: num(r.avg_legacy_mvp),
      avgAccuracy: Number(r.avg_accuracy),
      wins: Number(r.wins),
      totalGames: Number(r.total_games),
    };
  }

  return [...rows]
    .map((r) => ({
      playerId: String(r.player_id),
      iplId: String(r.ipl_id),
      callsign: String(r.current_callsign),
      avgLegacyMvp: num(r.avg_legacy_mvp),
      totalLegacyMvp: num(r.total_legacy_mvp),
      legacyGames: Number(r.legacy_games),
      avgMvp: num(r.avg_mvp),
      tdfGames: Number(r.tdf_games),
      avgScore: Number(r.avg_score),
      avgAccuracy: Number(r.avg_accuracy),
      avgHitDiff: Number(r.avg_hit_diff),
      avgMedicHits: Number(r.avg_medic_hits),
      survivalRate: Number(r.survival_rate),
      wins: Number(r.wins),
      totalGames: Number(r.total_games),
      byPosition: byPlayer.get(String(r.player_id)) ?? {},
    }))
    .sort((a, b) => (b.avgLegacyMvp ?? -Infinity) - (a.avgLegacyMvp ?? -Infinity));
}

/**
 * Best single PDF-era scorecards at one position, ranked by legacy MVP (`mvpPoints` holds the
 * legacy value). TDF scorecards in a mixed competition are left out rather than ranked
 * against a different formula.
 */
export async function getLegacyCompetitionPositionScorecards(
  scopeFilter: GameScopeFilter,
  position: number,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionPositionScorecard[]> {
  const where = scopeConditions(scopeFilter, options);
  if (!where) return [];

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT sc.id, pl.id AS player_id, pl.ipl_id, pl.current_callsign, sc.score,
           sc.legacy_mvp_points,
           concat(c.country_code::text, '-', c.site_code::text, '-',
                  to_char(g.start_time, 'YYYYMMDDHH24MISS')) AS game_slug
    FROM ${SCORECARDS} sc
    JOIN game g ON g.id = sc.game_id
    JOIN center c ON c.id = g.center_id
    JOIN player pl ON pl.id = sc.player_id
    WHERE ${where} AND sc.legacy AND sc.position = ${position}
    ORDER BY sc.legacy_mvp_points DESC
    LIMIT 100`);

  return [...rows].map((r) => ({
    scorecardId: String(r.id),
    gameSlug: String(r.game_slug),
    playerId: String(r.player_id),
    iplId: String(r.ipl_id),
    callsign: String(r.current_callsign),
    score: Number(r.score),
    mvpPoints: Number(r.legacy_mvp_points),
  }));
}

export type LegacyCompetitionPlayerTotals = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalGames: number;
  totalScore: number;
  totalMedicHits: number;
};

/** Per-player totals over every game, TDF and PDF-era, for the counting leaderboards. */
export async function getLegacyCompetitionPlayerTotals(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<LegacyCompetitionPlayerTotals[]> {
  const where = scopeConditions(scopeFilter, options);
  if (!where) return [];

  const rows = await db.execute<Record<string, unknown>>(sql`
    SELECT pl.id AS player_id, pl.ipl_id, pl.current_callsign,
           count(*)::int AS total_games,
           sum(sc.score)::int AS total_score,
           sum(sc.medic_hits)::int AS total_medic_hits
    FROM ${SCORECARDS} sc
    JOIN player pl ON pl.id = sc.player_id
    WHERE ${where}
    GROUP BY pl.id, pl.ipl_id, pl.current_callsign`);

  return [...rows].map((r) => ({
    playerId: String(r.player_id),
    iplId: String(r.ipl_id),
    callsign: String(r.current_callsign),
    totalGames: Number(r.total_games),
    totalScore: Number(r.total_score),
    totalMedicHits: Number(r.total_medic_hits),
  }));
}
