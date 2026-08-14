// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Reads and writes for the global player ranking.
 *
 * The rating is a batch fit over a rolling window, so it is rebuilt wholesale by
 * `recalc-rating` rather than updated per game. Everything here either feeds
 * that rebuild or serves the finished board.
 */

import { and, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../client";
import {
  DEFAULT_RATING_PARAMETERS,
  type RatingGame,
  type RatingGameSide,
  type PlayerRatingResult,
} from "../lib/rating";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  player,
  playerRating,
  sm5GameTeam,
  sm5RatingModel,
  sm5Scorecard,
} from "../schema";

/** Outcomes that never represent a played game. */
const UNPLAYABLE_OUTCOMES = ["aborted", "replay", "forfeit"] as const;

export type RatingModelRow = {
  id: string;
  version: string;
  parameters: unknown;
};

/** The active rating model — the one with no `retired_at`. */
export async function getActiveRatingModel(): Promise<RatingModelRow | null> {
  const rows = await db
    .select({
      id: sm5RatingModel.id,
      version: sm5RatingModel.version,
      parameters: sm5RatingModel.parameters,
    })
    .from(sm5RatingModel)
    .where(isNull(sm5RatingModel.retiredAt))
    .orderBy(desc(sm5RatingModel.releasedAt))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Every rateable SM5 game inside the window, shaped for `computeRatings`.
 *
 * `start_time` is center-local with no timezone applied, so the window bound is
 * evaluated against `start_time AT TIME ZONE center.timezone` — otherwise the
 * cutoff would land up to a day out for centers far from UTC.
 */
export async function getGamesForRating(windowStart: Date): Promise<RatingGame[]> {
  const sortKey = sql<number>`(extract(epoch from (${game.startTime} at time zone coalesce(${center.timezone}, 'UTC'))) * 1000)::float8`;

  const gameRows = await db
    .select({
      gameId: game.id,
      sortKey,
      competitionId: game.competitionId,
      competitionType: competition.type,
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
        sql`lower(${game.type}) = 'sm5'`,
        eq(game.exclude, false),
        notInArray(game.outcome, [...UNPLAYABLE_OUTCOMES]),
        sql`(${game.startTime} at time zone coalesce(${center.timezone}, 'UTC')) >= ${windowStart.toISOString()}`,
      ),
    );

  if (gameRows.length === 0) return [];
  const gameIds = gameRows.map((g) => g.gameId);

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
    .select({ teamId: sm5Scorecard.teamId, playerId: sm5Scorecard.playerId })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .where(and(inArray(sm5Scorecard.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)));

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId);
    if (list) list.push(t);
    else teamsByGame.set(t.gameId, [t]);
  }

  const rosterByTeam = new Map<string, (string | null)[]>();
  for (const sc of scorecardRows) {
    const list = rosterByTeam.get(sc.teamId);
    if (list) list.push(sc.playerId);
    else rosterByTeam.set(sc.teamId, [sc.playerId]);
  }

  const out: RatingGame[] = [];
  for (const g of gameRows) {
    const teams = teamsByGame.get(g.gameId) ?? [];
    // Exactly two non-neutral sides with a recorded result, or it is not
    // representable as a head-to-head.
    if (teams.length !== 2) continue;
    teams.sort((a, b) => a.tdfTeamIndex - b.tdfTeamIndex);

    const sides = teams.map<RatingGameSide>((t) => ({
      playerIds: rosterByTeam.get(t.id) ?? [],
      score: t.score,
      result: t.result as RatingGameSide["result"],
    }));
    if (sides[0].playerIds.length === 0 || sides[1].playerIds.length === 0) continue;

    out.push({
      gameId: g.gameId,
      sortKey: Number(g.sortKey),
      isSocial: g.competitionId === null || g.competitionType === "social",
      roundMultiplier: g.roundMultiplier,
      sides: [sides[0], sides[1]],
    });
  }

  out.sort((a, b) => a.sortKey - b.sortKey);
  return out;
}

/**
 * Replaces the entire ranking for one model version, in a single transaction.
 *
 * Delete-then-insert rather than upsert: players who drop out of the window or
 * fall below the games minimum must disappear from the board, and an upsert
 * would silently leave them behind at a stale rank.
 */
