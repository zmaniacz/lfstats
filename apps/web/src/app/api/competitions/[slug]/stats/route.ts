// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { signPlayerPictureUrls } from "@/lib/player-picture-storage";
import {
  authenticateApiKey,
  getCompetitionBySlug,
  getCompetitionPlayerStats,
  getLbCompetitionPlayerStats,
} from "@lfstats/db";

// The stats themselves are public. Player pictures are not: `player_picture_url` is filled in
// (with short-lived signed URLs) only for an API key holding `picture:read`, and is null for
// everyone else.
async function pictureAccess(
  request: Request,
): Promise<{ ok: true; withPictures: boolean } | { ok: false; response: NextResponse }> {
  const header = request.headers.get("authorization");
  if (header === null) return { ok: true, withPictures: false };

  // A key that was sent but is wrong is an error, not a silent downgrade to the public
  // response: the caller would otherwise just see pictures vanish with no explanation.
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const key = token ? await authenticateApiKey(token) : null;
  if (!key) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 }),
    };
  }
  return { ok: true, withPictures: key.scopes.includes("picture:read") };
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const trusted = await pictureAccess(request);
  if (!trusted.ok) return trusted.response;

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

  const data = await getCompetitionPlayerStats(
    slug,
    trusted.withPictures ? signPlayerPictureUrls : undefined,
  );
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(
    data,
    // Signed picture URLs are for this caller only; no shared cache may keep them.
    trusted.withPictures ? { headers: { "Cache-Control": "private, no-store" } } : undefined,
  );
}
