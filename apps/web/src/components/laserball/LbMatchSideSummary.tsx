// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Badge } from "@/components/ui/badge";
import { formatScore } from "@/lib/format";
import type { LbMatchDetail } from "@lfstats/db";

export function LbMatchSideSummary({ matchDetail }: { matchDetail: LbMatchDetail }) {
  const sides = [
    { side: 1 as const, total: matchDetail.side1TotalScore, label: "Side 1" },
    { side: 2 as const, total: matchDetail.side2TotalScore, label: "Side 2" },
  ];

  return (
    <div className="space-y-1.5">
      {sides.map(({ side, total, label }) => {
        const isWinner = matchDetail.winnerSide === side;
        return (
          <div
            key={side}
            className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-md bg-muted/40"
          >
            <div className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{label}</span>
              {isWinner && <Badge variant="default">Winner</Badge>}
              {matchDetail.winnerSide === "draw" && <Badge variant="secondary">Draw</Badge>}
            </div>
            <span className="tabular-nums font-semibold">{formatScore(total)}</span>
          </div>
        );
      })}
    </div>
  );
}
