// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// YouTube video ids are 11 chars of [A-Za-z0-9_-].
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the video id from a YouTube URL, or null if the URL isn't one we
 * recognise. Both the admin server actions and the public API route validate
 * with this — an unparseable URL is rejected rather than stored.
 *
 * Handles youtu.be/ID, /watch?v=ID, /shorts/ID, /embed/ID, and /live/ID.
 */
export function parseYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  let candidate: string | undefined;

  if (host === "youtu.be") {
    candidate = segments[0];
  } else if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (segments[0] === "watch") {
      candidate = parsed.searchParams.get("v") ?? undefined;
    } else if (segments[0] === "shorts" || segments[0] === "embed" || segments[0] === "live") {
      candidate = segments[1];
    }
  }

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) return null;
  return candidate;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
