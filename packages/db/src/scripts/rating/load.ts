// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Loads every rateable SM5 game into memory, chronologically ordered.
 *
 * Read-only. Three queries (games, teams, scorecards) stitched in JS rather than
 * one wide join — the join would multiply the game/competition context across
 * every scorecard row, and the whole dataset fits in memory comfortably.
 *
 * Two subtleties worth knowing:
 *
 *   1. `game.start_time` is center-LOCAL wall time with no timezone applied
 *      (docs/Core_Schema.md). Ordering a global rating stream by it directly
 *      would interleave centers wrongly by up to a day, so the ordering key is
 *      `start_time AT TIME ZONE center.timezone`. Centers with a null timezone
 *      fall back to UTC.
 *   2. Every game carries a third `is_neutral = true` team row (targets and
 *      referees) with a null score and result. It is filtered out everywhere.
 */

import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { db } from "../../client";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  sm5GameTeam,
  sm5Scorecard,
} from "../../schema";
import type { GameRecord, GameSide, RatedPlayer, TeamResult } from "./types";

/** Outcomes that never represent a played game — synthesized or void rows. */
const UNPLAYABLE_OUTCOMES = ["aborted", "replay", "forfeit"] as const;

export type LoadStats = {
  gamesQueried: number;
  gamesKept: number;
  skippedNotTwoSides: number;
  skippedEmptyRoster: number;
  totalScorecards: number;
  guestScorecards: number;
  gamesWithAnyGuest: number;
  distinctPlayers: number;
  distinctCenters: number;
  earliest: Date | null;
  latest: Date | null;
};

export type LoadResult = {
  games: GameRecord[];
  stats: LoadStats;
};