export async function replacePlayerRatings(
  ratingModelId: string,
  windowStart: Date,
  windowEnd: Date,
  results: PlayerRatingResult[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(playerRating).where(eq(playerRating.ratingModelId, ratingModelId));
    if (results.length === 0) return;

    const rows = results.map((r) => ({
      playerId: r.playerId,
      ratingModelId,
      rating: r.rating,
      standardError: r.standardError,
      rank: r.rank,
      ratingGroup: r.ratingGroup,
      gamesPlayed: r.gamesPlayed,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      windowStart,
      windowEnd,
    }));

    // Chunked: a single insert of a few hundred rows is fine, but this keeps the
    // statement well inside Postgres' parameter limit as the board grows.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(playerRating).values(rows.slice(i, i + CHUNK));
    }
  });
}

export type RankingRow = {
  rank: number;
  ratingGroup: number;
  playerId: string;
  iplId: string;
  callsign: string;
  rating: number;
  standardError: number | null;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

export type RankingsResult = {
  rows: RankingRow[];
  windowStart: Date;
  windowEnd: Date;
  computedAt: Date;
  modelVersion: string;
  /** Total qualifying players, which is usually larger than the board. */
  qualifiedPlayers: number;
  /** Width of one display band, in rating points. */
  bandWidth: number;
  /** How many leading rows the board draws band rules across. */
  groupedHead: number;
};

/**
 * The published board: the top `limit` players for the active model.
 *
 * Returns null when no ranking has been computed yet, so the page can say so
 * rather than rendering an empty table that looks like nobody qualified.
 */
export async function getGlobalRankings(limit = 100): Promise<RankingsResult | null> {
  const model = await getActiveRatingModel();
  if (!model) return null;

  const rows = await db
    .select({
      rank: playerRating.rank,
      ratingGroup: playerRating.ratingGroup,
      playerId: playerRating.playerId,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      rating: playerRating.rating,
      standardError: playerRating.standardError,
      gamesPlayed: playerRating.gamesPlayed,
      wins: playerRating.wins,
      losses: playerRating.losses,
      draws: playerRating.draws,
      windowStart: playerRating.windowStart,
      windowEnd: playerRating.windowEnd,
      computedAt: playerRating.computedAt,
    })
    .from(playerRating)
    .innerJoin(player, eq(player.id, playerRating.playerId))
    .where(eq(playerRating.ratingModelId, model.id))
    .orderBy(playerRating.rank)
    .limit(limit);

  if (rows.length === 0) return null;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playerRating)
    .where(eq(playerRating.ratingModelId, model.id));

  // Fall back to the calculator's defaults when an older model row predates
  // these keys, so the board never renders with a zero-width band.
  const stored = (model.parameters ?? {}) as { bandWidth?: number; groupedHead?: number };

  const first = rows[0];
  return {
    bandWidth: stored.bandWidth ?? DEFAULT_RATING_PARAMETERS.bandWidth,
    groupedHead: stored.groupedHead ?? DEFAULT_RATING_PARAMETERS.groupedHead,
    rows: rows.map((r) => ({
      rank: r.rank,
      ratingGroup: r.ratingGroup,
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      rating: r.rating,
      standardError: r.standardError,
      gamesPlayed: r.gamesPlayed,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      // Draws count as half, matching how the rating model scores them.
      winRate: r.gamesPlayed === 0 ? 0 : (r.wins + 0.5 * r.draws) / r.gamesPlayed,
    })),
    windowStart: first.windowStart,
    windowEnd: first.windowEnd,
    computedAt: first.computedAt,
    modelVersion: model.version,
    qualifiedPlayers: Number(count),
  };
}

/** One player's current ranking, for the player detail page. */
export async function getPlayerRanking(playerId: string): Promise<RankingRow | null> {
  const model = await getActiveRatingModel();
  if (!model) return null;

  const rows = await db
    .select({
      rank: playerRating.rank,
      ratingGroup: playerRating.ratingGroup,
      playerId: playerRating.playerId,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      rating: playerRating.rating,
      standardError: playerRating.standardError,
      gamesPlayed: playerRating.gamesPlayed,
      wins: playerRating.wins,
      losses: playerRating.losses,
      draws: playerRating.draws,
    })
    .from(playerRating)
    .innerJoin(player, eq(player.id, playerRating.playerId))
    .where(and(eq(playerRating.ratingModelId, model.id), eq(playerRating.playerId, playerId)))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    ...r,
    winRate: r.gamesPlayed === 0 ? 0 : (r.wins + 0.5 * r.draws) / r.gamesPlayed,
  };
}
