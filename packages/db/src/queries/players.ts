// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  player,
  playerCallsignHistory,
  sm5Scorecard,
  sm5GameTeam,
  sm5ScorecardMvp,
  sm5GamePlayerInteraction,
  game,
  center,
} from "../schema";
import { alias } from "drizzle-orm/pg-core";
import { eq, and, asc, desc, count, sql, inArray } from "drizzle-orm";
import type { MvpBoxPlotItem } from "./centers";
import type { GameTeamSummary, MvpComponentRow } from "./games";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

export type PlayerDetail = {
  id: string;
  iplId: string;
  currentCallsign: string;
  firstSeenAt: Date;
};

export type PlayerCallsignHistoryItem = {
  callsign: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type PositionAvgMvp = {
  position: number;
  avgMvp: number;
};

export async function getPlayerByIplId(iplId: string): Promise<PlayerDetail | null> {
  const normalized = iplId.startsWith("#") ? iplId : `#${iplId}`;
  const [row] = await db
    .select({
      id: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      firstSeenAt: player.firstSeenAt,
    })
    .from(player)
    .where(eq(player.iplId, normalized));

  return row ?? null;
}

export async function getPlayerCallsignHistory(
  playerId: string,
): Promise<PlayerCallsignHistoryItem[]> {
  const rows = await db
    .select({
      callsign: playerCallsignHistory.callsign,
      firstSeenAt: playerCallsignHistory.firstSeenAt,
      lastSeenAt: playerCallsignHistory.lastSeenAt,
    })
    .from(playerCallsignHistory)
    .where(eq(playerCallsignHistory.playerId, playerId))
    .orderBy(desc(playerCallsignHistory.lastSeenAt));

  return rows.map((r) => ({
    callsign: r.callsign,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
  }));
}

export type PlayerResultItem = {
  colourEnum: number;
  result: "win" | "loss";
  outcome: "score" | "elimination";
  count: number;
};

export async function getPlayerResultsByColor(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<PlayerResultItem[]> {
  const rows = await db
    .select({
      colourEnum: sm5GameTeam.colourEnum,
      result: sm5GameTeam.result,
      outcome: game.outcome,
      count: count(),
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        eq(sm5GameTeam.isNeutral, false),
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
      ),
    )
    .groupBy(sm5GameTeam.colourEnum, sm5GameTeam.result, game.outcome)
    .orderBy(desc(sm5GameTeam.result), asc(sm5GameTeam.colourEnum), desc(game.outcome));

  return rows
    .filter(
      (r) =>
        (r.result === "win" || r.result === "loss") &&
        (r.outcome === "score" || r.outcome === "elimination"),
    )
    .map((r) => ({
      colourEnum: r.colourEnum,
      result: r.result as "win" | "loss",
      outcome: r.outcome as "score" | "elimination",
      count: r.count,
    }));
}

export async function getPlayerAvgMvpByPosition(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<PositionAvgMvp[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
      ),
    )
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgMvp: r.avgMvp,
  }));
}

export async function getGlobalAvgMvpByPosition(
  scopeFilter?: GameScopeFilter,
): Promise<PositionAvgMvp[]> {
  const conditions = scopeFilter ? gameScopeConditions(scopeFilter) : [];
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgMvp: r.avgMvp,
  }));
}

export async function getPlayerMvpBoxPlot(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<MvpBoxPlotItem[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      min: sql<number>`MIN(${sm5Scorecard.mvpPoints})::float`,
      q1: sql<number>`PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      median: sql<number>`PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      q3: sql<number>`PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      max: sql<number>`MAX(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
      ),
    )
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    min: r.min,
    q1: r.q1,
    median: r.median,
    q3: r.q3,
    max: r.max,
  }));
}

export type PositionAvgScore = {
  position: number;
  avgScore: number;
};

export async function getPlayerAvgScoreByPosition(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<PositionAvgScore[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgScore: sql<number>`AVG(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
      ),
    )
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgScore: r.avgScore,
  }));
}

export async function getGlobalAvgScoreByPosition(
  scopeFilter?: GameScopeFilter,
): Promise<PositionAvgScore[]> {
  const conditions = scopeFilter ? gameScopeConditions(scopeFilter) : [];
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgScore: sql<number>`AVG(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgScore: r.avgScore,
  }));
}

export type PlayerGameListItem = {
  id: string;
  gameSlug: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw";
  centerId: string;
  centerSlug: string;
  centerName: string;
  description: string | null;
  teams: GameTeamSummary[];
  position: number;
  mvpPoints: number;
  score: number;
  teamColourEnum: number;
  callsign: string;
  mvpComponents: MvpComponentRow[];
};

export type PlayerLeaderboardItem = {
  iplId: string;
  callsign: string;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  totalGames: number;
  wins: number;
};

