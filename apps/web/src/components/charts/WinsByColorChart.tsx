"use client";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TEAM_COLORS } from "@/lib/team-colors";
import type { WinsByColorItem } from "@lfstats/db";
import { Pie, PieChart, PieSectorDataItem, Sector } from "recharts";

type Props = {
  data: WinsByColorItem[];
};

function toKey(colourEnum: number, outcome: string): string {
  const label = TEAM_COLORS[colourEnum]?.label ?? `color_${colourEnum}`;
  return `${label.toLowerCase().replace(/\s+/g, "_")}_${outcome}`;
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
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={fill}
        fill="none"
      />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        textAnchor={textAnchor}
        fill="#333"
      >{`${payload.label}`}</text>
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        dy={18}
        textAnchor={textAnchor}
        fill="#999"
      >
        {`${value} (${((percent ?? 1) * 100).toFixed(2)}%)`}
      </text>
    </g>
  );
};

export function WinsByColorChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No win data available.</p>
    );
  }

  const slices = data.map((item) => {
    const color = TEAM_COLORS[item.colourEnum];
    const colorLabel = color?.label ?? `Color ${item.colourEnum}`;
    const outcomeLabel = item.outcome === "score" ? "Score Win" : "Elim Win";
    const hex = color?.hex ?? "#6b7280";
    const fill = item.outcome === "score" ? hex : `${hex}99`;
    return {
      name: toKey(item.colourEnum, item.outcome),
      label: `${colorLabel} — ${outcomeLabel}`,
      value: item.count,
      fill,
    };
  });

  const chartConfig: ChartConfig = Object.fromEntries(
    slices.map((s) => [s.name, { label: s.label, color: s.fill }]),
  );

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-80">
      <PieChart>
        <Pie
          activeShape={renderActiveShape}
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
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
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  );
}
