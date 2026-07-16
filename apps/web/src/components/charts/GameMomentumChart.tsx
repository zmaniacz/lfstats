// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import { formatMs, formatScore } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import { getTeamColor } from "@/lib/team-colors";
import type { MomentumMarker, MomentumMarkerKind, MomentumPoint } from "@/lib/game-momentum-series";
import type { MomentumTeam } from "@lfstats/db";

type Props = {
  series: MomentumPoint[];
  markers: MomentumMarker[];
  yDomain: [number, number];
  duration: number;
  teamA: MomentumTeam;
  teamB: MomentumTeam;
};

function TeamHeader({ team, color }: { team: MomentumTeam; color: string }) {
  const baseScore = team.score ?? 0;
  const elimBonus = team.eliminationBonus ?? 0;
  const penaltyScore = team.penaltyScore ?? 0;
  const totalScore = baseScore + elimBonus + penaltyScore;

  return (
    <div className="flex items-center gap-2">
      <span className="font-bold" style={{ color }}>
        {team.teamName}
      </span>
      <span className="font-mono font-semibold tabular-nums text-sm">
        {formatScore(totalScore)}
      </span>
      {team.eliminated ? (
        <Badge variant="destructive" className="text-xs px-1 py-0">
          ELIMINATED
        </Badge>
      ) : team.result === "win" ? (
        <Badge variant="default" className="text-xs px-1 py-0">
          Win
        </Badge>
      ) : team.result === "loss" ? (
        <Badge variant="secondary" className="text-xs px-1 py-0">
          Loss
        </Badge>
      ) : team.result === "draw" ? (
        <Badge variant="secondary" className="text-xs px-1 py-0">
          Draw
        </Badge>
      ) : null}
    </div>
  );
}

const MARKER_GLYPHS: Record<MomentumMarkerKind, string> = {
  nuke: "☢",
  elimination: "✕",
};

// Pixel gap between icons that fall at (or very near) the same chart position —
// e.g. a nuke and the eliminations it caused all land on the exact same instant.
const STACK_GAP_PX = 20;

type StackedMarker = MomentumMarker & { stackIndex: number };

function stackMarkers(markers: MomentumMarker[]): StackedMarker[] {
  const groups = new Map<number, MomentumMarker[]>();
  for (const marker of markers) {
    const group = groups.get(marker.time) ?? [];
    group.push(marker);
    groups.set(marker.time, group);
  }

  const result: StackedMarker[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "nuke" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    sorted.forEach((marker, stackIndex) => result.push({ ...marker, stackIndex }));
  }
  return result;
}

function MarkerIcon({
  cx,
  cy,
  color,
  kind,
  label,
  isHovered,
  labelAbove,
  onMouseEnter,
  onMouseLeave,
}: {
  cx?: number;
  cy?: number;
  color: string;
  kind: MomentumMarkerKind;
  label: string;
  isHovered: boolean;
  labelAbove: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  return (
    <g onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={{ cursor: "default" }}>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isHovered ? 20 : 16}
        fontWeight={kind === "elimination" ? 700 : 400}
        fill={color}
        stroke="var(--background)"
        strokeWidth={2}
        paintOrder="stroke"
      >
        {MARKER_GLYPHS[kind]}
      </text>
      {isHovered && (
        <text
          x={cx}
          y={cy + (labelAbove ? -16 : 16)}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight={600}
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function GameMomentumChart({ series, markers, yDomain, duration, teamA, teamB }: Props) {
  const [hoveredMarkerKey, setHoveredMarkerKey] = useState<string | null>(null);

  if (series.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough event data for this game.</p>;
  }

  const teamAColor = getTeamColor(teamA.colourEnum)?.hex ?? "#6b7280";
  const teamBColor = getTeamColor(teamB.colourEnum)?.hex ?? "#6b7280";

  const chartConfig = {
    teamAValue: { label: teamA.teamName, color: teamAColor },
    teamBValue: { label: teamB.teamName, color: teamBColor },
  } satisfies ChartConfig;

  const stackedMarkers = stackMarkers(markers);
  const markerTimes = [...new Set(markers.map((m) => m.time))];

  return (
    <div className="space-y-1">
      <TeamHeader team={teamA} color={teamAColor} />
      <ChartContainer config={chartConfig} className="aspect-auto h-90">
        <AreaChart data={series} margin={{ top: 24, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, duration]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatMs(v)}
          />
          <YAxis domain={yDomain} hide />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
          <Area
            type="monotone"
            dataKey="teamAValue"
            stroke={teamAColor}
            fill={teamAColor}
            fillOpacity={0.6}
            strokeWidth={1.5}
            isAnimationActive={false}
            activeDot={false}
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="teamBValue"
            stroke={teamBColor}
            fill={teamBColor}
            fillOpacity={0.6}
            strokeWidth={1.5}
            isAnimationActive={false}
            activeDot={false}
            connectNulls
          />
          {markerTimes.map((time) => (
            <ReferenceLine
              key={time}
              x={time}
              stroke="var(--foreground)"
              strokeOpacity={0.3}
              strokeDasharray="2 2"
            />
          ))}
          {stackedMarkers.map((marker) => {
            const key = `${marker.kind}-${marker.teamId}-${marker.time}-${marker.stackIndex}`;
            const isHovered = hoveredMarkerKey === key;
            const color = marker.teamId === teamA.teamId ? teamAColor : teamBColor;
            const labelAbove = marker.value >= 0;
            const direction = labelAbove ? -1 : 1;
            const pixelOffset = direction * marker.stackIndex * STACK_GAP_PX;
            const positionSuffix =
              marker.kind === "elimination" && marker.position !== null
                ? ` (${getPosition(marker.position)?.abbr ?? "?"})`
                : "";
            return (
              <ReferenceDot
                key={key}
                x={marker.time}
                y={marker.value}
                r={10}
                shape={(props: { cx?: number; cy?: number }) => (
                  <MarkerIcon
                    cx={props.cx}
                    cy={props.cy === undefined ? undefined : props.cy + pixelOffset}
                    color={color}
                    kind={marker.kind}
                    label={`${marker.label}${positionSuffix} ${formatMs(marker.time)}`}
                    isHovered={isHovered}
                    labelAbove={labelAbove}
                    onMouseEnter={() => setHoveredMarkerKey(key)}
                    onMouseLeave={() => setHoveredMarkerKey(null)}
                  />
                )}
              />
            );
          })}
        </AreaChart>
      </ChartContainer>
      <TeamHeader team={teamB} color={teamBColor} />
    </div>
  );
}
