// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getPlayerTimeline } from "@lfstats/db";

// Like its sibling replay route, `game` is the internal uuid here, not the slug.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ game: string; scorecard: string }> },
) {
  const { game, scorecard } = await params;
  const data = await getPlayerTimeline(game, scorecard);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
