// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { NextResponse } from "next/server";
import {
  addGameVideo,
  authenticateApiKey,
  getGameBySlug,
  getGameSlugById,
  getGameVideos,
  getScorecardPlayerIdByIplId,
} from "@lfstats/db";
import { revalidatePath } from "next/cache";
import { parseYoutubeLink } from "@/lib/youtube";

// Unlike the rest of /api (unauthenticated GETs), POST here requires an API key.
// Keys are global: any valid key may write for any center.

type PostBody = {
  game_slug?: unknown;
  youtube_url?: unknown;
  ipl_id?: unknown;
  label?: unknown;
  start_seconds?: unknown;
  game_start_offset?: unknown;
  overwrite?: unknown;
};

/** Both offsets are whole non-negative seconds from the start of the video. */
function invalidOffset(value: unknown): boolean {
  return (
    value !== undefined &&
    value !== null &&
    (typeof value !== "number" || !Number.isInteger(value) || value < 0)
  );
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

async function revalidateGamePage(gameId: string, gameType: string) {
  const slug = await getGameSlugById(gameId);
  if (!slug) return;
  revalidatePath(gameType === "lb" ? `/laserball/games/${slug}` : `/games/${slug}`);
}

export async function POST(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }
  const key = await authenticateApiKey(token);
  if (!key) {
    return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const slug = typeof body.game_slug === "string" ? body.game_slug : null;
  const youtubeUrl = typeof body.youtube_url === "string" ? body.youtube_url.trim() : null;
  const iplId = typeof body.ipl_id === "string" && body.ipl_id ? body.ipl_id : null;
  const label = typeof body.label === "string" && body.label ? body.label : null;
  const overwrite = body.overwrite === true;

  if (!slug) {
    return NextResponse.json({ error: "game_slug is required" }, { status: 400 });
  }
  if (!youtubeUrl) {
    return NextResponse.json({ error: "youtube_url is required" }, { status: 400 });
  }

  if (invalidOffset(body.start_seconds)) {
    return NextResponse.json(
      { error: "start_seconds must be a non-negative integer" },
      { status: 400 },
    );
  }
  if (invalidOffset(body.game_start_offset)) {
    return NextResponse.json(
      { error: "game_start_offset must be a non-negative integer" },
      { status: 400 },
    );
  }

  const link = parseYoutubeLink(youtubeUrl);
  if (!link) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  // An explicit start_seconds wins over the URL's own t/start param, so a tool
  // that computes offsets into a long recording doesn't have to build the URL.
  const startSeconds =
    typeof body.start_seconds === "number" ? body.start_seconds || null : link.startSeconds;

  // Unlike start_seconds, 0 is kept: a recording that opens on the starting horn
  // has a game start offset of 0, which is not the same as having none.
  const gameStartOffset =
    typeof body.game_start_offset === "number" ? body.game_start_offset : null;

  // Both offsets run from the video's start, so the gap between them is preroll
  // and can only run forwards — a game starting before playback does is a bug in
  // the caller's arithmetic, not a link worth storing.
  if (gameStartOffset !== null && startSeconds !== null && gameStartOffset < startSeconds) {
    return NextResponse.json(
      { error: "game_start_offset must be greater than or equal to start_seconds" },
      { status: 400 },
    );
  }

  const game = await getGameBySlug(slug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  // A POV video must belong to someone who actually played this game — a plain
  // player lookup would attach footage to a real player who was never there.
  let playerId: string | null = null;
  if (iplId) {
    playerId = await getScorecardPlayerIdByIplId(game.id, game.type, iplId);
    if (!playerId) {
      return NextResponse.json({ error: "Player did not play in this game" }, { status: 404 });
    }
  }

  const { video, created, updated } = await addGameVideo(
    {
      gameId: game.id,
      playerId,
      youtubeUrl,
      youtubeVideoId: link.videoId,
      startSeconds,
      gameStartOffset,
      label,
      source: "api",
      createdByApiKeyId: key.id,
    },
    { overwrite },
  );

  if (created || updated) await revalidateGamePage(game.id, game.type);

  return NextResponse.json(
    {
      id: video.id,
      game_slug: slug,
      ipl_id: iplId,
      youtube_url: video.youtubeUrl,
      start_seconds: video.startSeconds,
      game_start_offset: video.gameStartOffset,
      label: video.label,
      created,
      updated,
    },
    { status: created ? 201 : 200 },
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get("game_slug");
  if (!slug) {
    return NextResponse.json({ error: "game_slug is required" }, { status: 400 });
  }

  const game = await getGameBySlug(slug);
  if (!game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const videos = await getGameVideos(game.id);

  return NextResponse.json({
    data: videos.map((v) => ({
      id: v.id,
      ipl_id: v.iplId,
      callsign: v.callsign,
      youtube_url: v.youtubeUrl,
      youtube_video_id: v.youtubeVideoId,
      start_seconds: v.startSeconds,
      game_start_offset: v.gameStartOffset,
      label: v.label,
      source: v.source,
      created_at: v.createdAt,
    })),
  });
}
