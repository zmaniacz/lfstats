// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// YouTube video ids are 11 chars of [A-Za-z0-9_-].
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

// YouTube start offsets are either bare seconds ("90", "90s") or a duration
// ("1h02m03s", "2m30s", "1h30m") — the form its own share dialog produces.
const DURATION_PATTERN = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/;

export type ParsedYoutubeLink = {
  videoId: string;
  /** Offset in whole seconds from the t/start param, or null if the URL has none. */
  startSeconds: number | null;
};

/**
 * Parses a start offset in either of YouTube's accepted forms. Returns null for
 * anything unrecognised or non-positive — a bad offset degrades to "no offset"
 * rather than rejecting an otherwise valid video URL.
 */
function parseStartSeconds(raw: string | null): number | null {
  if (!raw) return null;

  const value = raw.trim().toLowerCase();
  if (/^\d+$/.test(value)) {
    const seconds = parseInt(value, 10);
    return seconds > 0 ? seconds : null;
  }

  const match = DURATION_PATTERN.exec(value);
  if (!match) return null;

  const [, h, m, s] = match;
  if (h === undefined && m === undefined && s === undefined) return null;

  const seconds =
    parseInt(h ?? "0", 10) * 3600 + parseInt(m ?? "0", 10) * 60 + parseInt(s ?? "0", 10);
  return seconds > 0 ? seconds : null;
}

/**
 * Extracts the video id and any start offset from a YouTube URL, or null if the
 * URL isn't one we recognise. Both the admin server actions and the public API
 * route validate with this — an unparseable URL is rejected rather than stored.
 *
 * Handles youtu.be/ID, /watch?v=ID, /shorts/ID, /embed/ID, and /live/ID, with
 * the offset from `?t=`, `?start=`, or a legacy `#t=` fragment.
 */
export function parseYoutubeLink(url: string): ParsedYoutubeLink | null {
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

  const hashOffset = parsed.hash.startsWith("#t=") ? parsed.hash.slice(3) : null;
  const startSeconds =
    parseStartSeconds(parsed.searchParams.get("t")) ??
    parseStartSeconds(parsed.searchParams.get("start")) ??
    parseStartSeconds(hashOffset);

  return { videoId: candidate, startSeconds };
}

/** Convenience wrapper for callers that only need to validate the URL. */
export function parseYoutubeVideoId(url: string): string | null {
  return parseYoutubeLink(url)?.videoId ?? null;
}

export function youtubeWatchUrl(videoId: string, startSeconds?: number | null): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return startSeconds ? `${base}&t=${startSeconds}s` : base;
}

/** `1:30` under an hour, `1:02:03` past it — matches YouTube's own labelling. */
export function formatVideoOffset(startSeconds: number): string {
  const hours = Math.floor(startSeconds / 3600);
  const minutes = Math.floor((startSeconds % 3600) / 60);
  const seconds = startSeconds % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours > 0 ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
