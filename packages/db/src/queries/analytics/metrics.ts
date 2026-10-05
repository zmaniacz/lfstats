// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, eq, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { POSITIONS, positionCode, type GameType, type Position } from "../../schemas/query-api";
import { QueryApiError, suggestionPrefix } from "./errors";
import type { LbSource, ScorecardSource, Sm5Source } from "./scope";

// The metric registry (docs/Query_API_Spec.md "Metric registry"). Adding a metric means
// adding one entry here: the catalog, request validation and the MCP tool schemas all
// read from this list.
//
// Every aggregate matches the site's own SQL so a chat answer agrees with the page it
// links to. In particular, per-game stats are the MEAN OF PER-GAME VALUES (avg(accuracy)),
// not a ratio of sums. An id never changes meaning; a different aggregation gets a new id.

export type MetricUnit = "count" | "points" | "ratio" | "fraction" | "ms";

/**
 * - count: number of rows (matching `where`, if given)
 * - avg:   mean of `expr` per scorecard
 * - sum:   total of `expr`
 * - rate:  share of rows where the boolean `expr` holds
 */
type Aggregation = "count" | "avg" | "sum" | "rate";

type MetricBase = {
  id: string;
  label: string;
  definition: string;
  unit: MetricUnit;
  higher_is_better: boolean;
  /** Positions where the stat is meaningful. Position-specific columns are null elsewhere. */
  positions: readonly Position[] | "all";
  agg: Aggregation;
};

export type Sm5Metric = MetricBase & {
  game_type: "sm5";
  expr?: (src: Sm5Source) => SQL;
  where?: (src: Sm5Source) => SQL;
};
export type LbMetric = MetricBase & {
  game_type: "lb";
  expr?: (src: LbSource) => SQL;
  where?: (src: LbSource) => SQL;
};
export type MetricDef = Sm5Metric | LbMetric;

const ALL = "all" as const;

function sm5(
  def: Omit<Sm5Metric, "game_type" | "positions"> & { positions?: Sm5Metric["positions"] },
): Sm5Metric {
  return { positions: ALL, ...def, game_type: "sm5" };
}

/** Mean of a scorecard column. */
function sm5Avg(
  id: string,
  label: string,
  definition: string,
  column: (src: Sm5Source) => SQL | AnyColumn,
  opts: { positions?: readonly Position[]; unit?: MetricUnit; higher_is_better?: boolean } = {},
): Sm5Metric {
  return sm5({
    id,
    label,
    definition,
    unit: opts.unit ?? "count",
    higher_is_better: opts.higher_is_better ?? true,
    positions: opts.positions ?? ALL,
    agg: "avg",
    expr: (src) => sql`${column(src)}`,
  });
}