export async function getPlayersLeaderboard(options?: {
  scopeFilter?: GameScopeFilter;
  position?: number;
}): Promise<PlayerLeaderboardItem[]> {
  const rows = await db
    .select({
      iplId: player.iplId,
      callsign: player.currentCallsign,
      avgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
      totalMvp: sql<number>`SUM(${sm5Scorecard.mvpPoints})::float`,
      avgAccuracy: sql<number>`AVG(${sm5Scorecard.accuracy})::float`,
      avgHitDiff: sql<number>`AVG(${sm5Scorecard.hitDiff})::float`,
      totalGames: sql<number>`(COUNT(*))::int`,
      wins: sql<number>`(COUNT(*) FILTER (WHERE ${sm5GameTeam.result} = 'win'))::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .innerJoin(player, eq(sm5Scorecard.playerId, player.id))
    .where(
      and(
        eq(sm5GameTeam.isNeutral, false),
        ...(options?.scopeFilter ? gameScopeConditions(options.scopeFilter) : []),
        options?.position !== undefined ? eq(sm5Scorecard.position, options.position) : undefined,
      ),
    )
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(desc(sql`AVG(${sm5Scorecard.mvpPoints})`));

  return rows.map((r) => ({
    iplId: r.iplId,
    callsign: r.callsign,
    avgMvp: r.avgMvp,
    totalMvp: r.totalMvp,
    avgAccuracy: r.avgAccuracy,
    avgHitDiff: r.avgHitDiff,
    totalGames: r.totalGames,
    wins: r.wins,
  }));
}

export type PlayerMedicHitsItem = {
  iplId: string;
  callsign: string;
  totalMedicHits: number;
  avgMedicHits: number;
  gamesPlayed: number;
  totalMedicHitsNonResup: number | null;
  avgMedicHitsNonResup: number | null;
  gamesPlayedNonResup: number;
};

export async function getPlayersMedicHitsLeaderboard(options?: {
  scopeFilter?: GameScopeFilter;
}): Promise<PlayerMedicHitsItem[]> {
  const rows = await db
    .select({
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMedicHits: sql<number>`(SUM(${sm5Scorecard.medicHits}))::int`,
      avgMedicHits: sql<number>`AVG(${sm5Scorecard.medicHits})::float`,
      gamesPlayed: sql<number>`(COUNT(*))::int`,
      totalMedicHitsNonResup: sql<
        number | null
      >`(SUM(${sm5Scorecard.medicHits}) FILTER (WHERE ${sm5Scorecard.position} IN (1, 2, 3)))::int`,
      avgMedicHitsNonResup: sql<
        number | null
      >`(AVG(${sm5Scorecard.medicHits}) FILTER (WHERE ${sm5Scorecard.position} IN (1, 2, 3)))::float`,
      gamesPlayedNonResup: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} IN (1, 2, 3)))::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .innerJoin(player, eq(sm5Scorecard.playerId, player.id))
    .where(
      and(
        eq(sm5GameTeam.isNeutral, false),
        ...(options?.scopeFilter ? gameScopeConditions(options.scopeFilter) : []),
      ),
    )
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(desc(sql`SUM(${sm5Scorecard.medicHits})`));

  return rows.map((r) => ({
    iplId: r.iplId,
    callsign: r.callsign,
    totalMedicHits: r.totalMedicHits,
    avgMedicHits: r.avgMedicHits,
    gamesPlayed: r.gamesPlayed,
    totalMedicHitsNonResup: r.totalMedicHitsNonResup,
    avgMedicHitsNonResup: r.avgMedicHitsNonResup,
    gamesPlayedNonResup: r.gamesPlayedNonResup,
  }));
}

export type PlayerOverallAverages = {
  playerIplId: string;
  playerName: string;
  avgAvgMvp: number;
  totalMvp: number;
  avgAvgAcc: number;
  hitDiff: number;
  gamesWon: number;
  gamesPlayed: number;
  commanderAvgMvp: number | null;
  commanderAvgAcc: number | null;
  commanderGamesWon: number;
  commanderGamesPlayed: number;
  heavyAvgMvp: number | null;
  heavyAvgAcc: number | null;
  heavyGamesWon: number;
  heavyGamesPlayed: number;
  scoutAvgMvp: number | null;
  scoutAvgAcc: number | null;
  scoutGamesWon: number;
  scoutGamesPlayed: number;
  ammoAvgMvp: number | null;
  ammoAvgAcc: number | null;
  ammoGamesWon: number;
  ammoGamesPlayed: number;
  medicAvgMvp: number | null;
  medicAvgAcc: number | null;
  medicGamesWon: number;
  medicGamesPlayed: number;
};

export async function getPlayerOverallAverages(): Promise<PlayerOverallAverages[]> {
  const rows = await db
    .select({
      playerIplId: player.iplId,
      playerName: player.currentCallsign,
      avgAvgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
      totalMvp: sql<number>`SUM(${sm5Scorecard.mvpPoints})::float`,
      avgAvgAcc: sql<number>`(AVG(${sm5Scorecard.accuracy}) * 100)::float`,
      hitDiff: sql<number>`AVG(${sm5Scorecard.hitDiff})::float`,
      gamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5GameTeam.result} = 'win'))::int`,
      gamesPlayed: sql<number>`(COUNT(*))::int`,
      commanderAvgMvp: sql<
        number | null
      >`(AVG(${sm5Scorecard.mvpPoints}) FILTER (WHERE ${sm5Scorecard.position} = 1))::float`,
      commanderAvgAcc: sql<
        number | null
      >`(AVG(${sm5Scorecard.accuracy}) FILTER (WHERE ${sm5Scorecard.position} = 1) * 100)::float`,
      commanderGamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 1 AND ${sm5GameTeam.result} = 'win'))::int`,
      commanderGamesPlayed: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 1))::int`,
      heavyAvgMvp: sql<
        number | null
      >`(AVG(${sm5Scorecard.mvpPoints}) FILTER (WHERE ${sm5Scorecard.position} = 2))::float`,
      heavyAvgAcc: sql<
        number | null
      >`(AVG(${sm5Scorecard.accuracy}) FILTER (WHERE ${sm5Scorecard.position} = 2) * 100)::float`,
      heavyGamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 2 AND ${sm5GameTeam.result} = 'win'))::int`,
      heavyGamesPlayed: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 2))::int`,
      scoutAvgMvp: sql<
        number | null
      >`(AVG(${sm5Scorecard.mvpPoints}) FILTER (WHERE ${sm5Scorecard.position} = 3))::float`,
      scoutAvgAcc: sql<
        number | null
      >`(AVG(${sm5Scorecard.accuracy}) FILTER (WHERE ${sm5Scorecard.position} = 3) * 100)::float`,
      scoutGamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 3 AND ${sm5GameTeam.result} = 'win'))::int`,
      scoutGamesPlayed: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 3))::int`,
      ammoAvgMvp: sql<
        number | null
      >`(AVG(${sm5Scorecard.mvpPoints}) FILTER (WHERE ${sm5Scorecard.position} = 4))::float`,
      ammoAvgAcc: sql<
        number | null
      >`(AVG(${sm5Scorecard.accuracy}) FILTER (WHERE ${sm5Scorecard.position} = 4) * 100)::float`,
      ammoGamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 4 AND ${sm5GameTeam.result} = 'win'))::int`,
      ammoGamesPlayed: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 4))::int`,
      medicAvgMvp: sql<
        number | null
      >`(AVG(${sm5Scorecard.mvpPoints}) FILTER (WHERE ${sm5Scorecard.position} = 5))::float`,
      medicAvgAcc: sql<
        number | null
      >`(AVG(${sm5Scorecard.accuracy}) FILTER (WHERE ${sm5Scorecard.position} = 5) * 100)::float`,
      medicGamesWon: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 5 AND ${sm5GameTeam.result} = 'win'))::int`,
      medicGamesPlayed: sql<number>`(COUNT(*) FILTER (WHERE ${sm5Scorecard.position} = 5))::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .innerJoin(player, eq(sm5Scorecard.playerId, player.id))
    .where(and(eq(sm5GameTeam.isNeutral, false), eq(game.exclude, false)))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(desc(sql`AVG(${sm5Scorecard.mvpPoints})`));

  return rows;
}

