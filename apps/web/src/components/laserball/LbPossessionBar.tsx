// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { formatMs } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";

export type LbPossessionTeam = {
  name: string;
  colourEnum: number;
  possessionMs: number;
};

// Overall ball-possession share between the two competing teams: a single
// proportional bar plus each team's percentage and time.
export function LbPossessionBar({ teams }: { teams: LbPossessionTeam[] }) {
  if (teams.length < 2) return null;
  const total = teams.reduce((sum, t) => sum + t.possessionMs, 0);
  if (total === 0) return null;

  const pct = teams.map((t) => (t.possessionMs / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        {teams.map((team, i) => {
          const color = getTeamColor(team.colourEnum);
          return (
            <div key={i} className={i === 0 ? "text-left" : "text-right"}>
              <span className={`font-semibold ${color?.text ?? ""}`}>{Math.round(pct[i]!)}%</span>
              <span className="text-muted-foreground tabular-nums ml-1.5">
                {formatMs(team.possessionMs)}
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Possession: ${teams[0]!.name} ${Math.round(pct[0]!)}%, ${teams[1]!.name} ${Math.round(pct[1]!)}%`}
      >
        {teams.map((team, i) => (
          <div
            key={i}
            style={{
              width: `${pct[i]!.toFixed(2)}%`,
              backgroundColor: getTeamColor(team.colourEnum)?.hex,
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{teams[0]!.name}</span>
        <span>{teams[1]!.name}</span>
      </div>
    </div>
  );
}
