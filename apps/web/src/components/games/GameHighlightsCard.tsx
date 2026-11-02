// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import type { GameHighlight } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMs } from "@/lib/format";
import { describeHighlight, HIGHLIGHT_LABELS } from "@/lib/highlights";

export function GameHighlightsCard({
  slug,
  highlights,
}: {
  slug: string;
  highlights: GameHighlight[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Highlights</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {highlights.map((h) => (
            <li key={h.id}>
              <Link
                href={`/games/${slug}?tab=replay&t=${h.time}`}
                scroll={false}
                className="flex flex-wrap items-center gap-2 text-sm hover:underline"
              >
                <span className="tabular-nums text-xs text-muted-foreground w-10">
                  {formatMs(h.time)}
                </span>
                <Badge variant="secondary">{HIGHLIGHT_LABELS[h.category]}</Badge>
                <span>{describeHighlight(h)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
