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
  startSeconds: number | null;
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
  startSeconds: number | null;
  label: string | null;
  createdAt: Date;
};

export type NewGameVideo = {
  gameId: string;
  playerId: string | null;
  youtubeVideoId: string;
  youtubeUrl: string;
  startSeconds: number | null;
  label: string | null;
  source: "admin" | "api";
  createdByUserId?: string | null;
  createdByApiKeyId?: string | null;
};

export type AddGameVideoResult = {
  video: GameVideoRow;
  /** A new row was inserted. */
  created: boolean;
  /** An existing row's contents changed (only possible with `overwrite`). */
  updated: boolean;
};

const gameSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`;

/**
 * Inserts a video, or reconciles with the existing row when the same video has
 * already been attached to this game/player. Backed by the (game_id, player_id,
 * youtube_video_id) NULLS NOT DISTINCT unique constraint, which makes repeat
 * POSTs from the external tool idempotent rather than duplicating rows.
 *
 * Without `overwrite` a conflict is a no-op and the stored row is returned
 * untouched. With it, the row is rewritten from `input` — the way a capture
 * tool corrects a start offset or label on a link it already published. The
 * offset is not part of the unique key precisely so that this is an update.
 *
 * `created` marks a fresh insert (201); `updated` marks a conflict whose
 * contents actually changed, so callers can skip revalidation on a true no-op.
 */
export async function addGameVideo(
  input: NewGameVideo,
  options: { overwrite?: boolean } = {},
): Promise<AddGameVideoResult> {
  const [inserted] = await db.insert(gameVideo).values(input).onConflictDoNothing().returning();

  if (inserted) return { video: inserted, created: true, updated: false };

  const conflict = and(
    eq(gameVideo.gameId, input.gameId),
    input.playerId === null
      ? sql`${gameVideo.playerId} is null`
      : eq(gameVideo.playerId, input.playerId),
    eq(gameVideo.youtubeVideoId, input.youtubeVideoId),
  );

  const [existing] = await db.select().from(gameVideo).where(conflict);

  const changed =
    existing!.youtubeUrl !== input.youtubeUrl ||
    existing!.startSeconds !== input.startSeconds ||
    existing!.label !== input.label;

  if (!options.overwrite || !changed) {
    return { video: existing!, created: false, updated: false };
  }

  // createdAt and the original creator are left alone — this is the same video
  // link being corrected, not a new one.
  const [updated] = await db
    .update(gameVideo)
    .set({
      youtubeUrl: input.youtubeUrl,
      startSeconds: input.startSeconds,
      label: input.label,
    })
    .where(conflict)
    .returning();

  return { video: updated!, created: false, updated: true };
}

export async function removeGameVideo(videoId: string): Promise<void> {
  await db.delete(gameVideo).where(eq(gameVideo.id, videoId));
}

/**
 * The raw row, used by the admin actions to authorize against the video's *own*
 * game — a video id and the game the caller claims to be editing are separate
 * inputs, and on a Laserball match view they legitimately differ (a video on
 * half 1 is editable from half 2's URL).
 */
export async function getGameVideoById(videoId: string): Promise<GameVideoRow | null> {
  const [row] = await db.select().from(gameVideo).where(eq(gameVideo.id, videoId));
  return row ?? null;
}

export type UpdateGameVideoFields = {
  youtubeUrl: string;
  youtubeVideoId: string;
  startSeconds: number | null;
  label: string | null;
};

/**
 * Edits an existing link in place. The game and player it belongs to are fixed
 * — re-pointing a video at a different player is a delete plus an add.
 *
 * Repointing at a video already attached to the same game/player would violate
 * the unique constraint, so that is detected and reported rather than surfacing
 * as a raw 23505 the UI can't explain.
 */
export async function updateGameVideo(
  videoId: string,
  fields: UpdateGameVideoFields,
): Promise<{ ok: true; video: GameVideoRow } | { ok: false; reason: "not_found" | "duplicate" }> {
  const existing = await getGameVideoById(videoId);
  if (!existing) return { ok: false, reason: "not_found" };

  if (fields.youtubeVideoId !== existing.youtubeVideoId) {
    const [clash] = await db
      .select({ id: gameVideo.id })
      .from(gameVideo)
      .where(
        and(
          eq(gameVideo.gameId, existing.gameId),
          existing.playerId === null
            ? sql`${gameVideo.playerId} is null`
            : eq(gameVideo.playerId, existing.playerId),
          eq(gameVideo.youtubeVideoId, fields.youtubeVideoId),
        ),
      );
    if (clash) return { ok: false, reason: "duplicate" };
  }

  const [updated] = await db
    .update(gameVideo)
    .set(fields)
    .where(eq(gameVideo.id, videoId))
    .returning();

  return { ok: true, video: updated! };
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
      startSeconds: gameVideo.startSeconds,
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
      startSeconds: gameVideo.startSeconds,
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