export async function loadSm5Games(): Promise<LoadResult> {
  const gameRows = await db
    .select({
      gameId: game.id,
      centerId: game.centerId,
      centerName: center.name,
      startTime: game.startTime,
      sortKey: sql<number>`(extract(epoch from (${game.startTime} at time zone coalesce(${center.timezone}, 'UTC'))) * 1000)::float8`,
      competitionId: game.competitionId,
      competitionType: competition.type,
      competitionCategory: competition.category,
      roundType: competitionRound.type,
      roundMultiplier: competitionRound.multiplier,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .leftJoin(competition, eq(competition.id, game.competitionId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.gameId, game.id))
    .leftJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .leftJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(
      and(
        // Case-insensitive: a handful of rows carry "SM5" rather than "sm5".
        sql`lower(${game.type}) = 'sm5'`,
        eq(game.exclude, false),
        notInArray(game.outcome, [...UNPLAYABLE_OUTCOMES]),
      ),
    )
    .orderBy(
      sql`extract(epoch from (${game.startTime} at time zone coalesce(${center.timezone}, 'UTC')))`,
    );

  const gameIds = gameRows.map((g) => g.gameId);
  if (gameIds.length === 0) {
    return { games: [], stats: emptyStats() };
  }

  const teamRows = await db
    .select({
      id: sm5GameTeam.id,
      gameId: sm5GameTeam.gameId,
      tdfTeamIndex: sm5GameTeam.tdfTeamIndex,
      result: sm5GameTeam.result,
      score: sm5GameTeam.score,
    })
    .from(sm5GameTeam)
    .where(
      and(
        inArray(sm5GameTeam.gameId, gameIds),
        eq(sm5GameTeam.isNeutral, false),
        isNotNull(sm5GameTeam.result),
      ),
    );

  const scorecardRows = await db
    .select({
      gameId: sm5Scorecard.gameId,
      teamId: sm5Scorecard.teamId,
      playerId: sm5Scorecard.playerId,
      callsign: sm5Scorecard.callsign,
      position: sm5Scorecard.position,
      mvpPoints: sm5Scorecard.mvpPoints,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .where(and(inArray(sm5Scorecard.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)));

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId);
    if (list) list.push(t);
    else teamsByGame.set(t.gameId, [t]);
  }

  const rosterByTeam = new Map<string, RatedPlayer[]>();
  for (const sc of scorecardRows) {
    const list = rosterByTeam.get(sc.teamId);
    const entry: RatedPlayer = {
      playerId: sc.playerId,
      callsign: sc.callsign,
      position: sc.position,
      mvpPoints: sc.mvpPoints,
    };
    if (list) list.push(entry);
    else rosterByTeam.set(sc.teamId, [entry]);
  }

  const games: GameRecord[] = [];
  const stats = emptyStats();
  stats.gamesQueried = gameRows.length;
  const playerIds = new Set<string>();
  const centerIds = new Set<string>();

  for (const g of gameRows) {
    const teams = teamsByGame.get(g.gameId) ?? [];
    // A rateable game is exactly two non-neutral sides, both with a recorded
    // result. The team query already drops null-result rows, so anything else —
    // a stray third team, a half-ingested game — lands here and is not
    // representable as a head-to-head.
    if (teams.length !== 2) {
      stats.skippedNotTwoSides++;
      continue;
    }

    teams.sort((a, b) => a.tdfTeamIndex - b.tdfTeamIndex);
    const sides = teams.map<GameSide>((t) => ({
      gameTeamId: t.id,
      tdfTeamIndex: t.tdfTeamIndex,
      result: t.result as TeamResult,
      score: t.score,
      players: rosterByTeam.get(t.id) ?? [],
    }));

    if (sides[0]!.players.length === 0 || sides[1]!.players.length === 0) {
      stats.skippedEmptyRoster++;
      continue;
    }

    const record: GameRecord = {
      gameId: g.gameId,
      centerId: g.centerId,
      centerName: g.centerName,
      startTime: g.startTime,
      sortKey: Number(g.sortKey),
      competitionId: g.competitionId,
      competitionType: g.competitionType,
      competitionCategory: g.competitionCategory,
      roundType: g.roundType,
      roundMultiplier: g.roundMultiplier,
      sides: [sides[0]!, sides[1]!],
    };

    let sawGuest = false;
    for (const side of record.sides) {
      for (const p of side.players) {
        stats.totalScorecards++;
        if (p.playerId === null) {
          stats.guestScorecards++;
          sawGuest = true;
        } else {
          playerIds.add(p.playerId);
        }
      }
    }
    if (sawGuest) stats.gamesWithAnyGuest++;
    centerIds.add(g.centerId);

    games.push(record);
  }

  // The SQL ORDER BY already sorts on the timezone-corrected key; re-sorting in
  // JS keeps the guarantee local to this function and survives a query change.
  games.sort((a, b) => a.sortKey - b.sortKey);

  stats.gamesKept = games.length;
  stats.distinctPlayers = playerIds.size;
  stats.distinctCenters = centerIds.size;
  stats.earliest = games.length > 0 ? games[0]!.startTime : null;
  stats.latest = games.length > 0 ? games[games.length - 1]!.startTime : null;

  return { games, stats };
}

/**
 * Modal center per player: the center where they have played the most games.
 * Used by the cross-center diagnostics — a player's "home" is where they play,
 * not anything recorded on the `player` row.
 */
export function homeCenterByPlayer(games: GameRecord[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const g of games) {
    for (const side of g.sides) {
      for (const p of side.players) {
        if (p.playerId === null) continue;
        let byCenter = counts.get(p.playerId);
        if (!byCenter) {
          byCenter = new Map();
          counts.set(p.playerId, byCenter);
        }
        byCenter.set(g.centerId, (byCenter.get(g.centerId) ?? 0) + 1);
      }
    }
  }

  const home = new Map<string, string>();
  for (const [playerId, byCenter] of counts) {
    let bestCenter = "";
    let bestCount = -1;
    for (const [centerId, count] of byCenter) {
      if (count > bestCount) {
        bestCount = count;
        bestCenter = centerId;
      }
    }
    home.set(playerId, bestCenter);
  }
  return home;
}

/**
 * Fraction of a game's identified players whose home center differs from where
 * the game was played. High values mean visitors are present, which is the only
 * way rating information crosses between center pools.
 */
export function awayFraction(g: GameRecord, home: Map<string, string>): number {
  let total = 0;
  let away = 0;
  for (const side of g.sides) {
    for (const p of side.players) {
      if (p.playerId === null) continue;
      total++;
      if (home.get(p.playerId) !== g.centerId) away++;
    }
  }
  return total === 0 ? 0 : away / total;
}

function emptyStats(): LoadStats {
  return {
    gamesQueried: 0,
    gamesKept: 0,
    skippedNotTwoSides: 0,
    skippedEmptyRoster: 0,
    totalScorecards: 0,
    guestScorecards: 0,
    gamesWithAnyGuest: 0,
    distinctPlayers: 0,
    distinctCenters: 0,
    earliest: null,
    latest: null,
  };
}