export const SM5_METRICS: readonly Sm5Metric[] = [
  sm5({
    id: "games",
    label: "Games",
    definition: "Number of scorecards (games played) in scope.",
    unit: "count",
    higher_is_better: true,
    agg: "count",
  }),
  sm5({
    id: "wins",
    label: "Wins",
    definition: "Games where the player's team result was a win.",
    unit: "count",
    higher_is_better: true,
    agg: "count",
    where: (src) => eq(src.team.result, "win"),
  }),
  sm5({
    id: "win_rate",
    label: "Win rate",
    definition: "wins / games, as a fraction. Draws count as games but not wins.",
    unit: "fraction",
    higher_is_better: true,
    agg: "rate",
    expr: (src) => sql`${src.team.result} = 'win'`,
  }),
  sm5Avg(
    "avg_mvp",
    "Average MVP",
    "Mean of sm5_scorecard.mvp_points per game. Includes escalated penalty MVP deductions.",
    (s) => s.sc.mvpPoints,
    { unit: "points" },
  ),
  sm5({
    id: "total_mvp",
    label: "Total MVP",
    definition: "Sum of sm5_scorecard.mvp_points.",
    unit: "points",
    higher_is_better: true,
    agg: "sum",
    expr: (src) => sql`${src.sc.mvpPoints}`,
  }),
  sm5Avg(
    "avg_score",
    "Average score",
    "Mean of the player's own score per game. Penalty-free: penalties are tracked on the team.",
    (s) => s.sc.score,
    { unit: "points" },
  ),
  sm5Avg(
    "avg_accuracy",
    "Average accuracy",
    "Mean of per-game accuracy (shots_hit / shots_fired), as a fraction.",
    (s) => s.sc.accuracy,
    { unit: "fraction" },
  ),
  sm5Avg(
    "avg_hit_diff",
    "Average hit differential",
    "Mean of per-game hit_diff = shots_hit_opponent / max(times_hit, 1). Above 1 means landing more tags than received.",
    (s) => s.sc.hitDiff,
    { unit: "ratio" },
  ),
  sm5Avg(
    "avg_uptime_pct",
    "Average uptime",
    "Mean per-game share of time the player was active: uptime / (uptime + resupply_downtime + other_downtime).",
    (s) =>
      sql`${s.sc.uptime}::float8 / nullif(${s.sc.uptime} + ${s.sc.resupplyDowntime} + ${s.sc.otherDowntime}, 0)`,
    { unit: "fraction" },
  ),
  sm5Avg("avg_shots_hit", "Average shots hit", "Mean shots_hit per game.", (s) => s.sc.shotsHit),
  sm5Avg("avg_times_hit", "Average times hit", "Mean times_hit per game.", (s) => s.sc.timesHit, {
    higher_is_better: false,
  }),
  sm5Avg(
    "avg_medic_hits",
    "Average medic hits",
    "Mean medic_hits (tags landed on the opposing medic) per game.",
    (s) => s.sc.medicHits,
  ),
  sm5Avg(
    "avg_missiles_hit",
    "Average missile hits",
    "Mean missiles_hit_opponent per game.",
    (s) => s.sc.missilesHitOpponent,
    { positions: ["commander", "heavy"] },
  ),
  sm5Avg(
    "avg_eliminations",
    "Average eliminations",
    "Mean eliminated_opponent (opponents this player eliminated) per game.",
    (s) => s.sc.eliminatedOpponent,
  ),
  sm5Avg("avg_assists", "Average assists", "Mean assists per game.", (s) => s.sc.assists),
  sm5Avg(
    "avg_nukes_detonated",
    "Average nukes detonated",
    "Mean nukes_detonated per game.",
    (s) => s.sc.nukesDetonated,
    { positions: ["commander"] },
  ),
  sm5Avg(
    "avg_nukes_canceled",
    "Average nukes canceled",
    "Mean nukes_canceled (opposing nukes this player stopped) per game.",
    (s) => s.sc.nukesCanceled,
  ),
  sm5Avg(
    "avg_lives_left",
    "Average lives left",
    "Mean lives_left at game end.",
    (s) => s.sc.livesLeft,
  ),
  sm5({
    id: "elimination_rate",
    label: "Elimination rate",
    definition: "Share of games in which the player was eliminated, as a fraction.",
    unit: "fraction",
    higher_is_better: false,
    agg: "rate",
    expr: (src) => sql`${src.sc.eliminated}`,
  }),
  sm5Avg(
    "avg_resupplies_given",
    "Average resupplies given",
    "Mean resupplies_given per game.",
    (s) => s.sc.resuppliesGiven,
    { positions: ["ammo", "medic"] },
  ),
  sm5Avg(
    "avg_rapid_fire",
    "Average rapid fires",
    "Mean rapid_fire activations per game.",
    (s) => s.sc.rapidFire,
    { positions: ["scout"] },
  ),
  sm5Avg("avg_penalties", "Average penalties", "Mean penalties per game.", (s) => s.sc.penalties, {
    higher_is_better: false,
  }),
];

/**
 * Names models and people commonly use for a metric. Only ever used to suggest the real id
 * in an error, never accepted silently: the model should learn the real id and the
 * definition that comes with it. SM5 has no kill/death stat, so "kd" maps to hit_diff.
 */
const SM5_METRIC_ALIASES: Record<string, string> = {
  kd: "avg_hit_diff",
  kdr: "avg_hit_diff",
  kd_ratio: "avg_hit_diff",
  kill_death_ratio: "avg_hit_diff",
  hit_diff: "avg_hit_diff",
  hitdiff: "avg_hit_diff",
  mvp: "avg_mvp",
  mvp_points: "avg_mvp",
  average_mvp: "avg_mvp",
  accuracy: "avg_accuracy",
  acc: "avg_accuracy",
  score: "avg_score",
  winrate: "win_rate",
  win_pct: "win_rate",
  win_percentage: "win_rate",
  games_played: "games",
  kills: "avg_eliminations",
  eliminations: "avg_eliminations",
  uptime: "avg_uptime_pct",
  nukes: "avg_nukes_detonated",
};

