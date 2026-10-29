// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import {
  getCompetitionBySlug,
  getCompetitionPlayerStats,
  getLbCompetitionPlayerStats,
} from "@lfstats/db";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const comp = await getCompetitionBySlug(slug);
  if (!comp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Laserball has its own stats; the SM5 query would list every player with no games.
  if (comp.gameType === "lb") {
    const players = await getLbCompetitionPlayerStats(comp.id);
    return NextResponse.json({
      [slug]: players.map((p) => ({
        ipl_id: p.iplId,
        player_name: p.callsign,
        team_name: p.teamName,
        games_played: p.gamesPlayed,
        goals: p.goals,
        assists: p.assists,
        steals: p.steals,
        blocks: p.blocks,
        passes: p.passes,
        clears: p.clears,
        possession_ms: p.possessionMs,
      })),
    });
  }

  const data = await getCompetitionPlayerStats(slug);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
