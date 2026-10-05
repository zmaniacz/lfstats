// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, desc, eq, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  center,
  competition,
  game,
  playerRating,
  sm5GamePlayerInteraction,
  sm5GameTeam,
  sm5RatingModel,
  sm5Scorecard,
} from "../../schema";
import {
  PLAYER_STATS_LIMITS,
  POSITIONS,
  type Breakdown,
  type Period,
  type PlayerStatsRequest,
} from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import { centerSlugSql, dataAsOf, gameSlugSql, scopedMeta } from "./meta";
import { checkMetricPositions, getMetric, metricSql, type MetricDef } from "./metrics";
import { getAnalyticsDb } from "./pool";
import { identifyPlayers, type IdentifiedPlayer } from "./resolve";
import {
  identifiedPlayerCondition,
  normalizeScope,
  resolveScope,
  scopeGameConditions,
  scopeScorecardConditions,
  SM5_SOURCE,
  type ResolvedScope,
} from "./scope";

// POST /player_stats (docs/Query_API_Spec.md): 1–10 named players over one scope, with
// optional breakdowns, a baseline of everyone else, global ratings and head-to-head.

export const DEFAULT_PLAYER_STATS_METRICS = [
  "games",
  "win_rate",
  "avg_mvp",
  "avg_score",
  "avg_accuracy",
  "avg_hit_diff",
] as const;
export const DEFAULT_BASELINE_MIN_GAMES = 10;
export const DEFAULT_PERIOD: Period = "year";
/** Below this many games in scope a player's numbers get a small-sample warning. */
const SMALL_SAMPLE = 10;
const RECENT_GAMES = 10;

type Row = Record<string, unknown>;
type MetricValues = Record<string, number | null>;
type Cell = {
  position?: string;
  period?: string;
  center?: { slug: string; name: string };
  game_kind?: string;
};

// ---------------------------------------------------------------------------
// Breakdown dimensions
// ---------------------------------------------------------------------------

const PERIOD_FORMAT: Record<Period, string> = {
  year: "YYYY",
  quarter: 'YYYY-"Q"Q',
  month: "YYYY-MM",
};

/** SQL for one breakdown dimension, evaluated per scorecard. */
function dimensionSql(dim: Breakdown, period: Period): SQL {
  const src = SM5_SOURCE;
  switch (dim) {
    case "position":
      return sql`${src.sc.position}`;
    case "period":
      // The format is a constant from this file, never user input.
      return sql`to_char(${game.startTime}, ${sql.raw(`'${PERIOD_FORMAT[period]}'`)})`;
    case "center":
      return sql`(select ${centerSlugSql} from ${center} where ${center.id} = ${game.centerId})`;
    case "game_kind":
      // Matches scope.game_kind; a game in a social-type competition is neither.
      return sql`case
        when ${game.competitionId} is null then 'social'
        when (select ${competition.type} from ${competition} where ${competition.id} = ${game.competitionId}) = 'competitive' then 'competitive'
        else 'social_competition' end`;
  }
}

function dimAlias(dim: Breakdown) {
  return sql.identifier(`dim__${dim}`);
}

function cellOf(row: Row, dims: readonly Breakdown[], centerNames: Map<string, string>): Cell {
  const cell: Cell = {};
  for (const dim of dims) {
    const v = row[`dim__${dim}`];
    if (dim === "position") cell.position = POSITIONS[Number(v) - 1];
    else if (dim === "center")
      cell.center = { slug: String(v), name: centerNames.get(String(v)) ?? "" };
    else cell[dim] = String(v);
  }
  return cell;
}

function cellKey(row: Row, dims: readonly Breakdown[]): string {
  return dims.map((d) => String(row[`dim__${d}`])).join("|");
}

