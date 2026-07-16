// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { GameMomentumData } from "@lfstats/db";

export type MomentumMarkerKind = "nuke" | "elimination";

export type MomentumPoint = { time: number; teamAValue: number; teamBValue: number };
export type MomentumMarker = {
  time: number;
  teamId: string;
  label: string;
  value: number;
  kind: MomentumMarkerKind;
  // Position (1-5) of the named player. Only set for elimination markers.
  position: number | null;
};

export type MomentumSeries = {
  series: MomentumPoint[];
  markers: MomentumMarker[];
  yDomain: [number, number];
};

// Relative impact of each scoring event, in units of "one opponent tag".
// Nuke detonations are deliberately an order of magnitude larger so they read
// as a decisive spike, the way a goal dominates a soccer momentum chart.
// "ELIM" is a synthetic eventType (not a real TDF code) for player eliminations.
export const EVENT_WEIGHTS: Record<string, number> = {
  "0205": 1, // opponent hit (tag)
  "0206": 1, // opponent deactivate
  "0306": 2, // missile hit opponent
  "0204": 3, // target destroyed (shot)
  "0303": 3, // target destroyed (missile)
  "0B03": 3, // base award
  "0405": 10, // nuke detonate
  ELIM: 5, // player eliminated
};

const MARKER_EVENT_TYPES: Record<string, MomentumMarkerKind> = {
  "0405": "nuke",
  ELIM: "elimination",
};

// Decay time constant: an event's influence drops to ~37% after 1 minute,
// ~14% after 2 minutes. This is the only smoothing the chart applies — the
// kernel itself produces a smooth curve, so no separate moving-average pass
// is needed.
export const TAU_MS = 60_000;

const DEFAULT_SAMPLE_COUNT = 120;

export function buildMomentumSeries(
  data: GameMomentumData,
  sampleCount = DEFAULT_SAMPLE_COUNT,
): MomentumSeries {
  const [teamA, teamB] = data.teams;

  if (!teamA || !teamB || data.duration <= 0) {
    return { series: [], markers: [], yDomain: [-1, 1] };
  }

  const contributions = data.events
    .filter((e) => e.actorTeamId === teamA.teamId || e.actorTeamId === teamB.teamId)
    .filter((e) => e.targetTeamId === null || e.targetTeamId !== e.actorTeamId)
    .map((e) => {
      const weight = EVENT_WEIGHTS[e.eventType] ?? 0;
      const side = e.actorTeamId === teamA.teamId ? 1 : -1;
      return { time: e.time, signedWeight: weight * side, eventType: e.eventType, event: e };
    })
    .filter((c) => c.signedWeight !== 0);

  function momentumAt(t: number): number {
    let sum = 0;
    for (const c of contributions) {
      sum += c.signedWeight * Math.exp(-Math.abs(t - c.time) / TAU_MS);
    }
    return sum;
  }

  const series: MomentumPoint[] = [];
  let maxAbs = 0;
  for (let i = 0; i < sampleCount; i++) {
    const time = (data.duration * i) / (sampleCount - 1);
    const value = momentumAt(time);
    maxAbs = Math.max(maxAbs, Math.abs(value));
    series.push({
      time,
      teamAValue: value > 0 ? value : 0,
      teamBValue: value < 0 ? value : 0,
    });
  }

  const markers: MomentumMarker[] = contributions
    .filter((c) => c.eventType in MARKER_EVENT_TYPES)
    .map((c) => {
      const kind = MARKER_EVENT_TYPES[c.eventType];
      // Nuke markers are colored by the detonating (benefiting) team.
      // Elimination markers are colored by the eliminated player's own team,
      // not the opponent who gets the momentum credit.
      const markerTeamId =
        kind === "elimination"
          ? (c.event.targetTeamId ?? c.event.actorTeamId)
          : c.event.actorTeamId;
      return {
        time: c.time,
        teamId: markerTeamId,
        label: c.event.markerLabel ?? "Unknown",
        value: momentumAt(c.time),
        kind,
        position: c.event.markerPosition,
      };
    });

  const yDomainMax = maxAbs > 0 ? maxAbs * 1.15 : 1;

  return { series, markers, yDomain: [-yDomainMax, yDomainMax] };
}

export type ScorePoint = { time: number; teamAScore: number; teamBScore: number };

// Reconstructs each team's cumulative score as a step function over the same
// game-clock domain as the momentum chart, so the two can be read side by
// side. One point per score change (plus a t=0 start and a t=duration end),
// rendered with a "stepAfter" line so the flat holds until the next score.
export function buildScoreSeries(data: GameMomentumData): ScorePoint[] {
  const [teamA, teamB] = data.teams;
  if (!teamA || !teamB) return [];

  const points: ScorePoint[] = [{ time: 0, teamAScore: 0, teamBScore: 0 }];
  let teamAScore = 0;
  let teamBScore = 0;

  const sortedScoreEvents = [...data.scoreEvents].sort((a, b) => a.time - b.time);
  for (const e of sortedScoreEvents) {
    if (e.teamId === teamA.teamId) teamAScore = e.score;
    else if (e.teamId === teamB.teamId) teamBScore = e.score;
    else continue;
    points.push({ time: e.time, teamAScore, teamBScore });
  }

  if (points[points.length - 1]?.time !== data.duration) {
    points.push({ time: data.duration, teamAScore, teamBScore });
  }

  return points;
}