/** Laserball has no positions, so every metric applies to every player. */
function lb(def: Omit<LbMetric, "game_type" | "positions">): LbMetric {
  return { ...def, positions: ALL, game_type: "lb" };
}

function lbAvg(
  id: string,
  label: string,
  definition: string,
  column: (src: LbSource) => SQL | AnyColumn,
  opts: { unit?: MetricUnit; higher_is_better?: boolean } = {},
): LbMetric {
  return lb({
    id,
    label,
    definition,
    unit: opts.unit ?? "count",
    higher_is_better: opts.higher_is_better ?? true,
    agg: "avg",
    expr: (src) => sql`${column(src)}`,
  });
}

// Laserball stats are a port of the European reference implementation; see
// docs/Laserball_Scorecard_Table_Spec.md for each column. The site has no Laserball
// aggregates yet, so these follow the SM5 convention: the mean of per-game values.
export const LB_METRICS: readonly LbMetric[] = [
  lb({
    id: "games",
    label: "Games",
    definition: "Number of Laserball scorecards (games played) in scope.",
    unit: "count",
    higher_is_better: true,
    agg: "count",
  }),
  lb({
    id: "wins",
    label: "Wins",
    definition: "Games where the player's team result was a win.",
    unit: "count",
    higher_is_better: true,
    agg: "count",
    where: (src) => eq(src.team.result, "win"),
  }),
  lb({
    id: "win_rate",
    label: "Win rate",
    definition: "wins / games, as a fraction. Draws count as games but not wins.",
    unit: "fraction",
    higher_is_better: true,
    agg: "rate",
    expr: (src) => sql`${src.team.result} = 'win'`,
  }),
  lbAvg("avg_goals", "Average goals", "Mean goals scored per game.", (s) => s.sc.goals),
  lb({
    id: "total_goals",
    label: "Total goals",
    definition: "Goals scored across all games in scope.",
    unit: "count",
    higher_is_better: true,
    agg: "sum",
    expr: (src) => sql`${src.sc.goals}`,
  }),
  lbAvg(
    "avg_assists",
    "Average assists",
    "Mean assists per game: first plus second assists (assists1 + assists2), the last two passers before a goal.",
    (s) => sql`${s.sc.assists1} + ${s.sc.assists2}`,
  ),
  lbAvg(
    "avg_steals",
    "Average steals",
    "Mean steals (taking the ball from an opponent) per game.",
    (s) => s.sc.stealsDone,
  ),
  lbAvg(
    "avg_steals_received",
    "Average times stolen from",
    "Mean times this player lost the ball to a steal per game.",
    (s) => s.sc.stealsReceived,
    { higher_is_better: false },
  ),
  lbAvg(
    "avg_blocks",
    "Average blocks",
    "Mean blocks on active opponents per game.",
    (s) => s.sc.blocksDone,
  ),
  lbAvg("avg_clears", "Average clears", "Mean clears thrown per game.", (s) => s.sc.clearsDone),
  lbAvg(
    "avg_failed_clears",
    "Average failed clears",
    "Mean failed clears per game, de-duplicated within a respawn-adjusted cooldown (failed_clears_calc).",
    (s) => s.sc.failedClearsCalc,
    { higher_is_better: false },
  ),
  lbAvg(
    "avg_clutch_saves",
    "Average clutch saves",
    "Mean clutch saves per game: a clear within 3s of being blocked, or a block within 3s of clearing.",
    (s) => s.sc.clutchSaves,
  ),
  lbAvg("avg_passes", "Average passes", "Mean passes thrown per game.", (s) => s.sc.passesDone),
  lbAvg(
    "avg_possession_ms",
    "Average possession time",
    "Mean time holding the ball per game, in milliseconds.",
    (s) => s.sc.possessionTimeMs,
    { unit: "ms" },
  ),
];

const LB_METRIC_ALIASES: Record<string, string> = {
  goals: "avg_goals",
  scoring: "avg_goals",
  assists: "avg_assists",
  steals: "avg_steals",
  blocks: "avg_blocks",
  clears: "avg_clears",
  passes: "avg_passes",
  possession: "avg_possession_ms",
  possession_time: "avg_possession_ms",
  turnovers: "avg_steals_received",
  winrate: "win_rate",
  win_pct: "win_rate",
  games_played: "games",
};

