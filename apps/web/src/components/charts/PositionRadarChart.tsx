"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";

export type PositionRadarPoint = {
  positionLabel: string;
  playerAvg: number;
  globalAvg: number;
};

type Props = {
  data: PositionRadarPoint[];
};

const chartConfig = {
  playerAvg: {
    label: "This Player",
    color: "var(--chart-5)",
  },
  globalAvg: {
    label: "Global Avg",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

export function PositionRadarChart({ data }: Props) {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-75">
      <RadarChart data={data}>
        <PolarGrid />
        <PolarAngleAxis dataKey="positionLabel" />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Radar
          name="playerAvg"
          dataKey="playerAvg"
          stroke="var(--color-playerAvg)"
          strokeWidth={2}
          fill="var(--color-playerAvg)"
          fillOpacity={0}
          isAnimationActive={false}
        />
        <Radar
          name="globalAvg"
          dataKey="globalAvg"
          stroke="var(--color-globalAvg)"
          strokeWidth={2}
          fill="var(--color-globalAvg)"
          fillOpacity={0}
          isAnimationActive={false}
        />
        <ChartTooltip
          isAnimationActive={false}
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <>
                  <span className="text-muted-foreground">
                    {chartConfig[name as keyof typeof chartConfig]?.label ??
                      name}
                  </span>
                  <span className="font-mono font-medium text-foreground tabular-nums">
                    {typeof value === "number" ? value.toFixed(2) : value}
                  </span>
                </>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  );
}
