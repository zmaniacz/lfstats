// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import {
  getPlayerStats,
  localToday,
  PlayerStatsRequestSchema,
  resolvePlayer,
  siteUrl,
} from "@lfstats/db/analytics";
import { publicRead } from "@/lib/query-api/public";

// GET /api/players/[iplId] — one player's profile: identity, previous callsigns, career
// stats overall and by position, and global rating. See docs/API.md.
//
// `iplId` is the IPL id with or without its '#', matching the /players/[iplId] page. A
// callsign is not accepted: this route never guesses between players.
export async function GET(request: Request, { params }: { params: Promise<{ iplId: string }> }) {
  const { iplId } = await params;
  const id = `#${decodeURIComponent(iplId).replace(/^#/, "")}`;
  const gameType = new URL(request.url).searchParams.get("game_type") ?? "sm5";
  if (gameType !== "sm5" && gameType !== "lb") {
    return NextResponse.json({ error: "game_type must be 'sm5' or 'lb'." }, { status: 400 });
  }

  const input = {
    players: [id],
    scope: { game_type: gameType },
    include_baseline: false,
    ...(gameType === "sm5" && { breakdown: ["position"] }),
  };
  return publicRead("player", PlayerStatsRequestSchema, input, async (parsed) => {
    const [found, stats] = await Promise.all([
      resolvePlayer(id),
      getPlayerStats(parsed, localToday()),
    ]);
    const match = found.matches[0];
    const player = stats.data.players[0];
    if (!match || !player) throw new Error(`player ${id} resolved but returned no stats`);
    return {
      ipl_id: match.ipl_id,
      member_id: match.member_id,
      callsign: match.callsign,
      previous_callsigns: match.previous_callsigns,
      home_center: match.home_center,
      // Both game types, non-excluded; `overall.games` below is this game type only.
      games_played: match.games_played,
      last_played: match.last_played,
      game_type: gameType,
      overall: player.overall,
      ...(gameType === "sm5" && { by_position: player.breakdown ?? [], rating: player.rating }),
      web_url: `${siteUrl()}/players/${match.ipl_id.replace(/^#/, "")}`,
    };
  });
}
