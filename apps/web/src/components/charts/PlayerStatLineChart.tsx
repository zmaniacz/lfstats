// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { MultiSelectFilter } from "@/components/filters/MultiSelectFilter";
import { POSITIONS } from "@/lib/positions";
import { formatMVP, formatScore, formatPct, formatHitDiff } from "@/lib/format";
import { smoothStatSeries, type PlayerStatPoint } from "@/lib/player-stat-series";

const POSITION_KEYS = ["pos1", "pos2", "pos3", "pos4", "pos5"] as const;

const FORMATTERS = {
  mvp: formatMVP,
  score: formatScore,
  pct: formatPct,
  hitDiff: formatHitDiff,
} as const;

type ValueFormat = keyof typeof FORMATTERS;

// --position-* tokens (globals.css) are fixed, non-theme-aware colors chosen for
// distinguishability across 6 simultaneous lines — deliberately not the shared
// --chart-N tokens, which are also used elsewhere (win/loss colors, radar
// player-vs-global) for unrelated purposes.
const chartConfig = {
  all: { label: "All", color: "var(--primary)" },
  pos1: { label: POSITIONS[1].label, color: "var(--position-commander)" },
  pos2: { label: POSITIONS[2].label, color: "var(--position-heavy)" },
  pos3: { label: POSITIONS[3].label, color: "var(--position-scout)" },
  pos4: { label: POSITIONS[4].label, color: "var(--position-ammo)" },
  pos5: { label: POSITIONS[5].label, color: "var(--position-medic)" },
} satisfies ChartConfig;

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  ...POSITION_KEYS.map((key, i) => ({ value: key, label: POSITIONS[i + 1].label })),
];

type Props = {
  data: PlayerStatPoint[];
  format: ValueFormat;
  emptyMessage?: string;
};

export function PlayerStatLineChart({ data, format, emptyMessage }: Props) {
  const [selected, setSelected] = useState<string[]>(["all"]);
  const valueFormatter = FORMATTERS[format];
  const smoothedData = useMemo(() => smoothStatSeries(data), [data]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{emptyMessage ?? "No game data available."}</p>
    );
  }

  return (
    <div className="space-y-3">
      <MultiSelectFilter
        label="Positions"
        options={FILTER_OPTIONS}
        selected={selected}
        onChange={setSelected}
      />
      <ChartContainer config={chartConfig} className="aspect-auto h-75">
        <LineChart data={smoothedData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            minTickGap={32}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => valueFormatter(v)}
          />
          <ChartTooltip
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex flex-1 justify-between items-center leading-none">
                    <span className="text-muted-foreground">
                      {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                    </span>
                    <span className="font-mono font-medium text-foreground tabular-nums ml-4">
                      {valueFormatter(typeof value === "number" ? value : null)}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {selected.includes("all") && (
            <Line
              dataKey="all"
              stroke="var(--color-all)"
              strokeWidth={2.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {POSITION_KEYS.filter((key) => selected.includes(key)).map((key) => (
            <Line
              key={key}
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