export async function getPlayerGames(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<PlayerGameListItem[]> {
  const rows = await db
    .select({
      scorecardId: sm5Scorecard.id,
      id: game.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerId: center.id,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      centerName: center.name,
      description: game.description,
      callsign: sm5Scorecard.callsign,
      position: sm5Scorecard.position,
      mvpPoints: sm5Scorecard.mvpPoints,
      score: sm5Scorecard.score,
      teamColourEnum: sm5GameTeam.colourEnum,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        ...(scopeFilter ? gameScopeConditions(scopeFilter) : []),
      ),
    )
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = [...new Set(rows.map((r) => r.id))];
  const scorecardIds = rows.map((r) => r.scorecardId);

  const [teamRows, mvpRows] = await Promise.all([
    db
      .select({
        gameId: sm5GameTeam.gameId,
        colourEnum: sm5GameTeam.colourEnum,
        score: sm5GameTeam.score,
        eliminationBonus: sm5GameTeam.eliminationBonus,
        result: sm5GameTeam.result,
      })
      .from(sm5GameTeam)
      .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
      .orderBy(sm5GameTeam.tdfTeamIndex),
    db
      .select({
        scorecardId: sm5ScorecardMvp.scorecardId,
        component: sm5ScorecardMvp.component,
        inputValue: sm5ScorecardMvp.inputValue,
        points: sm5ScorecardMvp.points,
      })
      .from(sm5ScorecardMvp)
      .where(inArray(sm5ScorecardMvp.scorecardId, scorecardIds)),
  ]);

  const teamsByGame = new Map<string, GameTeamSummary[]>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push({
      colourEnum: team.colourEnum,
      score: team.score,
      eliminationBonus: team.eliminationBonus,
      result: team.result,
    });
    teamsByGame.set(team.gameId, list);
  }

  const mvpByScorecard = new Map<string, MvpComponentRow[]>();
  for (const row of mvpRows) {
    if (row.inputValue === 0 && row.points === 0) continue;
    const list = mvpByScorecard.get(row.scorecardId) ?? [];
    list.push({ component: row.component, inputValue: row.inputValue, points: row.points });
    mvpByScorecard.set(row.scorecardId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    gameSlug: row.gameSlug,
    startTime: row.startTime,
    outcome: row.outcome as "score" | "elimination" | "draw",
    centerId: row.centerId,
    centerSlug: row.centerSlug,
    centerName: row.centerName,
    description: row.description,
    callsign: row.callsign,
    position: row.position,
    mvpPoints: row.mvpPoints,
    score: row.score,
    teamColourEnum: row.teamColourEnum,
    teams: teamsByGame.get(row.id) ?? [],
    mvpComponents: mvpByScorecard.get(row.scorecardId) ?? [],
  }));
}

