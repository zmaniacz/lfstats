// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import { getGameSummaryBySlug } from "@lfstats/db";
import { formatDateIso, formatMs, formatTimeOfDay } from "@/lib/format";
import { getTdfArchiveUrl } from "@/lib/tdf";

export async function GET(_req: Request, { params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const summary = await getGameSummaryBySlug(game);
  if (!summary) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    game_slug: summary.slug,
    game_type: summary.gameType,
    tdf_url: getTdfArchiveUrl(summary.tdfFilename),
    start_date: formatDateIso(summary.startTime),
    start_time: formatTimeOfDay(summary.startTime),
    scheduled_length: formatMs(summary.scheduledDuration),
    actual_length: formatMs(summary.actualDuration),
    center_slug: summary.centerSlug,
    center_name: summary.centerName,
    teams: summary.teams.map((t) => ({
      name: t.name,
      colour_enum: t.colourEnum,
      is_neutral: t.isNeutral,
      players: t.players.map((p) => ({
        ipl_id: p.iplId,
        codename: p.callsign,
      })),
    })),
    targets: summary.targets.map((t) => ({
      entity_id: t.entityId,
      codename: t.name,
      type: t.type,
      team: t.teamName,
    })),
    referees: summary.referees.map((r) => ({
      ipl_id: r.iplId,
      entity_id: r.entityId,
      codename: r.callsign,
    })),
  });
}