function registry(gameType: GameType): readonly MetricDef[] {
  return gameType === "sm5" ? SM5_METRICS : LB_METRICS;
}

/** Looks up a metric, or throws an error listing the valid ids. */
export function getMetric(gameType: GameType, id: string, field: string): MetricDef {
  const metrics = registry(gameType);
  const found = metrics.find((m) => m.id === id);
  if (found) return found;

  const ids = metrics.map((m) => m.id);
  const alias = (gameType === "sm5" ? SM5_METRIC_ALIASES : LB_METRIC_ALIASES)[id.toLowerCase()];
  const otherType = registry(gameType === "sm5" ? "lb" : "sm5").some((m) => m.id === id);
  throw new QueryApiError("invalid_metric", `Unknown ${gameType} metric '${id}'.`, {
    field,
    hint: alias
      ? `Did you mean '${alias}'? ${metrics.find((m) => m.id === alias)!.definition}`
      : otherType
        ? `'${id}' is a ${gameType === "sm5" ? "Laserball" : "SM5"} metric; check scope.game_type.`
        : `${suggestionPrefix(id, ids)}Valid metrics are listed by the catalog.`,
    validValues: ids,
  });
}

/**
 * Checks a metric against the scope's positions. Throws when none of the requested
 * positions record the stat; returns a warning when it is silently narrowed to a subset,
 * because avg() skips nulls and would otherwise turn "per game" into "per commander game".
 */
export function checkMetricPositions(
  metric: MetricDef,
  scopePositions: readonly Position[] | null,
  field: string,
): string | null {
  if (metric.positions === "all") return null;
  const requested = scopePositions ?? POSITIONS;
  const effective = requested.filter((p) => metric.positions.includes(p));
  if (effective.length === 0) {
    throw new QueryApiError(
      "metric_not_applicable",
      `${metric.id} only applies to ${metric.positions.join(", ")}, but scope.positions is ${requested.join(", ")}.`,
      {
        field,
        hint: `Choose another metric, or include ${metric.positions.join(" or ")} in scope.positions.`,
      },
    );
  }
  if (effective.length < requested.length) {
    return `${metric.id} is computed over ${effective.join(", ")} games only.`;
  }
  return null;
}

/** The aggregate SQL for a metric over scorecards joined to their team. */
export function metricSql(metric: MetricDef, src: ScorecardSource): SQL {
  if (metric.game_type !== src.kind) {
    throw new Error(`Metric ${metric.id} is ${metric.game_type}, source is ${src.kind}`);
  }
  // The pairing is checked above; TypeScript cannot narrow the two unions together, so
  // the builder is written once against the SM5 shape. Laserball metrics never reach the
  // position filter (their positions are always "all").
  const m = metric as Sm5Metric;
  const s = src as Sm5Source;

  const filters: SQL[] = [];
  if (m.where) filters.push(m.where(s));
  if (m.positions !== "all") {
    filters.push(inArray(s.sc.position, m.positions.map(positionCode)));
  }
  const filter = filters.length > 0 ? sql` filter (where ${and(...filters)})` : sql``;
  const expr = m.expr?.(s);

  switch (m.agg) {
    case "count":
      return sql`(count(*)${filter})::int`;
    case "avg":
      return sql`(avg((${expr})::float8)${filter})`;
    case "sum":
      return sql`coalesce(sum((${expr})::float8)${filter}, 0)`;
    case "rate":
      return sql`(avg(case when ${expr} then 1.0 else 0.0 end)${filter})::float8`;
  }
}

export type MetricCatalogEntry = {
  id: string;
  label: string;
  definition: string;
  game_type: GameType;
  positions: readonly Position[] | "all";
  unit: MetricUnit;
  higher_is_better: boolean;
};

export function metricCatalogEntry(m: MetricDef): MetricCatalogEntry {
  return {
    id: m.id,
    label: m.label,
    definition: m.definition,
    game_type: m.game_type,
    positions: m.positions,
    unit: m.unit,
    higher_is_better: m.higher_is_better,
  };
}

export function getMetricCatalog(): MetricCatalogEntry[] {
  return [...SM5_METRICS, ...LB_METRICS].map(metricCatalogEntry);
}
