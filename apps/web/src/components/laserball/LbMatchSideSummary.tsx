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
    <div className="rounded-lg border divide-y overflow-hidden">
      {sides.map(({ side, total, label }) => {
        const isWinner = matchDetail.winnerSide === side;
        return (
          <div
            key={side}
            className={`flex items-center gap-4 px-5 py-4 border-l-4 ${
              isWinner ? "border-l-primary bg-primary/5" : "border-l-transparent"
            }`}
          >
            <span className="text-xl font-semibold">{label}</span>
            <span className="text-3xl font-extrabold tabular-nums leading-none">
              {formatScore(total)}
            </span>
            {isWinner && <Badge variant="default">Winner</Badge>}
            {matchDetail.winnerSide === "draw" && <Badge variant="secondary">Draw</Badge>}
          </div>
        );
      })}
    </div>
  );
}
