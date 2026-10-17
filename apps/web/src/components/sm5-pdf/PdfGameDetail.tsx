// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { PdfTeamStatsTable } from "@/components/sm5-pdf/PdfTeamStatsTable";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatGameName, formatMs, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { PdfGameDetail as PdfGameDetailData } from "@lfstats/db";
import { Info } from "lucide-react";

/**
 * A legacy PDF-era game: end-of-game scorecards only, so there is no momentum, replay or
 * timeline, and nothing here is editable yet.
 */
export function PdfGameDetail({ game }: { game: PdfGameDetailData }) {
  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{formatGameName(game.description, game.startTime)}</h1>
        <p className="text-muted-foreground text-sm">
          {game.centerName} · {formatDateTime(game.startTime)} · {formatMs(game.actualDuration)}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary">Legacy scorecard</Badge>
          {game.exclude && <Badge variant="destructive">Excluded from Stats</Badge>}
        </div>
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground max-w-3xl">
          <Info className="size-4 mt-0.5 shrink-0" />
          <p>
            Imported from a printed scorecard, so only the end-of-game totals exist. There is no
            replay or timeline, MVP uses the legacy formula, and these games don't count toward
            career stats or the player rating.
          </p>
        </div>
      </div>

      {game.teams.map((team) => {
        const color = getTeamColor(team.colourEnum);
        const total = team.score + team.eliminationBonus + team.penaltyScore;
        const teamPenalties = team.penalties.filter((p) => !p.rescinded);
        return (
          <section key={team.id} className="space-y-0">
            <div
              className={`flex items-center justify-between px-4 py-2 border-l-4 ${color?.border ?? "border-border"} bg-muted/40 rounded-tr-md`}
            >
              <div className="flex items-center gap-2">
                <span className={`font-bold text-lg ${color?.text ?? ""}`}>{team.name}</span>
                {team.result === "win" && <Badge variant="default">Win</Badge>}
                {team.result === "loss" && <Badge variant="secondary">Loss</Badge>}
                {team.result === "draw" && <Badge variant="secondary">Draw</Badge>}
                {team.eliminated && (
                  <Badge variant="destructive" className="text-xs px-1 py-0">
                    ELIMINATED
                  </Badge>
                )}
              </div>
              <span className="tabular-nums font-semibold">
                {formatScore(total)}
                {team.eliminationBonus > 0 && (
                  <span className="text-muted-foreground font-normal ml-1">
                    ({formatScore(team.eliminationBonus)})
                  </span>
                )}
                {team.penaltyScore < 0 && (
                  <span className="text-destructive font-normal ml-1">
                    ({formatScore(team.penaltyScore)} pen)
                  </span>
                )}
              </span>
            </div>
            {teamPenalties.length > 0 && (
              <ul className="px-4 py-2 border-l-4 border-transparent text-sm text-muted-foreground">
                {teamPenalties.map((p) => (
                  <li key={p.id}>
                    Team penalty — {p.type}: {formatScore(p.scoreValue)}
                  </li>
                ))}
              </ul>
            )}
            <PdfTeamStatsTable team={team} />
          </section>
        );
      })}
    </div>
  );
}
