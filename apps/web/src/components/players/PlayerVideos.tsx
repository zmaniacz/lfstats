// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { formatVideoOffset, youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/youtube";
import type { PlayerVideo } from "@lfstats/db";

export function PlayerVideos({ videos }: { videos: PlayerVideo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>POV Videos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="space-y-2">
              <a
                href={youtubeWatchUrl(v.youtubeVideoId, v.startSeconds)}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block overflow-hidden rounded-md border hover:opacity-90 transition-opacity"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={youtubeThumbnailUrl(v.youtubeVideoId)}
                  alt={v.label ?? "POV video thumbnail"}
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                />
                {v.startSeconds !== null && (
                  <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
                    @ {formatVideoOffset(v.startSeconds)}
                  </span>
                )}
              </a>
              <div className="space-y-0.5">
                <p className="text-sm truncate">{v.label ?? "Untitled video"}</p>
                <Link
                  href={
                    v.gameType === "lb" ? `/laserball/games/${v.gameSlug}` : `/games/${v.gameSlug}`
                  }
                  className="block text-xs text-muted-foreground hover:underline"
                >
                  {v.centerName} · {formatDateTime(v.gameStartTime)}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
