// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, sql, type SQL } from "drizzle-orm";
import { game, player } from "../../schema";
import { POSITIONS, type LeaderboardRequest, type Position } from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import { dataAsOf, scopedMeta } from "./meta";
import { checkMetricPositions, getMetric, metricSql, type MetricDef } from "./metrics";
import { getAnalyticsDb } from "./pool";
import {
  describeScope,
  identifiedPlayerCondition,
  mergeScope,
  normalizeScope,
  resolveScope,
  scopeGameConditions,
  scopeScorecardConditions,
  sourceFor,
  type ScorecardSource,
  type ResolvedScope,
} from "./scope";

// POST /leaderboard (docs/Query_API_Spec.md): rank players by one metric within a scope.

export const DEFAULT_MIN_GAMES = 10;
export const DEFAULT_LEADERBOARD_LIMIT = 10;

export type LeaderboardRow = {
  rank: number;
  ipl_id: string;
  member_id: string | null;
  callsign: string;
  position: Position | null;
  [metric: string]: unknown;
};

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Narrows the ranked population to the sort metric's positions. Without this a
 * position-specific sort (avg_nukes_detonated) would rank medics on nulls, and `games` /
 * `min_games` would count games the metric never saw.
 */
function narrowToMetricPositions(scope: ResolvedScope, metric: MetricDef): ResolvedScope {
  if (metric.positions === "all") return scope;
  const requested = scope.positions ?? POSITIONS;
  return { ...scope, positions: requested.filter((p) => metric.positions.includes(p)) };
}

/** Players with at least `minGames` games in the qualifying scope. */
function qualifiedPlayersSql(scope: ResolvedScope, src: ScorecardSource, minGames: number): SQL {
  // Uncorrelated: the inner FROM shadows the outer tables of the same name.
  return sql`${src.sc.playerId} in (
    select ${src.sc.playerId} from ${src.sc}
      inner join ${src.team} on ${src.team.id} = ${src.sc.teamId}
      inner join ${game} on ${game.id} = ${src.sc.gameId}
    where ${and(
      ...scopeGameConditions(scope),
      ...scopeScorecardConditions(scope, src),
      identifiedPlayerCondition(src),
    )}
    group by ${src.sc.playerId}
    having count(*) >= ${minGames}
  )`;
}

const pctColumn = (id: string) => sql.identifier(`pct__${id}`);

