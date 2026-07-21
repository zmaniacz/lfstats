// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { LbPossessionBar } from "@/components/laserball/LbPossessionBar";
import { LbTeamScoreboard } from "@/components/laserball/LbTeamScoreboard";
import { haltCaveat, halfLabel } from "@/components/laserball/lb-match-shared";
import { Badge } from "@/components/ui/badge";
import { formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { LbGameDetailTeam, LbMatchDetail } from "@lfstats/db";

type Props = {
  matchDetail: LbMatchDetail;
  gamesById: Map<string, LbGameDetailTeam[]>;
};

export function LbMatchScorecards({ matchDetail, gamesById }: Props) {
  return (
    <div className="space-y-8">
      {matchDetail.halves.map((h) => {
        const teams = gamesById.get(h.gameId) ?? [];
        const caveat = haltCaveat(h.gameOutcome, h.gameExcluded);
        const sides = [
          { label: "Side 1", side: h.side1, team: teams.find((t) => t.id === h.side1.gameTeamId) },
          { label: "Side 2", side: h.side2, team: teams.find((t) => t.id === h.side2.gameTeamId) },
        ];

        return (
          <section key={h.matchGameId} className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">{halfLabel(h.half)}</h2>
              {caveat && <Badge variant="destructive">{caveat}</Badge>}
            </div>

            {sides.map(({ label, side, team }) => {
              const color = getTeamColor(side.colourEnum);
              return (
                <section key={label} className="space-y-0">
                  <div
                    className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${color?.text ?? ""}`}>{label}</span>
                      {team?.result === "win" && <Badge variant="default">Win</Badge>}
                      {team?.result === "loss" && <Badge variant="secondary">Loss</Badge>}
                      {team?.result === "draw" && <Badge variant="secondary">Draw</Badge>}
                    </div>
                    <span className="tabular-nums font-semibold">
                      {formatScore(side.score ?? 0)}
                    </span>
                  </div>
                  {team ? (
                    <LbTeamScoreboard team={{ ...team, name: label }} />
                  ) : (
                    <p className="text-sm text-muted-foreground px-4 py-3">Roster unavailable</p>
                  )}
                </section>
              );
            })}

            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Possession
              </h3>
              <LbPossessionBar
                teams={sides.map(({ label, side, team }) => ({
                  name: label,
                  colourEnum: side.colourEnum,
                  possessionMs: team?.players.reduce((sum, p) => sum + p.possessionTimeMs, 0) ?? 0,
                }))}
              />
            </section>
          </section>
        );
      })}
    </div>
  );
}
