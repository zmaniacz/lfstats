// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGameBySlug, getLbGameReplayData } from "@lfstats/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either the internal uuid (what LbReplayTab sends) or the public game
// slug, like the SM5 replay route. Anything else must not reach
// `game.id = ...`, where Postgres rejects the uuid cast with a 500.
export async function GET(_req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId: segment } = await params;

  let gameId: string | null = null;
  if (UUID_RE.test(segment)) {
    gameId = segment;
  } else {
    const row = await getGameBySlug(segment);
    // getGameBySlug resolves every game type; only Laserball games belong here.
    if (row?.type === "lb") gameId = row.id;
  }

  const data = gameId ? await getLbGameReplayData(gameId) : null;
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
