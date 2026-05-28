"use client"

import { PieChart, Pie } from "recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { WinsByColorItem } from "@lfstats/db"
import { TEAM_COLORS } from "@/lib/team-colors"

type Props = {
  data: WinsByColorItem[]
}

function toKey(colourEnum: number, outcome: string): string {
  const label = TEAM_COLORS[colourEnum]?.label ?? `color_${colourEnum}`
  return `${label.toLowerCase().replace(/\s+/g, "_")}_${outcome}`
}

export function WinsByColorChart({ data }: Props) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No win data available.</p>
  }

  const slices = data.map((item) => {
    const color = TEAM_COLORS[item.colourEnum]
    const colorLabel = color?.label ?? `Color ${item.colourEnum}`
    const outcomeLabel = item.outcome === "score" ? "Score Win" : "Elim Win"
    const hex = color?.hex ?? "#6b7280"
    // Score wins: full color. Elimination wins: 60% alpha baked into hex.
    const fill = item.outcome === "score" ? hex : `${hex}99`
    return {
      name: toKey(item.colourEnum, item.outcome),
      label: `${colorLabel} — ${outcomeLabel}`,
      value: item.count,
      fill,
    }
  })

  const chartConfig: ChartConfig = Object.fromEntries(
    slices.map((s) => [s.name, { label: s.label, color: s.fill }]),
  )

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-[300px]">
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <span>
                  {typeof value === "number"
                    ? `${value} game${value !== 1 ? "s" : ""}`
                    : value}
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  )
}
