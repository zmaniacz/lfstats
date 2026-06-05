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
import { getMvpComponentLabel } from "@/lib/mvp-components";
import { POSITIONS } from "@/lib/positions";
import type { MvpComponentItem } from "@lfstats/db";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  data: MvpComponentItem[];
};

const COMPONENT_COLORS: Record<string, string> = {
  accuracy: "#3b82f6",
  score_bonus: "#22c55e",
  shots_hit_opponent_medic: "#f97316",
  shots_hit_team_medic: "#ef4444",
  missiles_hit_opponent: "#8b5cf6",
  nukes_detonated: "#eab308",
  nukes_canceled_by_opponent: "#dc2626",
  nukes_canceled: "#06b6d4",
  team_nukes_canceled: "#f43f5e",
  shots_hit_opponent_3hit: "#a855f7",
  ammo_boost: "#10b981",
  life_boost: "#14b8a6",
  survival_bonus: "#84cc16",
  elimination_bonus: "#f59e0b",
  eliminated: "#64748b",
  times_hit_by_missile: "#94a3b8",
};

const FALLBACK_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#d946ef", "#fb923c"];

export function MvpComponentsChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No MVP component data available.
      </p>
    );
  }

  const allComponents = [...new Set(data.map((d) => d.component))];

  const chartConfig: ChartConfig = Object.fromEntries(
    allComponents.map((component, i) => [
      component,
      {
        label: getMvpComponentLabel(component),
        color:
          COMPONENT_COLORS[component] ??
          FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      },
    ]),
  );

  const pivoted = ([1, 2, 3, 4, 5] as const)
    .map((pos) => {
      const posData = data.filter((d) => d.position === pos);
      if (posData.length === 0) return null;
      const row: Record<string, string | number> = {
        position: POSITIONS[pos]?.label ?? String(pos),
      };
      for (const item of posData) {
        if (parseFloat(item.avgPoints.toFixed(3)) !== 0)
          row[item.component] = parseFloat(item.avgPoints.toFixed(3));
      }
      return row;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80">
      <BarChart
        layout="vertical"
        data={pivoted}
        margin={{ top: 8, right: 24, left: 80, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
        <YAxis
          type="category"
          dataKey="position"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <XAxis
          type="number"
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v.toFixed(1)}
          domain={[0, "dataMax"]}
        />
        {allComponents.map((component) => (
          <Bar
            key={component}
            dataKey={component}
            stackId="mvp"
            fill={`var(--color-${component})`}
          />
        ))}
        <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
        <ChartLegend content={<ChartLegendContent />} />
        <ChartTooltip content={<ChartTooltipContent />} />
      </BarChart>
    </ChartContainer>
  );
}
