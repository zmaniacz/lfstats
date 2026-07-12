// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGamesForExport, getCenterBySlug } from "@lfstats/db";
import { getTdfArchiveUrl } from "@/lib/tdf";

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 10);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const defaults = defaultDateRange();

  const startDate = searchParams.get("start_date") ?? defaults.start;
  const endDate = searchParams.get("end_date") ?? defaults.end;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Invalid start_date or end_date" }, { status: 400 });
  }

  const gameTypeRaw = searchParams.get("game_type");
  if (gameTypeRaw && gameTypeRaw !== "sm5" && gameTypeRaw !== "lb") {
    return NextResponse.json({ error: "game_type must be 'sm5' or 'lb'" }, { status: 400 });
  }
  const gameType = (gameTypeRaw ?? undefined) as "sm5" | "lb" | undefined;

  let centerId: string | undefined;
  const centerSlug = searchParams.get("center");
  if (centerSlug) {
    const center = await getCenterBySlug(centerSlug);
    if (!center) {
      return NextResponse.json({ error: "Unknown center slug" }, { status: 400 });
    }
    centerId = center.id;
  }

  const games = await getGamesForExport({
    startDate,
    endDate,
    gameType,
    centerId,
  });

  const data = games.map((g) => ({
    center_slug: g.centerSlug,
    timestamp: g.startTime,
    game_type: g.gameType,
    tdf_url: getTdfArchiveUrl(g.tdfFilename),
  }));

  return NextResponse.json({ data });
}
