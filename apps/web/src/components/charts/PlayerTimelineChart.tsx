// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { memo, useMemo, useRef, useState } from "react";
import { Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { formatMs, formatScore } from "@/lib/format";
import {
  buildTimelineSeries,
  type TimelineRow,
  type TimelineStatus,
} from "@/lib/player-timeline-series";
import type { PlayerTimeline, PlayerTimelineMarker, PlayerTimelineMarkerKind } from "@lfstats/db";

const LINE_COLOR = "var(--chart-1)";
const DOWN_COLOR = "var(--muted-foreground)";
const RESUPPLY_COLOR = "#0ea5e9";
const ELIMINATED_COLOR = "var(--destructive)";

const MARKER_STYLE: Record<
  PlayerTimelineMarkerKind,
  { glyph: string; color: string; label: string; laneLine: boolean; faint?: boolean }
> = {
  missileGiven: { glyph: "▲", color: "#16a34a", label: "Missiled", laneLine: true },
  missiled: { glyph: "▼", color: "#dc2626", label: "Missiled by", laneLine: true },
  nukeActivate: {
    glyph: "☢",
    color: "#f59e0b",
    label: "Nuke activated",
    laneLine: false,
    faint: true,
  },
  nukeDetonate: { glyph: "☢", color: "#f59e0b", label: "Nuke detonated", laneLine: true },
  nukedBy: { glyph: "☢", color: "#dc2626", label: "Nuked by", laneLine: true },
  teamNuke: { glyph: "☢", color: "#f59e0b", label: "Team nuke by", laneLine: false, faint: true },
  baseDestroyed: { glyph: "◆", color: "#7c3aed", label: "Destroyed", laneLine: true },
  baseAward: { glyph: "◇", color: "#7c3aed", label: "Awarded", laneLine: true },
};

const LEGEND_LABELS: Partial<Record<PlayerTimelineMarkerKind, string>> = {
  missileGiven: "Missile given",
  missiled: "Missiled",
  nukeDetonate: "Own nuke",
  nukedBy: "Nuked",
  teamNuke: "Team nuke",
  baseDestroyed: "Base destroyed",
  baseAward: "Base awarded",
};
const LEGEND_KINDS = Object.keys(LEGEND_LABELS) as PlayerTimelineMarkerKind[];

const STATUS_LABEL: Record<TimelineStatus, string> = {
  up: "Up",
  down: "Down",
  resupply: "Resupply",
  eliminated: "Eliminated",
};

function markerText(m: PlayerTimelineMarker): string {
  const style = MARKER_STYLE[m.kind];
  const who = m.otherCallsign ? ` ${m.otherCallsign}` : "";
  return `${style.label}${who} · ${formatMs(m.time)}`;
}

type Lane = {
  key: "score" | "shots" | "lives" | "steps";
  label: string;
  height: number;
  format: (n: number) => string;
};

// Every lane shares the same left gutter so their x scales line up exactly.
// The HTML overlays (shading, marker guides, crosshair) are positioned with the
// same numbers, so keep LABEL_WIDTH in sync with LaneRow's label column (w-14).
const MARGIN = { top: 4, right: 12, left: 0, bottom: 0 };
const LABEL_WIDTH = 56;
const Y_AXIS_WIDTH = 44;
const X_AXIS_HEIGHT = 24;
const PLOT_LEFT = LABEL_WIDTH + Y_AXIS_WIDTH;
const PLOT_RIGHT = MARGIN.right;

// Last row at or before `time`; rows are sorted by time.
function rowIndexAt(rows: TimelineRow[], time: number): number {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rows[mid]!.time <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const pct = (time: number, duration: number) => `${(time / duration) * 100}%`;

type Props = { timeline: PlayerTimeline };

export function PlayerTimelineChart({ timeline }: Props) {
  // Hover state lives here, but the Recharts lanes are memoised and never see
  // it, so a mouse move only re-renders the readout and the crosshair div.
  const [hover, setHover] = useState<{ time: number; index: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);

  const { rows, statusAt } = useMemo(() => buildTimelineSeries(timeline), [timeline]);
  const { duration, eliminatedAt, intervals, markers } = timeline;

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = containerRef.current;
    if (!el) return;
    const clientX = e.clientX;
    // Coalesce to one update per animation frame.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const rect = el.getBoundingClientRect();
      const width = rect.width - PLOT_LEFT - PLOT_RIGHT;
      const x = clientX - rect.left - PLOT_LEFT;
      if (width <= 0 || x < 0 || x > width) {
        setHover(null);
        return;
      }
      const time = (x / width) * duration;
      setHover({ time, index: rowIndexAt(rows, time) });
    });
  }

  function onMouseLeave() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setHover(null);
  }

  const active: TimelineRow | null = hover ? (rows[hover.index] ?? null) : null;
  const plotInset = { left: PLOT_LEFT, right: PLOT_RIGHT, top: 0, bottom: X_AXIS_HEIGHT };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <LegendSwatch color={DOWN_COLOR} opacity={0.3} label="Downtime" />
        <LegendSwatch color={RESUPPLY_COLOR} opacity={0.35} label="Resupply downtime" />
        {eliminatedAt !== null && (
          <LegendSwatch color={ELIMINATED_COLOR} opacity={0.2} label="Eliminated" />
        )}
        {LEGEND_KINDS.filter((k) => markers.some((m) => m.kind === k)).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span style={{ color: MARKER_STYLE[k].color }}>{MARKER_STYLE[k].glyph}</span>
            {LEGEND_LABELS[k]}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 text-xs tabular-nums min-h-4">
        {active && hover ? (
          <>
            <span className="font-medium">{formatMs(hover.time)}</span>
            <span>Score {formatScore(active.score)}</span>
            <span>Shots {active.shots}</span>
            <span>Lives {active.lives}</span>
            {active.steps !== null && <span>Steps {formatScore(active.steps)}</span>}
            <span className="text-muted-foreground">{STATUS_LABEL[statusAt(hover.time)]}</span>
          </>
        ) : (
          <span className="text-muted-foreground">Hover the chart for values</span>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* Shading and marker guides are plain divs behind the lanes, drawn once
            for the whole stack rather than as Recharts reference elements per lane. */}
        <div
          className="pointer-events-none absolute overflow-hidden"
          style={plotInset}
          aria-hidden="true"
        >
          {intervals.map((iv) => (
            <div
              key={`iv-${iv.start}`}
              className="absolute inset-y-0"
              style={{
                left: pct(iv.start, duration),
                width: pct(iv.end - iv.start, duration),
                background: iv.kind === "resupply" ? RESUPPLY_COLOR : DOWN_COLOR,
                opacity: iv.kind === "resupply" ? 0.2 : 0.15,
              }}
            />
          ))}
          {eliminatedAt !== null && (
            <div
              className="absolute inset-y-0 right-0"
              style={{
                left: pct(eliminatedAt, duration),
                background: ELIMINATED_COLOR,
                opacity: 0.08,
              }}
            />
          )}
          {markers
            .filter((m) => MARKER_STYLE[m.kind].laneLine)
            .map((m, i) => (
              <div
                key={`ml-${i}`}
                className="absolute inset-y-0 border-l border-dashed"
                style={{
                  left: pct(m.time, duration),
                  borderColor: MARKER_STYLE[m.kind].color,
                  opacity: 0.6,
                }}
              />
            ))}
        </div>

        <TimelineLanes timeline={timeline} rows={rows} />

        {hover && (
          <div className="pointer-events-none absolute" style={plotInset} aria-hidden="true">
            <div
              className="absolute inset-y-0 border-l border-foreground/50"
              style={{ left: pct(hover.time, duration) }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const TimelineLanes = memo(function TimelineLanes({
  timeline,
  rows,
}: {
  timeline: PlayerTimeline;
  rows: TimelineRow[];
}) {
  const [hoveredMarker, setHoveredMarker] = useState<number | null>(null);
  const { duration, markers } = timeline;

  const lanes: Lane[] = [
    { key: "score", label: "Score", height: 110, format: (n) => formatScore(n) },
    { key: "shots", label: "Shots", height: 64, format: (n) => String(n) },
    { key: "lives", label: "Lives", height: 64, format: (n) => String(n) },
    ...(timeline.steps !== null
      ? [
          {
            key: "steps" as const,
            label: "Steps",
            height: 64,
            format: (n: number) => formatScore(n),
          },
        ]
      : []),
  ];

  const chartConfig = Object.fromEntries(
    lanes.map((l) => [l.key, { label: l.label, color: LINE_COLOR }]),
  ) satisfies ChartConfig;

  const xAxis = (showTicks: boolean) => (
    <XAxis
      dataKey="time"
      type="number"
      domain={[0, duration]}
      hide={!showTicks}
      height={X_AXIS_HEIGHT}
      tickLine={false}
      axisLine={false}
      tick={{ fontSize: 11 }}
      tickFormatter={(v: number) => formatMs(v)}
    />
  );

  return (
    <div className="relative">
      {/* Events lane: one glyph per missile, nuke or base moment. */}
      <LaneRow label="Events" height={40} config={chartConfig}>
        <LineChart data={rows} margin={{ ...MARGIN, top: 0 }}>
          {xAxis(false)}
          {/* A hidden YAxis reserves no width, so keep it visible but blank to
              line this lane's x scale up with the lanes below. */}
          <YAxis
            domain={[0, 1]}
            tick={false}
            tickLine={false}
            axisLine={false}
            width={Y_AXIS_WIDTH}
          />
          {/* Recharts draws reference elements only once a series exists. */}
          <Line
            dataKey={() => 0}
            stroke="transparent"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {markers.map((m, i) => {
            const style = MARKER_STYLE[m.kind];
            const isHovered = hoveredMarker === i;
            return (
              <ReferenceDot
                key={`md-${i}`}
                x={m.time}
                y={0.4}
                ifOverflow="visible"
                shape={(props: { cx?: number; cy?: number }) => {
                  const { cx, cy } = props;
                  if (cx === undefined || cy === undefined) return <g />;
                  return (
                    <g
                      onMouseEnter={() => setHoveredMarker(i)}
                      onMouseLeave={() => setHoveredMarker(null)}
                    >
                      <circle cx={cx} cy={cy} r={10} fill="transparent" />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={isHovered ? 18 : 14}
                        fill={style.color}
                        fillOpacity={style.faint ? 0.5 : 1}
                        stroke="var(--background)"
                        strokeWidth={2}
                        paintOrder="stroke"
                      >
                        {style.glyph}
                      </text>
                      {isHovered && (
                        <text
                          x={cx}
                          y={cy - 14}
                          textAnchor={cx < 120 ? "start" : "middle"}
                          dominantBaseline="central"
                          fontSize={11}
                          fontWeight={600}
                          fill="var(--foreground)"
                          stroke="var(--background)"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          {markerText(m)}
                        </text>
                      )}
                    </g>
                  );
                }}
              />
            );
          })}
        </LineChart>
      </LaneRow>

      {lanes.map((lane, i) => {
        const isLast = i === lanes.length - 1;
        let max = 1;
        let min = 0;
        for (const r of rows) {
          const v = r[lane.key] ?? 0;
          if (v > max) max = v;
          if (v < min) min = v;
        }
        return (
          <LaneRow
            key={lane.key}
            label={lane.label}
            height={lane.height + (isLast ? X_AXIS_HEIGHT : 0)}
            config={chartConfig}
          >
            <LineChart data={rows} margin={MARGIN}>
              {xAxis(isLast)}
              <YAxis
                domain={[min, max]}
                ticks={min < 0 ? [min, 0, max] : [0, max]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => lane.format(v)}
                width={Y_AXIS_WIDTH}
              />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Line
                type="stepAfter"
                dataKey={lane.key}
                stroke={`var(--color-${lane.key})`}
                strokeWidth={2}
                dot={false}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </LaneRow>
        );
      })}
    </div>
  );
});

function LaneRow({
  label,
  height,
  config,
  children,
}: {
  label: string;
  height: number;
  config: ChartConfig;
  children: React.ReactElement;
}) {
  return (
    <div className="flex items-stretch">
      <div className="w-14 shrink-0 pt-1 text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1" style={{ height }}>
        <ChartContainer config={config} className="aspect-auto h-full w-full">
          {children}
        </ChartContainer>
      </div>
    </div>
  );
}

function LegendSwatch({
  color,
  opacity,
  label,
}: {
  color: string;
  opacity: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="relative size-2.5 rounded-sm overflow-hidden border border-border">
        <span className="absolute inset-0" style={{ background: color, opacity }} />
      </span>
      {label}
    </span>
  );
}
