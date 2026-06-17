// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { LbTeamScoreboard } from "@/components/laserball/LbTeamScoreboard";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatGameName, formatMs, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { getLbGameDetailBySlug } from "@lfstats/db";
import { notFound } from "next/navigation";

export default async function LaserballGameDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getLbGameDetailBySlug(slug);
  if (!game) notFound();

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{formatGameName(game.description, game.startTime)}</h1>
        <p className="text-muted-foreground text-sm">
          {game.centerName} · {formatDateTime(game.startTime)} · {formatMs(game.actualDuration)}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="capitalize">
            {game.outcome}
          </Badge>
          {game.exclude && <Badge variant="destructive">Excluded from Stats</Badge>}
        </div>
      </div>

      {game.teams.map((team) => {
        const color = getTeamColor(team.colourEnum);
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
              </div>
              <span className="tabular-nums font-semibold">{formatScore(team.score ?? 0)}</span>
            </div>
            <LbTeamScoreboard team={team} />
          </section>
        );
      })}
    </div>
  );
}