function metricValues(row: Row, metrics: readonly MetricDef[]): MetricValues {
  return Object.fromEntries(
    metrics.map((m) => [m.id, row[m.id] === null ? null : Number(row[m.id])]),
  );
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

type AggregateOptions = {
  scope: ResolvedScope;
  metrics: readonly MetricDef[];
  dims: readonly Breakdown[];
  period: Period;
  playerCondition: SQL;
};

/** One row per (player, cell): the metrics over that player's scorecards in the cell. */
function perPlayerSql(opts: AggregateOptions, having?: SQL): SQL {
  const src = SM5_SOURCE;
  const dimColumns = opts.dims.map((d) => sql`, ${dimensionSql(d, opts.period)} as ${dimAlias(d)}`);
  const metricColumns = opts.metrics.map(
    (m) => sql`, ${metricSql(m, src)} as ${sql.identifier(m.id)}`,
  );
  // Ordinal GROUP BY: the dimension expressions are long, and `position` would otherwise
  // be ambiguous between the alias and the scorecard column.
  const groupBy = sql.join(
    Array.from({ length: opts.dims.length + 1 }, (_, i) => sql.raw(String(i + 1))),
    sql`, `,
  );
  return sql`
    select ${src.sc.playerId} as player_id ${sql.join(dimColumns, sql``)} ${sql.join(metricColumns, sql``)}
    from ${src.sc}
      inner join ${src.team} on ${src.team.id} = ${src.sc.teamId}
      inner join ${game} on ${game.id} = ${src.sc.gameId}
    where ${and(
      ...scopeGameConditions(opts.scope),
      ...scopeScorecardConditions(opts.scope, src),
      identifiedPlayerCondition(src),
      opts.playerCondition,
    )}
    group by ${groupBy}
    ${having ? sql`having ${having}` : sql``}`;
}

async function playerAggregates(opts: AggregateOptions): Promise<Row[]> {
  return [...(await getAnalyticsDb().execute<Row>(perPlayerSql(opts)))];
}

/**
 * The baseline: each metric computed per player, then averaged across players, so
 * frequent players don't dominate. Only players with `minGames` in a cell count.
 */
async function baselineAggregates(opts: AggregateOptions, minGames: number): Promise<Row[]> {
  const dimColumns = opts.dims.map((d) => sql`${dimAlias(d)}, `);
  const metricColumns = opts.metrics.map(
    (m) => sql`, avg(pp.${sql.identifier(m.id)})::float8 as ${sql.identifier(m.id)}`,
  );
  const groupBy =
    opts.dims.length === 0
      ? sql``
      : sql`group by ${sql.join(
          opts.dims.map((d) => dimAlias(d)),
          sql`, `,
        )}`;
  const rows = await getAnalyticsDb().execute<Row>(sql`
    with pp as (${perPlayerSql(opts, sql`count(*) >= ${minGames}`)})
    select ${sql.join(dimColumns, sql``)} count(*)::int as players ${sql.join(metricColumns, sql``)}
    from pp ${groupBy}`);
  return [...rows];
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

async function ratings(playerIds: string[]) {
  const db = getAnalyticsDb();
  // The active model, as in getActiveRatingModel(): not retired, newest release.
  const activeModel = sql`(select ${sm5RatingModel.id} from ${sm5RatingModel}
    where ${sm5RatingModel.retiredAt} is null order by ${sm5RatingModel.releasedAt} desc limit 1)`;
  const [rows, [total]] = await Promise.all([
    db
      .select({
        playerId: playerRating.playerId,
        rank: playerRating.rank,
        rating: playerRating.rating,
        standardError: playerRating.standardError,
        ratingGroup: playerRating.ratingGroup,
        gamesPlayed: playerRating.gamesPlayed,
        wins: playerRating.wins,
        losses: playerRating.losses,
        draws: playerRating.draws,
        windowStart: sql<string>`to_char(${playerRating.windowStart}, 'YYYY-MM-DD')`,
        windowEnd: sql<string>`to_char(${playerRating.windowEnd}, 'YYYY-MM-DD')`,
        modelVersion: sm5RatingModel.version,
      })
      .from(playerRating)
      .innerJoin(sm5RatingModel, eq(sm5RatingModel.id, playerRating.ratingModelId))
      .where(
        and(
          inArray(playerRating.playerId, playerIds),
          sql`${playerRating.ratingModelId} = ${activeModel}`,
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(playerRating)
      .where(sql`${playerRating.ratingModelId} = ${activeModel}`),
  ]);
  return { byPlayer: new Map(rows.map((r) => [r.playerId, r])), rankedPlayers: total?.n ?? 0 };
}

// ---------------------------------------------------------------------------
// Head-to-head
// ---------------------------------------------------------------------------

type Record3 = { games: number; wins: number; draws: number; losses: number };

async function headToHead(scope: ResolvedScope, pa: IdentifiedPlayer, pb: IdentifiedPlayer) {
  const db = getAnalyticsDb();
  const a = alias(sm5Scorecard, "a");
  const b = alias(sm5Scorecard, "b");
  const ta = alias(sm5GameTeam, "ta");
  const tb = alias(sm5GameTeam, "tb");

  // Game-level scope only: position, team_result and mercenary filters would have to
  // apply to both players at once, which has no sensible meaning for a matchup.
  const gameConditions = scopeGameConditions(scope);

  const shared = await db
    .select({
      slug: gameSlugSql,
      sameTeam: sql<boolean>`${a.teamId} = ${b.teamId}`,
      resultA: ta.result,
      resultB: tb.result,
      mvpA: a.mvpPoints,
      mvpB: b.mvpPoints,
    })
    .from(a)
    .innerJoin(b, and(eq(b.gameId, a.gameId), eq(b.playerId, pb.id)))
    .innerJoin(game, eq(game.id, a.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(ta, eq(ta.id, a.teamId))
    .innerJoin(tb, eq(tb.id, b.teamId))
    .where(and(eq(a.playerId, pa.id), ...gameConditions))
    .orderBy(desc(game.startTime));

  const src = alias(sm5Scorecard, "src");
  const tgt = alias(sm5Scorecard, "tgt");
  const direct = await db
    .select({
      playerId: src.playerId,
      shotsHit: sql<number>`sum(${sm5GamePlayerInteraction.shotsHit})::int`,
      deactivations: sql<number>`sum(${sm5GamePlayerInteraction.shotDeactivations})::int`,
      missileHits: sql<number>`sum(${sm5GamePlayerInteraction.missileHits})::int`,
    })
    .from(sm5GamePlayerInteraction)
    .innerJoin(src, eq(src.id, sm5GamePlayerInteraction.scorecardId))
    .innerJoin(tgt, eq(tgt.id, sm5GamePlayerInteraction.targetScorecardId))
    .innerJoin(game, eq(game.id, sm5GamePlayerInteraction.gameId))
    .where(
      and(
        inArray(src.playerId, [pa.id, pb.id]),
        inArray(tgt.playerId, [pa.id, pb.id]),
        sql`${src.playerId} <> ${tgt.playerId}`,
        sql`${src.teamId} <> ${tgt.teamId}`,
        ...gameConditions,
      ),
    )
    .groupBy(src.playerId);

  const teammates: Record3 = { games: 0, wins: 0, draws: 0, losses: 0 };
  let opponentGames = 0;
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let mvpA = 0;
  let mvpB = 0;
  for (const g of shared) {
    if (g.sameTeam) {
      teammates.games++;
      if (g.resultA === "win") teammates.wins++;
      else if (g.resultA === "draw") teammates.draws++;
      else if (g.resultA === "loss") teammates.losses++;
    } else {
      opponentGames++;
      mvpA += g.mvpA;
      mvpB += g.mvpB;
      if (g.resultA === "win") winsA++;
      else if (g.resultB === "win") winsB++;
      else if (g.resultA === "draw") draws++;
    }
  }

  const directBy = new Map(direct.map((d) => [d.playerId, d]));
  const tags = (p: IdentifiedPlayer) => {
    const d = directBy.get(p.id);
    return {
      shots_hit: d?.shotsHit ?? 0,
      deactivations: d?.deactivations ?? 0,
      missile_hits: d?.missileHits ?? 0,
    };
  };

  return {
    games_together: shared.length,
    as_teammates: teammates,
    as_opponents: {
      games: opponentGames,
      record: { [pa.iplId]: winsA, [pb.iplId]: winsB, draws },
      avg_mvp:
        opponentGames === 0
          ? null
          : { [pa.iplId]: mvpA / opponentGames, [pb.iplId]: mvpB / opponentGames },
      // Tags each player landed on the other, across their games as opponents.
      direct: { [pa.iplId]: tags(pa), [pb.iplId]: tags(pb) },
    },
    recent_games: shared.slice(0, RECENT_GAMES).map((g) => g.slug),
  };
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export async function getPlayerStats(req: PlayerStatsRequest, today: string) {
  const normalized = normalizeScope(req.scope ?? {}, today);
  if (normalized.game_type === "lb") {
    throw new QueryApiError("invalid_scope", "Laserball player stats are not available yet.", {
      field: "scope.game_type",
      hint: "Only SM5 metrics exist so far. Remove scope.game_type or set it to 'sm5'.",
    });
  }

  const dims = dedupe(req.breakdown ?? []);
  if (req.period && !dims.includes("period")) {
    throw new QueryApiError("invalid_request", "period only applies with breakdown 'period'.", {
      field: "period",
      hint: "Add 'period' to breakdown, or remove period.",
    });
  }
  const period = req.period ?? DEFAULT_PERIOD;

  const metricIds = dedupe(["games", ...(req.metrics ?? DEFAULT_PLAYER_STATS_METRICS)]);
  const metrics = metricIds.map((id) => getMetric("sm5", id, "metrics"));
  const warnings: string[] = [];
  for (const m of metrics) {
    const w = checkMetricPositions(m, normalized.positions, "metrics");
    if (w) warnings.push(w);
  }

  const [players, scope] = await Promise.all([
    identifyPlayers(req.players, "players"),
    resolveScope(normalized),
  ]);
  // The same player given twice (e.g. by IPL id and member id) is reported once.
  const unique = [...new Map(players.map((p) => [p.id, p])).values()];
  const ids = unique.map((p) => p.id);

  if (req.head_to_head && unique.length !== 2) {
    throw new QueryApiError("invalid_request", "head_to_head needs exactly 2 distinct players.", {
      field: "head_to_head",
    });
  }

  const base = { scope, metrics, period };
  const mine = inArray(SM5_SOURCE.sc.playerId, ids);
  const others = notInArray(SM5_SOURCE.sc.playerId, ids);
  const includeBaseline = req.include_baseline ?? true;
  const baselineMin = req.baseline_min_games ?? DEFAULT_BASELINE_MIN_GAMES;

  const breakdownRows =
    dims.length > 0 ? await playerAggregates({ ...base, dims, playerCondition: mine }) : [];
  if (breakdownRows.length > PLAYER_STATS_LIMITS.max_cells) {
    throw new QueryApiError(
      "scope_too_broad",
      `The breakdown would return ${breakdownRows.length} cells; the limit is ${PLAYER_STATS_LIMITS.max_cells}.`,
      {
        field: "breakdown",
        hint: "Use a coarser period, a narrower date_range, or fewer players.",
      },
    );
  }

  const [overallRows, baselineOverall, baselineBreakdown, ratingInfo, h2h, latest, centers] =
    await Promise.all([
      playerAggregates({ ...base, dims: [], playerCondition: mine }),
      includeBaseline
        ? baselineAggregates({ ...base, dims: [], playerCondition: others }, baselineMin)
        : null,
      includeBaseline && dims.length > 0
        ? baselineAggregates({ ...base, dims, playerCondition: others }, baselineMin)
        : null,
      (req.include_rating ?? true) ? ratings(ids) : null,
      req.head_to_head ? headToHead(scope, unique[0]!, unique[1]!) : null,
      dataAsOf(scope),
      dims.includes("center")
        ? getAnalyticsDb().select({ slug: centerSlugSql, name: center.name }).from(center)
        : [],
    ]);
  const centerNames = new Map(centers.map((c) => [c.slug, c.name]));

  const sortCells = (rows: Row[]) =>
    rows.sort((x, y) =>
      cellKey(x, dims).localeCompare(cellKey(y, dims), undefined, { numeric: true }),
    );

  const overallBy = new Map(overallRows.map((r) => [String(r.player_id), r]));
  const emptyMetrics = Object.fromEntries(
    metricIds.map((id) => [id, id === "games" || id === "wins" ? 0 : null]),
  );

  const data = {
    players: unique.map((p) => {
      const overall = overallBy.get(p.id);
      const games = overall ? Number(overall.games) : 0;
      if (games === 0) warnings.push(`${p.callsign} (${p.iplId}) has no games in this scope.`);
      else if (games < SMALL_SAMPLE)
        warnings.push(
          `${p.callsign} has only ${games} games in this scope; treat as a small sample.`,
        );

      const rating = ratingInfo?.byPlayer.get(p.id);
      return {
        ipl_id: p.iplId,
        member_id: p.memberId,
        callsign: p.callsign,
        overall: overall ? metricValues(overall, metrics) : emptyMetrics,
        ...(dims.length > 0 && {
          breakdown: sortCells(breakdownRows.filter((r) => String(r.player_id) === p.id)).map(
            (r) => ({ ...cellOf(r, dims, centerNames), ...metricValues(r, metrics) }),
          ),
        }),
        ...(ratingInfo && {
          rating: rating
            ? {
                rank: rating.rank,
                of: ratingInfo.rankedPlayers,
                rating: rating.rating,
                standard_error: rating.standardError,
                rating_group: rating.ratingGroup,
                games_played: rating.gamesPlayed,
                wins: rating.wins,
                losses: rating.losses,
                draws: rating.draws,
                window_start: rating.windowStart,
                window_end: rating.windowEnd,
                model_version: rating.modelVersion,
              }
            : null,
        }),
      };
    }),
    ...(baselineOverall && {
      baseline: {
        min_games: baselineMin,
        overall: baselineOverall[0]
          ? {
              players: Number(baselineOverall[0].players),
              ...metricValues(baselineOverall[0], metrics),
            }
          : { players: 0 },
        ...(baselineBreakdown && {
          breakdown: sortCells(baselineBreakdown).map((r) => ({
            ...cellOf(r, dims, centerNames),
            players: Number(r.players),
            ...metricValues(r, metrics),
          })),
        }),
      },
    }),
    ...(h2h && { head_to_head: h2h }),
  };

  if (ratingInfo && unique.some((p) => !ratingInfo.byPlayer.has(p.id))) {
    warnings.push(
      "rating is null for players not in the current global ranking (too few recent games). The rating ignores scope.",
    );
  }
  if (h2h && (scope.positions || scope.team_result || scope.include_mercenary_games === false)) {
    warnings.push(
      "head_to_head uses the scope's game filters only; positions, team_result and include_mercenary_games do not apply to it.",
    );
  }

  const renamed = players.filter((p) => p.input !== p.iplId);
  return {
    data,
    meta: scopedMeta({
      scope,
      metricIds,
      rowCount: unique.length,
      truncated: false,
      warnings,
      dataAsOf: latest,
      extra: {
        ...(renamed.length > 0 && {
          resolved_players: Object.fromEntries(
            renamed.map((p) => [p.input, { ipl_id: p.iplId, matched_on: p.matchedOn }]),
          ),
        }),
        breakdown: dims,
        ...(dims.includes("period") && { period }),
      },
    }),
  };
}
