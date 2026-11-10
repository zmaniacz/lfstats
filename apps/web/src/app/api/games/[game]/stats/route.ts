// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { GameDetailRequestSchema, getGameDetail } from "@lfstats/db/analytics";
import { publicRead, queryParams } from "@/lib/query-api/public";

// GET /api/games/[slug]/stats — one game with every player's stats, penalties, tags, videos
// and highlights. The roster-only sibling is GET /api/games/[slug]. See docs/API.md.
export async function GET(request: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const input = { include_highlights: "true", ...queryParams(request) };
  return publicRead("game_stats", GameDetailRequestSchema, input, async (parsed) => {
    const { data, meta } = await getGameDetail(game, parsed);
    return { ...data, warnings: meta.warnings };
  });
}
