// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { formatVideoOffset, youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/youtube";

type Props = {
  videoId: string;
  /** Offset the player seeks to on load; null starts at the beginning. */
  startSeconds: number | null;
  /** Used for the iframe title and the thumbnail alt text. */
  label: string | null;
};

/**
 * Click-to-load YouTube embed. The player only mounts once the user asks for
 * it, so a game with several videos — or a profile with a season of POV footage
 * — costs one thumbnail image each on load instead of a full YouTube player.
 * That is also why autoplay is set: by the time the iframe exists the click has
 * already happened, and a second click to start would be a regression.
 */
export function YoutubeEmbed({ videoId, startSeconds, label }: Props) {
  const [active, setActive] = useState(false);

  if (active) {
    return (
      <div className="aspect-video overflow-hidden rounded-md border">
        <iframe
          src={youtubeEmbedUrl(videoId, startSeconds, { autoplay: true })}
          title={label ?? "Game video"}
          className="h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setActive(true)}
      aria-label={`Play ${label ?? "video"}`}
      className="group relative block w-full overflow-hidden rounded-md border transition-opacity hover:opacity-95"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={youtubeThumbnailUrl(videoId)}
        alt={label ?? "Video thumbnail"}
        className="aspect-video w-full object-cover"
        loading="lazy"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/70 transition-colors group-hover:bg-black/85">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 fill-white" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </span>
      {startSeconds !== null && (
        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
          @ {formatVideoOffset(startSeconds)}
        </span>
      )}
    </button>
  );
}
