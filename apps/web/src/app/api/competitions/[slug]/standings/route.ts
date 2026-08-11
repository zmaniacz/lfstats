// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import {
  getCompetitionBySlug,
  getCompetitionStandingsData,
  getSoloCompetitionStandingsData,
} from "@lfstats/db";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const comp = await getCompetitionBySlug(slug);
  if (!comp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Solo competitions have no matches, so the team standings query would always be empty.
  const data =
    comp.format === "solo"
      ? await getSoloCompetitionStandingsData(slug)
      : await getCompetitionStandingsData(slug);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
