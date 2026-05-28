"use client";

import { PieChart, Pie } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PlayerResultItem } from "@lfstats/db";
import { TEAM_COLORS } from "@/lib/team-colors";

type Props = {
  data: PlayerResultItem[];
};

function toOuterKey(
  colourEnum: number,
  result: string,
  outcome: string,
): string {
  const label = TEAM_COLORS[colourEnum]?.label ?? `color_${colourEnum}`;
  return `${label.toLowerCase().replace(/\s+/g, "_")}_${result}_${outcome}`;
}

function toOuterLabel(
  colourEnum: number,
  result: "win" | "loss",
  outcome: "score" | "elimination",
): string {
  const colorLabel = TEAM_COLORS[colourEnum]?.label ?? `Color ${colourEnum}`;
  const resultLabel = result === "win" ? "Win" : "Loss";
  const outcomeLabel = outcome === "elimination" ? "Elim" : "Score";
  return `${colorLabel} — ${outcomeLabel} ${resultLabel}`;
}

function toOuterFill(
  colourEnum: number,
  result: "win" | "loss",
  outcome: "score" | "elimination",
): string {
  const hex = TEAM_COLORS[colourEnum]?.hex ?? "#6b7280";
  if (result === "win") {
    return outcome === "score" ? hex : `${hex}CC`;
  }
  return outcome === "score" ? `${hex}66` : `${hex}33`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InnerLabel({ cx, cy, midAngle, innerRadius, outerRadius, name }: any) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = (cx as number) + radius * Math.cos(-midAngle * RADIAN);
  const y = (cy as number) + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight="bold"
    >
      {name === "wins" ? "Wins" : "Losses"}
    </text>
  );
}

export function PlayerWinsByColorChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No game data available.</p>
    );
  }

  const totalWins = data
    .filter((d) => d.result === "win")
    .reduce((sum, d) => sum + d.count, 0);
  const totalLosses = data
    .filter((d) => d.result === "loss")
    .reduce((sum, d) => sum + d.count, 0);

  const innerData = [
    {
      name: "wins",
      label: "Wins",
      value: totalWins,
      fill: "var(--color-wins)",
    },
    {
      name: "losses",
      label: "Losses",
      value: totalLosses,
      fill: "var(--color-losses)",
    },
  ];

  const outerSlices = data.map((item) => ({
    name: toOuterKey(item.colourEnum, item.result, item.outcome),
    label: toOuterLabel(item.colourEnum, item.result, item.outcome),
    value: item.count,
    fill: toOuterFill(item.colourEnum, item.result, item.outcome),
  }));

  const chartConfig: ChartConfig = {
    wins: { label: "Wins", color: "var(--chart-5)" },
    losses: { label: "Losses", color: "var(--chart-1)" },
    ...Object.fromEntries(
      outerSlices.map((s) => [s.name, { label: s.label, color: s.fill }]),
    ),
  };

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-75">
      <PieChart>
        {/* Inner pie: total wins vs losses */}
        <Pie
          data={innerData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={70}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={InnerLabel as any}
          labelLine={false}
        />
        {/* Outer donut: wins/losses by team color and outcome type */}
        <Pie
          data={[...outerSlices].reverse()}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={120}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <>
                  <span className="text-muted-foreground">
                    {item.payload?.label}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {typeof value === "number"
                      ? `${value} game${value !== 1 ? "s" : ""}`
                      : value}
                  </span>
                </>
              )}
            />
          }
        />
      </PieChart>
    </ChartContainer>
  );
}
