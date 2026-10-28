// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionTeamPlayerStat } from "@lfstats/db";
import { formatAvg, formatHitDiff, formatMVP, formatPct, formatScore } from "@/lib/format";

/**
 * One selectable stat column on the competition team player-comparison table.
 *
 * Only stats stored for every position appear here — the table can be shown with the position
 * pivot collapsed, and a position-gated stat (nukes, rapid fire, resupplies, SP) would then be
 * averaged over a denominator the reader can't see.
 */
export type TeamStatDef = {
  /** URL token and React key. */
  key: string;
  /** Full name, used in the picker and on the pills. */
  label: string;
  /** Short name for the column header, where space is tight. */
  short: string;
  /** Section heading in the picker dropdown. */
  group: string;
  field: keyof CompetitionTeamPlayerStat;
  format: (n: number | null) => string;
  /** Offered only in competitions with PDF-era games (the legacy MVP). */
  legacyOnly?: boolean;
};

const formatAvgScore = (n: number | null): string =>
  n === null ? formatScore(null) : formatScore(Math.round(n));

export const TEAM_STATS: readonly TeamStatDef[] = [
  {
    key: "mvp",
    label: "Avg MVP",
    short: "MVP",
    group: "Core",
    field: "avgMvp",
    format: formatMVP,
  },
  {
    key: "legacyMvp",
    label: "Avg MVP* (legacy)",
    short: "MVP*",
    group: "Core",
    field: "avgLegacyMvp",
    format: formatMVP,
    legacyOnly: true,
  },
  {
    key: "score",
    label: "Avg Score",
    short: "Score",
    group: "Core",
    field: "avgScore",
    format: formatAvgScore,
  },
  {
    key: "hitDiff",
    label: "Avg Hit Diff",
    short: "Hit Diff",
    group: "Core",
    field: "avgHitDiff",
    format: formatHitDiff,
  },
  {
    key: "medicHits",
    label: "Avg Medic Hits",
    short: "Medic",
    group: "Core",
    field: "avgMedicHits",
    format: formatAvg,
  },
  {
    key: "accuracy",
    label: "Avg Accuracy",
    short: "Acc",
    group: "Core",
    field: "avgAccuracy",
    format: formatPct,
  },
  {
    key: "deacs",
    label: "Avg Deacs",
    short: "Deacs",
    group: "Combat",
    field: "avgDeactivations",
    format: formatAvg,
  },
  {
    key: "assists",
    label: "Avg Assists",
    short: "Assists",
    group: "Combat",
    field: "avgAssists",
    format: formatAvg,
  },
  {
    key: "timesHit",
    label: "Avg Times Hit",
    short: "Hit",
    group: "Combat",
    field: "avgTimesHit",
    format: formatAvg,
  },
  {
    key: "resets",
    label: "Avg Resets",
    short: "Resets",
    group: "Combat",
    field: "avgResets",
    format: formatAvg,
  },
  {
    key: "elims",
    label: "Avg Elims",
    short: "Elims",
    group: "Combat",
    field: "avgEliminations",
    format: formatAvg,
  },
  {
    key: "winRate",
    label: "Win %",
    short: "Win %",
    group: "Outcome",
    field: "winRate",
    format: formatPct,
  },
  {
    key: "survival",
    label: "Survival %",
    short: "Surv %",
    group: "Outcome",
    field: "survivalRate",
    format: formatPct,
  },
  {
    key: "uptime",
    label: "Uptime %",
    short: "Uptime",
    group: "Time & Discipline",
    field: "avgUptimePct",
    format: formatPct,
  },
  {
    key: "penalties",
    label: "Avg Penalties",
    short: "Pen",
    group: "Time & Discipline",
    field: "avgPenalties",
    format: formatAvg,
  },
];

/** The stats the table has always shown, so an untouched page looks exactly as it did. */
export const DEFAULT_STAT_KEYS = ["mvp", "score"];

/** A PDF-era competition leads with the legacy MVP, the only MVP most of its games have. */
export const LEGACY_DEFAULT_STAT_KEYS = ["legacyMvp", "score"];

/**
 * The stats a team table offers. A TDF competition gets the catalog as it always was. One
 * with PDF-era games adds the legacy MVP and drops every stat no game in it supplies — the
 * event-derived ones, when all its games are PDF-era — rather than show a column of dashes.
 */
export function statCatalogFor(
  legacy: boolean,
  stats: readonly CompetitionTeamPlayerStat[],
): TeamStatDef[] {
  if (!legacy) return TEAM_STATS.filter((s) => !s.legacyOnly);
  return TEAM_STATS.filter((s) => stats.some((row) => row[s.field] !== null));
}

/**
 * Resolves URL stat tokens to catalog entries, dropping anything unrecognised so a stale or
 * hand-edited link degrades instead of rendering an undefined column. Always returns catalog
 * order, never the order the tokens arrived in.
 */
export function resolveStatKeys(keys: string[], catalog: readonly TeamStatDef[]): TeamStatDef[] {
  const wanted = new Set(keys);
  return catalog.filter((s) => wanted.has(s.key));
}