export type HeadToHeadRow = {
  targetPlayerId: string;
  targetIplId: string;
  targetCallsign: string;
  mainPosition: number;
  targetPosition: number;
  isSameTeam: boolean;
  shotsHit: number;
  missileHits: number;
  shotsHitBy: number;
  missileHitsBy: number;
  gamesCount: number;
};

export async function getPlayerHeadToHead(
  playerId: string,
  scopeFilter?: GameScopeFilter,
): Promise<HeadToHeadRow[]> {
  const mainSc = alias(sm5Scorecard, "main_sc");
  const tgtSc = alias(sm5Scorecard, "tgt_sc");
  const rev = alias(sm5GamePlayerInteraction, "rev");
  const tgtPlayer = alias(player, "tgt_player");

  const rows = await db
    .select({
      targetPlayerId: tgtPlayer.id,
      targetIplId: tgtPlayer.iplId,
      targetCallsign: tgtPlayer.currentCallsign,
      mainPosition: mainSc.position,
      targetPosition: tgtSc.position,
      isSameTeam: sql<boolean>`(${mainSc.teamId} = ${tgtSc.teamId})`,
      shotsHit: sql<number>`SUM(${sm5GamePlayerInteraction.shotsHit})::int`,
      missileHits: sql<number>`SUM(${sm5GamePlayerInteraction.missileHits})::int`,
      shotsHitBy: sql<number>`SUM(COALESCE(${rev.shotsHit}, 0))::int`,
      missileHitsBy: sql<number>`SUM(COALESCE(${rev.missileHits}, 0))::int`,
      gamesCount: sql<number>`COUNT(DISTINCT ${sm5GamePlayerInteraction.gameId})::int`,
    })
    .from(sm5GamePlayerInteraction)
    .innerJoin(mainSc, eq(sm5GamePlayerInteraction.scorecardId, mainSc.id))
    .innerJoin(tgtSc, eq(sm5GamePlayerInteraction.targetScorecardId, tgtSc.id))
    .innerJoin(game, eq(sm5GamePlayerInteraction.gameId, game.id))
    .innerJoin(tgtPlayer, eq(tgtSc.playerId, tgtPlayer.id))
    .leftJoin(
      rev,
      and(
        eq(rev.gameId, sm5GamePlayerInteraction.gameId),
        eq(rev.scorecardId, sm5GamePlayerInteraction.targetScorecardId),
        eq(rev.targetScorecardId, sm5GamePlayerInteraction.scorecardId),
      ),
    )
    .where(
      and(eq(mainSc.playerId, playerId), ...(scopeFilter ? gameScopeConditions(scopeFilter) : [])),
    )
    .groupBy(
      tgtPlayer.id,
      tgtPlayer.iplId,
      tgtPlayer.currentCallsign,
      mainSc.position,
      tgtSc.position,
      sql`(${mainSc.teamId} = ${tgtSc.teamId})`,
    );

  return rows.map((r) => ({
    targetPlayerId: r.targetPlayerId,
    targetIplId: r.targetIplId,
    targetCallsign: r.targetCallsign,
    mainPosition: r.mainPosition,
    targetPosition: r.targetPosition,
    isSameTeam: r.isSameTeam,
    shotsHit: r.shotsHit,
    missileHits: r.missileHits,
    shotsHitBy: r.shotsHitBy,
    missileHitsBy: r.missileHitsBy,
    gamesCount: r.gamesCount,
  }));
}
