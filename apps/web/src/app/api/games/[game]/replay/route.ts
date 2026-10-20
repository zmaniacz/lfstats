// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGameBySlug, getGameReplayData } from "@lfstats/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either the internal uuid (what ReplayTab sends) or the public game
// slug, matching its sibling `GET /api/games/[game]`. Anything else must not
// reach `game.id = ...`, where Postgres rejects the uuid cast with a 500.
export async function GET(_req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;

  let gameId: string | null = null;
  if (UUID_RE.test(game)) {
    gameId = game;
  } else {
    const row = await getGameBySlug(game);
    // getGameBySlug resolves every game type; replay data only exists for SM5.
    if (row?.type === "sm5") gameId = row.id;
  }

  const data = gameId ? await getGameReplayData(gameId) : null;
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
