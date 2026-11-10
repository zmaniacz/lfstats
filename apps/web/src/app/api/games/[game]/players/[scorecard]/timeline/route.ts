// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGameBySlug, getPlayerTimeline, getSm5ScorecardIdByIplId } from "@lfstats/db";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Both segments take either form: the internal uuids the game page sends, or the public
// identifiers an outside client has — the game slug and the player's IPL id (with or
// without its '#'). Guests have no IPL id, so they are reachable by scorecard uuid only.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ game: string; scorecard: string }> },
) {
  const { game, scorecard } = await params;
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

  let gameId: string | null = null;
  if (UUID_RE.test(game)) {
    gameId = game;
  } else {
    const row = await getGameBySlug(game);
    // Timelines exist for SM5 games only.
    if (row?.type === "sm5") gameId = row.id;
  }
  if (!gameId) return notFound();

  const scorecardId = UUID_RE.test(scorecard)
    ? scorecard
    : await getSm5ScorecardIdByIplId(gameId, `#${decodeURIComponent(scorecard).replace(/^#/, "")}`);
  if (!scorecardId) return notFound();

  const data = await getPlayerTimeline(gameId, scorecardId);
  if (!data) return notFound();
  return NextResponse.json(data);
}
