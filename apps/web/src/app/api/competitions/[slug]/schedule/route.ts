// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import {
  getCompetitionBySlug,
  getCompetitionSchedule,
  getLbCompetitionSchedule,
} from "@lfstats/db";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const comp = await getCompetitionBySlug(slug);
  if (!comp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // A Laserball match is played as halves of an lb_match, not SM5 game slots.
  if (comp.gameType === "lb") return NextResponse.json(await getLbCompetitionSchedule(comp.id));

  const data = await getCompetitionSchedule(slug);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
