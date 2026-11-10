// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { RANKINGS_LIMITS, type RankingsRequest } from "../../schemas/query-api";
import { getGlobalRankings } from "../ratings";
import { siteUrl } from "./games";

// POST /rankings (docs/Query_API_Spec.md): the global SM5 player ranking, the same board as
// the site's /rankings page and read through the same function. The rating is precomputed
// over a rolling window and cannot be scoped; see docs/Player_Rating.md.

const date = (d: Date) => d.toISOString().slice(0, 10);

export async function getRankings(req: RankingsRequest) {
  const limit = req.limit ?? RANKINGS_LIMITS.default_limit;
  const offset = req.offset ?? 0;
  const webUrl = `${siteUrl()}/rankings`;

  const board = await getGlobalRankings(offset + limit + 1);
  if (!board) {
    return {
      data: [],
      meta: {
        row_count: 0,
        truncated: false,
        warnings: ["No ranking has been computed yet."],
        web_url: webUrl,
      },
    };
  }

  const page = board.rows.slice(offset, offset + limit);
  return {
    data: page.map((r) => ({
      rank: r.rank,
      ipl_id: r.iplId,
      callsign: r.callsign.trim(),
      rating: r.rating,
      standard_error: r.standardError,
      // Players in the same group are too close for the model to separate with confidence.
      rating_group: r.ratingGroup,
      games_played: r.gamesPlayed,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
    })),
    meta: {
      // Everyone who met the games minimum inside the window, not just this page.
      ranked_players: board.qualifiedPlayers,
      offset,
      window_start: date(board.windowStart),
      window_end: date(board.windowEnd),
      computed_at: board.computedAt.toISOString().slice(0, 19),
      model_version: board.modelVersion,
      row_count: page.length,
      truncated: board.rows.length > offset + limit,
      warnings: [
        "The rating is global: it covers SM5 games inside the window at every center and cannot be filtered by center, position or competition. Use leaderboard for scoped rankings by a metric.",
      ],
      web_url: webUrl,
    },
  };
}
