"use client";

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MvpBoxPlotItem } from "@lfstats/db";
import { POSITIONS } from "@/lib/positions";

// Custom bar shapes — recharts clones these elements and passes x/y/width/height as props
type ShapeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

const CapBar = ({ x, y, width, height }: ShapeProps) => {
  if (x == null || y == null || width == null || height == null) return null;
  const pad = width * 0.2;
  return (
    <line
      x1={x + pad}
      y1={y}
      x2={x + width - pad}
      y2={y}
      stroke="currentColor"
      strokeOpacity={0.6}
      strokeWidth={2}
    />
  );
};

const WhiskerBar = ({ x, y, width, height }: ShapeProps) => {
  if (x == null || y == null || width == null || height == null) return null;
  return (
    <line
      x1={x + width / 2}
      y1={y + height}
      x2={x + width / 2}
      y2={y}
      stroke="currentColor"
      strokeOpacity={0.5}
      strokeWidth={1.5}
    />
  );
};

const MedianBar = ({ x, y, width, height }: ShapeProps) => {
  if (x == null || y == null || width == null || height == null) return null;
  return (
    <line
      x1={x}
      y1={y}
      x2={x + width}
      y2={y}
      stroke="var(--primary)"
      strokeWidth={3}
    />
  );
};

const chartConfig = {
  bottomBox: { label: "IQR", color: "var(--primary)" },
  topBox: { label: "IQR", color: "var(--primary)" },
} satisfies ChartConfig;

type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number | string> }>;
};

function BoxPlotTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const rows: [string, string][] = [
    ["Max", "rawMax"],
    ["Q3", "rawQ3"],
    ["Median", "rawMedian"],
    ["Q1", "rawQ1"],
    ["Min", "rawMin"],
  ];
  return (
    <div className="grid min-w-32 gap-1.5 rounded-none border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{d.positionLabel}</p>
      <div className="grid gap-0.5">
        {rows.map(([label, key]) => (
          <div key={key} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-mono font-medium tabular-nums">
              {typeof d[key] === "number"
                ? (d[key] as number).toFixed(3)
                : d[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type Props = {
  data: MvpBoxPlotItem[];
};

export function MvpBoxPlotChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No MVP data available.</p>
    );
  }

  const transformed = data.map((d) => ({
    position: POSITIONS[d.position]?.abbr ?? String(d.position),
    positionLabel: POSITIONS[d.position]?.label ?? String(d.position),
    rawMin: d.min,
    rawQ1: d.q1,
    rawMedian: d.median,
    rawQ3: d.q3,
    rawMax: d.max,
    // Stacked segments — zero-height cap keys ("bar-min", "bar-median", "bar-max")
    // are intentionally absent from data so recharts treats them as 0, rendering
    // the shape at the current stack position without contributing height.
    min: d.min,
    bottomWhisker: d.q1 - d.min,
    bottomBox: d.median - d.q1,
    topBox: d.q3 - d.median,
    topWhisker: d.max - d.q3,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-75">
      <ComposedChart
        data={transformed}
        margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
        <XAxis
          dataKey="position"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <ChartTooltip content={<BoxPlotTooltip />} />

        {/* Transparent spacer lifts the stack to the min value */}
        <Bar stackId="box" dataKey="min" fill="none" />
        {/* Cap at min */}
        <Bar stackId="box" dataKey="bar-min" shape={<CapBar />} />
        {/* Lower whisker (min → Q1) */}
        <Bar stackId="box" dataKey="bottomWhisker" shape={<WhiskerBar />} />
        {/* Lower IQR box (Q1 → median) */}
        <Bar
          stackId="box"
          dataKey="bottomBox"
          fill="var(--color-bottomBox)"
          fillOpacity={0.25}
          stroke="var(--color-bottomBox)"
          strokeWidth={1.5}
        />
        {/* Median line */}
        <Bar stackId="box" dataKey="bar-median" shape={<MedianBar />} />
        {/* Upper IQR box (median → Q3) */}
        <Bar
          stackId="box"
          dataKey="topBox"
          fill="var(--color-topBox)"
          fillOpacity={0.25}
          stroke="var(--color-topBox)"
          strokeWidth={1.5}
        />
        {/* Upper whisker (Q3 → max) */}
        <Bar stackId="box" dataKey="topWhisker" shape={<WhiskerBar />} />
        {/* Cap at max */}
        <Bar stackId="box" dataKey="bar-max" shape={<CapBar />} />
      </ComposedChart>
    </ChartContainer>
  );
}
