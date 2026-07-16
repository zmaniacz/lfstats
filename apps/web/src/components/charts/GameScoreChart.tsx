// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMs, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { ScorePoint } from "@/lib/game-momentum-series";
import type { MomentumTeam } from "@lfstats/db";

type Props = {
  series: ScorePoint[];
  duration: number;
  teamA: MomentumTeam;
  teamB: MomentumTeam;
};

export function GameScoreChart({ series, duration, teamA, teamB }: Props) {
  if (series.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough score data for this game.</p>;
  }

  const teamAColor = getTeamColor(teamA.colourEnum)?.hex ?? "#6b7280";
  const teamBColor = getTeamColor(teamB.colourEnum)?.hex ?? "#6b7280";

  const chartConfig = {
    teamAScore: { label: teamA.teamName, color: teamAColor },
    teamBScore: { label: teamB.teamName, color: teamBColor },
  } satisfies ChartConfig;

  // Recharts pads its auto-generated Y ticks below the domain min (e.g. a
  // spurious "-9,500" tick above a 0 floor), so compute clean round ticks
  // ourselves instead of trusting its default nice-tick algorithm.
  const maxScore = Math.max(0, ...series.flatMap((p) => [p.teamAScore, p.teamBScore]));
  const step = Math.ceil((maxScore || 1) / 4 / 1000) * 1000;
  const yMax = step * 4;
  const yTicks = [0, step, step * 2, step * 3, yMax];

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-60">
      <LineChart data={series} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis
          dataKey="time"
          type="number"
          domain={[0, duration]}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => formatMs(v)}
        />
        <YAxis
          domain={[0, yMax]}
          ticks={yTicks}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => formatScore(v)}
          width={48}
        />
        <ChartTooltip
          isAnimationActive={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => formatMs(Number(payload?.[0]?.payload?.time ?? 0))}
              formatter={(value, name) => (
                <div className="flex flex-1 justify-between items-center leading-none">
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums ml-4">
                    {formatScore(typeof value === "number" ? value : null)}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="stepAfter"
          dataKey="teamAScore"
          stroke={teamAColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="stepAfter"
          dataKey="teamBScore"
          stroke={teamBColor}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
