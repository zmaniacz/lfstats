// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { YoutubeEmbed } from "@/components/video/YoutubeEmbed";
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
              <YoutubeEmbed
                videoId={v.youtubeVideoId}
                startSeconds={v.startSeconds}
                label={v.label}
              />
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
