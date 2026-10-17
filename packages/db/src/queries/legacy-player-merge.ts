// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Merging a synthetic legacy player (`L-…` IPL id, PDF-era only) into the real IPL
 * player they turned out to be. See docs/Legacy_Migration_PDF_Games.md.
 */

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { isSyntheticIplId } from "../lib/synthetic-ipl-id";
import {
  competitionPlayer,
  competitionTeamPlayer,
  gameReferee,
  gameVideo,
  lbScorecard,
  legacyPlayerMap,
  player,
  playerCallsignHistory,
  sm5PdfScorecard,
  sm5Scorecard,
  userFavoritePlayer,
} from "../schema";

export type MergeSyntheticPlayerCounts = {
  scorecards: number;
  callsigns: number;
  legacyIds: number;
  favorites: number;
  videos: number;
};

export type MergeSyntheticPlayerResult =
  | { ok: true; targetIplId: string; counts: MergeSyntheticPlayerCounts }
  | { ok: false; error: string };

/**
 * Moves everything a synthetic player owns onto `targetId`, then deletes the synthetic
 * player row — all in one transaction:
 *
 * - `sm5_pdf_scorecard.player_id` is re-pointed (the per-game `callsign` stays as printed).
 * - `player_callsign_history` rows are merged per callsign, keeping the earliest
 *   `first_seen_at` and the latest `last_seen_at`.
 * - `legacy_player_map` rows are re-pointed and marked `synthetic = false`.
 * - favorites and POV videos follow the player rather than cascading away with the row.
 * - the target's `first_seen_at` moves earlier when the legacy games predate it.
 *
 * The target keeps its own `current_callsign`.
 */
export async function mergeSyntheticPlayer(
  sourceId: string,
  targetId: string,
): Promise<MergeSyntheticPlayerResult> {
  if (sourceId === targetId) return { ok: false, error: "Cannot merge a player into itself." };

  return db.transaction(async (tx) => {
    // Lock both rows so a concurrent merge of the same pair can't interleave.
    const rows = await tx
      .select({ id: player.id, iplId: player.iplId, firstSeenAt: player.firstSeenAt })
      .from(player)
      .where(inArray(player.id, [sourceId, targetId]))
      .for("update");
    const source = rows.find((r) => r.id === sourceId);
    const target = rows.find((r) => r.id === targetId);
    if (!source) return { ok: false, error: "The legacy player no longer exists." };
    if (!target) return { ok: false, error: "The target player no longer exists." };
    if (!isSyntheticIplId(source.iplId)) {
      return { ok: false, error: "Only a synthetic legacy player (L-… id) can be merged away." };
    }
    if (isSyntheticIplId(target.iplId)) {
      return { ok: false, error: "The target must be a real IPL player, not another legacy one." };
    }

    // A synthetic player only ever exists in PDF-era data. Anything modern pointing at it
    // means the assumption is broken — stop rather than cascade-delete or orphan it.
    const [modern] = await tx.execute<{ n: number }>(sql`
      select (
        (select count(*) from ${sm5Scorecard} where player_id = ${sourceId}) +
        (select count(*) from ${lbScorecard} where player_id = ${sourceId}) +
        (select count(*) from ${gameReferee} where player_id = ${sourceId}) +
        (select count(*) from ${competitionPlayer} where player_id = ${sourceId}) +
        (select count(*) from ${competitionTeamPlayer} where player_id = ${sourceId})
      )::int as n`);
    if (modern.n > 0) {
      return {
        ok: false,
        error: "This legacy player has modern games or competition entries; merge it by hand.",
      };
    }

    const scorecards = await tx
      .update(sm5PdfScorecard)
      .set({ playerId: targetId })
      .where(eq(sm5PdfScorecard.playerId, sourceId))
      .returning({ id: sm5PdfScorecard.id });

    const sourceCallsigns = await tx
      .select({
        callsign: playerCallsignHistory.callsign,
        firstSeenAt: playerCallsignHistory.firstSeenAt,
        lastSeenAt: playerCallsignHistory.lastSeenAt,
      })
      .from(playerCallsignHistory)
      .where(eq(playerCallsignHistory.playerId, sourceId));
    // Delete first: the source rows would otherwise sit beside the inserted ones, and
    // the merge below is keyed on (player_id, callsign) of the target only.
    await tx.delete(playerCallsignHistory).where(eq(playerCallsignHistory.playerId, sourceId));
    if (sourceCallsigns.length > 0) {
      await tx
        .insert(playerCallsignHistory)
        .values(sourceCallsigns.map((c) => ({ ...c, playerId: targetId })))
        .onConflictDoUpdate({
          target: [playerCallsignHistory.playerId, playerCallsignHistory.callsign],
          set: {
            firstSeenAt: sql`least(${playerCallsignHistory.firstSeenAt}, excluded.first_seen_at)`,
            lastSeenAt: sql`greatest(${playerCallsignHistory.lastSeenAt}, excluded.last_seen_at)`,
          },
        });
    }

    const legacyIds = await tx
      .update(legacyPlayerMap)
      .set({ playerId: targetId, synthetic: false })
      .where(eq(legacyPlayerMap.playerId, sourceId))
      .returning({ id: legacyPlayerMap.legacyPlayerId });

    // Favorites: a user who favorited both keeps one. The rest cascade with the row.
    const favorites = await tx.execute(sql`
      update ${userFavoritePlayer} f set player_id = ${targetId}
      where f.player_id = ${sourceId}
        and not exists (
          select 1 from ${userFavoritePlayer} t
          where t.user_id = f.user_id and t.player_id = ${targetId}
        )
      returning f.id`);

    // POV videos: same rule against the (game, player, video) unique key.
    const videos = await tx.execute(sql`
      update ${gameVideo} v set player_id = ${targetId}
      where v.player_id = ${sourceId}
        and not exists (
          select 1 from ${gameVideo} t
          where t.game_id = v.game_id and t.player_id = ${targetId}
            and t.youtube_video_id = v.youtube_video_id
        )
      returning v.id`);

    if (source.firstSeenAt < target.firstSeenAt) {
      await tx
        .update(player)
        .set({ firstSeenAt: source.firstSeenAt })
        .where(eq(player.id, targetId));
    }

    await tx.delete(player).where(eq(player.id, sourceId));

    return {
      ok: true,
      targetIplId: target.iplId,
      counts: {
        scorecards: scorecards.length,
        callsigns: sourceCallsigns.length,
        legacyIds: legacyIds.length,
        favorites: favorites.length,
        videos: videos.length,
      },
    };
  });
}
