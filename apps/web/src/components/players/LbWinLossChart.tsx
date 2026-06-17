// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { LbPlayerWinLoss } from "@lfstats/db";
import { Cell, Pie, PieChart } from "recharts";

const chartConfig: ChartConfig = {
  wins: { label: "Wins", color: "var(--chart-5)" },
  losses: { label: "Losses", color: "var(--chart-1)" },
  draws: { label: "Draws", color: "var(--chart-3)" },
};

export function LbWinLossChart({ data }: { data: LbPlayerWinLoss }) {
  const total = data.wins + data.losses + data.draws;
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">No laserball games in this view.</p>;
  }

  const slices = [
    { key: "wins", label: "Wins", value: data.wins, fill: "var(--color-wins)" },
    { key: "losses", label: "Losses", value: data.losses, fill: "var(--color-losses)" },
    { key: "draws", label: "Draws", value: data.draws, fill: "var(--color-draws)" },
  ].filter((s) => s.value > 0);

  const winPct = ((data.wins / total) * 100).toFixed(1);

  return (
    <div className="space-y-2">
      <ChartContainer config={chartConfig} className="aspect-auto h-72">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="key"
            cx="50%"
            cy="50%"
            outerRadius={100}
            isAnimationActive={false}
            label={({ payload, value }) =>
              `${(payload as { label: string }).label}: ${value as number}`
            }
            labelLine={false}
          >
            {slices.map((s) => (
              <Cell key={s.key} fill={s.fill} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="key" />} />
        </PieChart>
      </ChartContainer>
      <p className="text-center text-sm text-muted-foreground">
        {data.wins}–{data.losses}
        {data.draws > 0 ? `–${data.draws}` : ""} · {winPct}% win rate · {total} games
      </p>
    </div>
  );
}