export async function getLeaderboard(req: LeaderboardRequest, today: string) {
  const scopeInput = req.scope ?? {};
  const normalized = normalizeScope(scopeInput, today);

  const gameType = normalized.game_type;
  if (gameType === "lb" && req.group_by_position) {
    throw new QueryApiError("invalid_request", "Laserball has no positions to group by.", {
      field: "group_by_position",
    });
  }

  const sortMetric = getMetric(gameType, req.sort_by, "sort_by");
  const metricIds = dedupe([sortMetric.id, "games", ...(req.metrics ?? [])]);
  const metrics = metricIds.map((id) => getMetric(gameType, id, "metrics"));

  const percentileIds = dedupe(req.percentiles ?? []);
  const strayPercentile = percentileIds.find((id) => !metricIds.includes(id));
  if (strayPercentile) {
    throw new QueryApiError(
      "invalid_request",
      `percentiles includes '${strayPercentile}', which is not sort_by or in metrics.`,
      { field: "percentiles", hint: `Add '${strayPercentile}' to metrics as well.` },
    );
  }

  const warnings: string[] = [];
  for (const m of metrics) {
    const warning = checkMetricPositions(
      m,
      normalized.positions,
      m === sortMetric ? "sort_by" : "metrics",
    );
    if (warning) warnings.push(warning);
  }

  const qualify = req.qualify;
  const [resolvedScope, qualifyScope] = await Promise.all([
    resolveScope(normalized),
    qualify
      ? resolveScope(normalizeScope(mergeScope(scopeInput, qualify.scope ?? {}), today))
      : null,
  ]);
  const scope = narrowToMetricPositions(resolvedScope, sortMetric);

  const minGames = req.min_games ?? DEFAULT_MIN_GAMES;
  const limit = req.limit ?? DEFAULT_LEADERBOARD_LIMIT;
  const offset = req.offset ?? 0;
  const byPosition = req.group_by_position ?? false;
  const descending = (req.order ?? (sortMetric.higher_is_better ? "desc" : "asc")) === "desc";

  const src = sourceFor(gameType);
  const conditions = [
    ...scopeGameConditions(scope),
    ...scopeScorecardConditions(scope, src),
    identifiedPlayerCondition(src),
  ];
  if (qualify && qualifyScope)
    conditions.push(qualifiedPlayersSql(qualifyScope, src, qualify.min_games));

  const metricColumns = sql.join(
    metrics.map((m) => sql`${metricSql(m, src)} as ${sql.identifier(m.id)}`),
    sql`, `,
  );
  // Only SM5 has positions; group_by_position was rejected above for Laserball.
  const position = src.kind === "sm5" && byPosition ? src.sc.position : null;
  const groupBy = position ? sql`${src.sc.playerId}, ${position}` : sql`${src.sc.playerId}`;
  const positionColumn = position ? sql`${position}` : sql`null::int`;

  const sortCol = sql.identifier(sortMetric.id);
  const percentileColumns = percentileIds.map((id) => {
    const m = getMetric(gameType, id, "percentiles");
    const col = sql.identifier(id);
    // Oriented so 1.0 is always best.
    const dir = m.higher_is_better ? sql`asc` : sql`desc`;
    return sql`, case when b.${col} is null then null
      else (percent_rank() over (partition by b.${col} is null order by b.${col} ${dir}))::float8
      end as ${pctColumn(id)}`;
  });

  const rows = await getAnalyticsDb().execute<Record<string, unknown>>(sql`
    with base as (
      select ${src.sc.playerId} as player_id, ${positionColumn} as position, ${metricColumns}
      from ${src.sc}
        inner join ${src.team} on ${src.team.id} = ${src.sc.teamId}
        inner join ${game} on ${game.id} = ${src.sc.gameId}
      where ${and(...conditions)}
      group by ${groupBy}
      having count(*) >= ${minGames}
    ),
    ranked as (
      select b.*,
        (rank() over (order by b.${sortCol} ${descending ? sql`desc` : sql`asc`}))::int as rnk,
        (count(*) over ())::int as population
        ${sql.join(percentileColumns, sql``)}
      from base b
      where b.${sortCol} is not null
    )
    select r.*, ${player.iplId} as ipl_id, ${player.memberId} as member_id,
      ${player.currentCallsign} as callsign
    from ranked r inner join ${player} on ${player.id} = r.player_id
    order by r.rnk, r.games desc, lower(trim(${player.currentCallsign})), ${player.iplId}
    limit ${limit} offset ${offset}
  `);

  const data: LeaderboardRow[] = [...rows].map((r) => {
    const row: LeaderboardRow = {
      rank: Number(r.rnk),
      ipl_id: String(r.ipl_id),
      member_id: (r.member_id as string | null) ?? null,
      callsign: String(r.callsign).trim(),
      position: r.position === null ? null : (POSITIONS[Number(r.position) - 1] ?? null),
    };
    for (const id of metricIds) row[id] = r[id] === null ? null : Number(r[id]);
    if (percentileIds.length > 0) {
      row.percentiles = Object.fromEntries(
        percentileIds.map((id) => {
          const v = r[`pct__${id}`];
          return [id, v === null ? null : Math.round(Number(v) * 10_000) / 10_000];
        }),
      );
    }
    return row;
  });

  let population = Number([...rows][0]?.population ?? 0);
  if (data.length === 0 && offset > 0) {
    // Paged past the end: the window count came back with no rows, so count directly.
    const [count] = await getAnalyticsDb().execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select 1 from ${src.sc}
          inner join ${src.team} on ${src.team.id} = ${src.sc.teamId}
          inner join ${game} on ${game.id} = ${src.sc.gameId}
        where ${and(...conditions)}
        group by ${groupBy}
        having count(*) >= ${minGames} and ${metricSql(sortMetric, src)} is not null
      ) q`);
    population = Number(count?.n ?? 0);
  }

  if (population === 0) {
    warnings.push(
      `No players have at least ${minGames} games in this scope${qualify ? " and pass qualify" : ""}. Try a lower min_games or a wider scope.`,
    );
  }

  return {
    data,
    meta: scopedMeta({
      scope,
      metricIds,
      rowCount: data.length,
      truncated: offset + data.length < population,
      warnings,
      dataAsOf: await dataAsOf(scope),
      extra: {
        ...(qualifyScope && {
          qualify_scope: describeScope(qualifyScope),
          qualify_min_games: qualify!.min_games,
        }),
        sort: { by: sortMetric.id, order: descending ? "desc" : "asc" },
        min_games: minGames,
        population,
        offset,
      },
    }),
  };
}
