// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { TEAM_COLORS } from "@/lib/team-colors";
import type { CompetitionTeamResultItem } from "@lfstats/db";
import { Pie, PieChart, PieSectorDataItem, Sector } from "recharts";

type Props = {
  data: CompetitionTeamResultItem[];
};

function toOuterKey(colourEnum: number, result: string, outcome: string): string {
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
function InnerLabel({ cx, cy, midAngle, innerRadius, outerRadius, name, value }: any) {
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
      {name === "wins" ? `${value} Wins` : `${value} Losses`}
    </text>
  );
}

const renderActiveShape = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  startAngle,
  endAngle,
  fill,
  payload,
  percent,
  value,
}: PieSectorDataItem) => {
  const RADIAN = Math.PI / 180;
  const sin = Math.sin(-RADIAN * (midAngle ?? 1));
  const cos = Math.cos(-RADIAN * (midAngle ?? 1));
  const sx = (cx ?? 0) + ((outerRadius ?? 0) + 10) * cos;
  const sy = (cy ?? 0) + ((outerRadius ?? 0) + 10) * sin;
  const mx = (cx ?? 0) + ((outerRadius ?? 0) + 30) * cos;
  const my = (cy ?? 0) + ((outerRadius ?? 0) + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={(outerRadius ?? 0) + 6}
        outerRadius={(outerRadius ?? 0) + 10}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        textAnchor={textAnchor}
        fill="#333"
      >{`${payload.label}`}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`${value} (${((percent ?? 1) * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

export function TeamWinsByColorChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No game data available.</p>;
  }

  const totalWins = data.filter((d) => d.result === "win").reduce((sum, d) => sum + d.count, 0);
  const totalLosses = data.filter((d) => d.result === "loss").reduce((sum, d) => sum + d.count, 0);

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
    ...Object.fromEntries(outerSlices.map((s) => [s.name, { label: s.label, color: s.fill }])),
  };

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80">
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
          isAnimationActive={false}
        />
        {/* Outer donut: wins/losses by team color and outcome type */}
        <Pie
          activeShape={renderActiveShape}
          data={[...outerSlices].reverse()}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={80}
          outerRadius={120}
          labelLine={false}
          isAnimationActive={false}
        />
      </PieChart>
    </ChartContainer>
  );
}
