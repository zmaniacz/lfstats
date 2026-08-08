// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGameReplayData } from "@lfstats/db";

// The segment is named `game` because its sibling `GET /api/games/[game]`
// addresses a game by slug; here it is still the internal uuid.
export async function GET(_req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const data = await getGameReplayData(game);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
