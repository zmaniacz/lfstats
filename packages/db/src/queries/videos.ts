// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { parseGameSlug } from "../lib/game-slug";
import { center, game, gameVideo, lbScorecard, player, sm5Scorecard } from "../schema";

export type GameVideoRow = typeof gameVideo.$inferSelect;

export type GameVideo = {
  id: string;
  gameId: string;
  playerId: string | null;
  callsign: string | null;
  iplId: string | null;
  youtubeVideoId: string;
  youtubeUrl: string;
  label: string | null;
  source: "admin" | "api";
  createdAt: Date;
};

export type PlayerVideo = {
  id: string;
  gameId: string;
  gameSlug: string;
  gameType: string;
  gameStartTime: Date;
  centerName: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  label: string | null;
  createdAt: Date;
};

export type NewGameVideo = {
  gameId: string;
  playerId: string | null;
  youtubeVideoId: string;
  youtubeUrl: string;
  label: string | null;
  source: "admin" | "api";
  createdByUserId?: string | null;
  createdByApiKeyId?: string | null;
};

const gameSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

/**
 * Inserts a video, or returns the existing row when the same video has already
 * been attached to this game/player. Backed by the (game_id, player_id,
 * youtube_video_id) NULLS NOT DISTINCT unique constraint, which makes repeat
 * POSTs from the external tool idempotent rather than duplicating rows.
 *
 * `created` distinguishes a fresh insert (201) from a no-op (200).
 */
export async function addGameVideo(
  input: NewGameVideo,
): Promise<{ video: GameVideoRow; created: boolean }> {
  const [inserted] = await db.insert(gameVideo).values(input).onConflictDoNothing().returning();

  if (inserted) return { video: inserted, created: true };

  const [existing] = await db
    .select()
    .from(gameVideo)
    .where(
      and(
        eq(gameVideo.gameId, input.gameId),
        input.playerId === null
          ? sql`${gameVideo.playerId} is null`
          : eq(gameVideo.playerId, input.playerId),
        eq(gameVideo.youtubeVideoId, input.youtubeVideoId),
      ),
    );

  return { video: existing!, created: false };
}

export async function removeGameVideo(videoId: string): Promise<void> {
  await db.delete(gameVideo).where(eq(gameVideo.id, videoId));
}

export async function getGameVideos(gameId: string): Promise<GameVideo[]> {
  return getGameVideosForGames([gameId]);
}

/**
 * Videos for a set of games. Used by the Laserball match view, which renders
 * every game in a match on one page regardless of which half's slug was loaded.
 */
export async function getGameVideosForGames(gameIds: string[]): Promise<GameVideo[]> {
  if (gameIds.length === 0) return [];

  return db
    .select({
      id: gameVideo.id,
      gameId: gameVideo.gameId,
      playerId: gameVideo.playerId,
      callsign: player.currentCallsign,
      iplId: player.iplId,
      youtubeVideoId: gameVideo.youtubeVideoId,
      youtubeUrl: gameVideo.youtubeUrl,
      label: gameVideo.label,
      source: gameVideo.source,
      createdAt: gameVideo.createdAt,
    })
    .from(gameVideo)
    .leftJoin(player, eq(player.id, gameVideo.playerId))
    .where(inArray(gameVideo.gameId, gameIds))
    .orderBy(gameVideo.createdAt);
}

export async function getPlayerVideos(playerId: string): Promise<PlayerVideo[]> {
  return db
    .select({
      id: gameVideo.id,
      gameId: gameVideo.gameId,
      gameSlug: gameSlugSql,
      gameType: game.type,
      gameStartTime: game.startTime,
      centerName: center.name,
      youtubeVideoId: gameVideo.youtubeVideoId,
      youtubeUrl: gameVideo.youtubeUrl,
      label: gameVideo.label,
      createdAt: gameVideo.createdAt,
    })
    .from(gameVideo)
    .innerJoin(game, eq(game.id, gameVideo.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .where(eq(gameVideo.playerId, playerId))
    .orderBy(sql`${game.startTime} desc`);
}

/**
 * Resolves a game slug (`{countryCode}-{siteCode}-{YYYYMMDDHHmmss}`, e.g.
 * `4-23-20260808212334`) to a lightweight game row.
 *
 * Deliberately does NOT filter on game.type — unlike getGameDetailBySlug and
 * getLbGameDetailBySlug, this must resolve both SM5 and Laserball games.
 */
export async function getGameBySlug(
  slug: string,
): Promise<{ id: string; centerId: string; type: string } | null> {
  const parsed = parseGameSlug(slug);
  if (!parsed) return null;

  const [row] = await db
    .select({ id: game.id, centerId: game.centerId, type: game.type })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );

  return row ?? null;
}

/**
 * Resolves an IPL id to a player id **only if that player has a scorecard in
 * this game**. A plain player lookup would happily attach POV footage to a real
 * player who never played the game (e.g. a mistyped IPL id belonging to someone
 * at another center), so the API uses this instead.
 */
export async function getScorecardPlayerIdByIplId(
  gameId: string,
  gameType: string,
  iplId: string,
): Promise<string | null> {
  const scorecard = gameType === "lb" ? lbScorecard : sm5Scorecard;

  const [row] = await db
    .select({ playerId: scorecard.playerId })
    .from(scorecard)
    .where(and(eq(scorecard.gameId, gameId), eq(scorecard.iplId, iplId)));

  return row?.playerId ?? null;
}
