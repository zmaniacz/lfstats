// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { LbPossessionBar } from "@/components/laserball/LbPossessionBar";
import { LbTeamScoreboard } from "@/components/laserball/LbTeamScoreboard";
import { combineSidePlayers } from "@/components/laserball/lb-match-combine";
import { getTeamColor } from "@/lib/team-colors";
import type { LbGameDetailTeam, LbMatchDetail } from "@lfstats/db";

type Props = {
  matchDetail: LbMatchDetail;
  gamesById: Map<string, LbGameDetailTeam[]>;
  // The competition teams playing Side 1 and Side 2, when the match fills a competition match.
  sideNames?: [string, string];
};

export function LbMatchCombinedScoreboard({ matchDetail, gamesById, sideNames }: Props) {
  // "Whatever color each side played as first" — halves are ordered by
  // `half` ascending, so halves[0] is always the earliest game played.
  const firstHalf = matchDetail.halves[0]!;
  const sides = [
    {
      label: sideNames?.[0] ?? "Side 1",
      colourEnum: firstHalf.side1.colourEnum,
      players: combineSidePlayers(matchDetail, gamesById, "side1"),
    },
    {
      label: sideNames?.[1] ?? "Side 2",
      colourEnum: firstHalf.side2.colourEnum,
      players: combineSidePlayers(matchDetail, gamesById, "side2"),
    },
  ];

  return (
    <div className="space-y-6">
      {sides.map(({ label, colourEnum, players }) => {
        const color = getTeamColor(colourEnum);
        return (
          <section key={label} className="space-y-0">
            <div
              className={`flex items-center px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
            >
              <span className={`font-bold text-lg ${color?.text ?? ""}`}>{label}</span>
            </div>
            <LbTeamScoreboard
              team={{
                id: label,
                tdfTeamIndex: 0,
                name: label,
                colourEnum,
                score: null,
                result: null,
                players,
              }}
            />
          </section>
        );
      })}

      <section className="space-y-1.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Possession
        </h2>
        <LbPossessionBar
          teams={sides.map(({ label, colourEnum, players }) => ({
            name: label,
            colourEnum,
            possessionMs: players.reduce((sum, p) => sum + p.possessionTimeMs, 0),
          }))}
        />
      </section>
    </div>
  );
}
