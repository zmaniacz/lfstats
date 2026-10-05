// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  lbGameTeam,
  lbScorecard,
  sm5GameTeam,
  sm5Scorecard,
} from "../../schema";
import {
  positionCode,
  type DatePreset,
  type GameKind,
  type GameType,
  type Position,
  type ScopeInput,
  type ScopeOverride,
} from "../../schemas/query-api";
import { dateRangeConditions } from "../scope";
import { QueryApiError, suggestionPrefix } from "./errors";
import { getAnalyticsDb } from "./pool";

// The query API's `scope` object (docs/Query_API_Spec.md "The scope object"), in three
// steps so the rules are testable without a database:
//
//   normalizeScope  — pure: defaults, date presets, cross-field validation
//   resolveScope    — slugs → ids (the only step that reads the database, via the
//                     read-only analytics pool)
//   scope*Conditions — pure: resolved scope → SQL
//
// The site's own GameScopeFilter (../scope.ts) stays the source of truth for the site's
// pages; this module shares its inclusive-day date logic rather than duplicating it.

export type NormalizedScope = {
  game_type: GameType;
  centers: string[] | null;
  competitions: string[] | null;
  game_kind: GameKind;
  round_types: (typeof competitionRound.$inferSelect)["type"][] | null;
  date_range: { preset: DatePreset | null; from: string | null; to: string | null };
  positions: Position[] | null;
  team_result: "win" | "loss" | "draw" | null;
  /** Null for Laserball, which has no mercenary concept. */
  include_mercenary_games: boolean | null;
  include_excluded: boolean;
};

export type CenterRef = { id: string; slug: string; name: string };
export type CompetitionRef = { id: string; slug: string; name: string };

export type ResolvedScope = NormalizedScope & {
  centerRefs: CenterRef[] | null;
  competitionRefs: CompetitionRef[] | null;
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** The server's current local date. Timestamps are center-local throughout LFstats. */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Date-only arithmetic in UTC so the host timezone and DST can never shift a day.
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive from/to for a preset. `last_N_days` runs from N days ago through today. */
export function resolveDatePreset(
  preset: DatePreset,
  today: string,
): { from: string | null; to: string | null } {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case "last_30_days":
      return { from: addDays(today, -30), to: today };
    case "last_90_days":
      return { from: addDays(today, -90), to: today };
    case "last_365_days":
      return { from: addDays(today, -365), to: today };
    case "this_year":
      return { from: `${year}-01-01`, to: today };
    case "last_year":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "all_time":
      return { from: null, to: null };
  }
}

// ---------------------------------------------------------------------------
// Normalize (pure)
// ---------------------------------------------------------------------------

function dedupe<T>(values: readonly T[] | undefined): T[] | null {
  if (!values || values.length === 0) return null;
  return [...new Set(values)];
}

/**
 * Applies defaults, expands date presets and enforces the rules that span fields. The
 * zod schema has already checked each field's own shape.
 */
export function normalizeScope(input: ScopeInput, today: string): NormalizedScope {
  const gameType = input.game_type ?? "sm5";
  const competitions = dedupe(input.competitions);
  const roundTypes = dedupe(input.round_types);
  const positions = dedupe(input.positions);

  if (positions && gameType === "lb") {
    throw new QueryApiError("invalid_scope", "Laserball has no positions.", {
      field: "scope.positions",
      hint: "Remove scope.positions, or set scope.game_type to 'sm5'.",
    });
  }
  if (roundTypes && gameType === "lb") {
    throw new QueryApiError("invalid_scope", "Round types apply to SM5 competitions only.", {
      field: "scope.round_types",
      hint: "Remove scope.round_types for Laserball queries.",
    });
  }
  if (roundTypes && !competitions) {
    throw new QueryApiError("invalid_scope", "scope.round_types requires scope.competitions.", {
      field: "scope.round_types",
      hint: "Add the competition slug(s) the rounds belong to, or remove scope.round_types.",
    });
  }

  const range = input.date_range;
  let dateRange: NormalizedScope["date_range"] = { preset: null, from: null, to: null };
  if (range) {
    if (range.preset && (range.from || range.to)) {
      throw new QueryApiError(
        "invalid_scope",
        "scope.date_range takes either `preset` or `from`/`to`, not both.",
        { field: "scope.date_range" },
      );
    }
    if (range.preset) {
      dateRange = { preset: range.preset, ...resolveDatePreset(range.preset, today) };
    } else {
      if (range.from && range.to && range.from > range.to) {
        throw new QueryApiError("invalid_scope", "scope.date_range.from is after `to`.", {
          field: "scope.date_range",
        });
      }
      dateRange = { preset: null, from: range.from ?? null, to: range.to ?? null };
    }
  }

  // Competition aggregates exclude mercenary scorecards (Core_Schema.md), but a player's
  // merc games are still their own games — so the default depends on the scope.
  const includeMercs =
    gameType === "lb" ? null : (input.include_mercenary_games ?? competitions === null);

  return {
    game_type: gameType,
    centers: dedupe(input.centers),
    competitions,
    game_kind: input.game_kind ?? "all",
    round_types: roundTypes,
    date_range: dateRange,
    positions,
    team_result: input.team_result ?? null,
    include_mercenary_games: includeMercs,
    include_excluded: input.include_excluded ?? false,
  };
}

/**
 * Merges a partial scope over a base (e.g. leaderboard `qualify.scope`). A set field
 * replaces the base value, `null` removes that filter, and an absent field is inherited.
 */
export function mergeScope(base: ScopeInput, override: ScopeOverride): ScopeInput {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged as ScopeInput;
}

// ---------------------------------------------------------------------------
// Resolve (database)
// ---------------------------------------------------------------------------

const centerSlugSql = sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`;

async function resolveCenters(slugs: string[]): Promise<CenterRef[]> {
  const pairs = slugs.map((s) => s.split("-").map(Number) as [number, number]);
  const db = getAnalyticsDb();
  const rows = await db
    .select({ id: center.id, slug: centerSlugSql, name: center.name })
    .from(center)
    .where(or(...pairs.map(([c, s]) => and(eq(center.countryCode, c), eq(center.siteCode, s)))));

  const found = new Map(rows.map((r) => [r.slug, r]));
  const missing = slugs.find((s) => !found.has(s));
  if (missing) {
    const all = await db.select({ slug: centerSlugSql }).from(center);
    throw new QueryApiError("center_not_found", `No center with slug '${missing}'.`, {
      field: "scope.centers",
      hint: `${suggestionPrefix(
        missing,
        all.map((r) => r.slug),
      )}Use resolve to turn a center name into its slug.`,
    });
  }
  return slugs.map((s) => found.get(s)!);
}

async function resolveCompetitions(slugs: string[]): Promise<CompetitionRef[]> {
  const db = getAnalyticsDb();
  const rows = await db
    .select({ id: competition.id, slug: competition.slug, name: competition.name })
    .from(competition)
    .where(inArray(competition.slug, slugs));

  const found = new Map(rows.map((r) => [r.slug, r]));
  const missing = slugs.find((s) => !found.has(s));
  if (missing) {
    const all = await db.select({ slug: competition.slug }).from(competition);
    throw new QueryApiError("competition_not_found", `No competition with slug '${missing}'.`, {
      field: "scope.competitions",
      hint: `${suggestionPrefix(
        missing,
        all.map((r) => r.slug),
      )}Use resolve to turn a competition name into its slug.`,
    });
  }
  return slugs.map((s) => found.get(s)!);
}

export async function resolveScope(scope: NormalizedScope): Promise<ResolvedScope> {
  const [centerRefs, competitionRefs] = await Promise.all([
    scope.centers ? resolveCenters(scope.centers) : null,
    scope.competitions ? resolveCompetitions(scope.competitions) : null,
  ]);
  return { ...scope, centerRefs, competitionRefs };
}

/** The resolved scope as echoed in `meta.scope`, so the model can state its assumptions. */
export function describeScope(scope: ResolvedScope) {
  return {
    game_type: scope.game_type,
    centers: scope.centerRefs?.map((c) => ({ slug: c.slug, name: c.name })) ?? null,
    competitions: scope.competitionRefs?.map((c) => ({ slug: c.slug, name: c.name })) ?? null,
    game_kind: scope.game_kind,
    round_types: scope.round_types,
    date_range: scope.date_range,
    positions: scope.positions,
    team_result: scope.team_result,
    include_mercenary_games: scope.include_mercenary_games,
    include_excluded: scope.include_excluded,
  };
}

// ---------------------------------------------------------------------------
// SQL (pure)
// ---------------------------------------------------------------------------

export type Sm5Source = { kind: "sm5"; sc: typeof sm5Scorecard; team: typeof sm5GameTeam };
export type LbSource = { kind: "lb"; sc: typeof lbScorecard; team: typeof lbGameTeam };
export type ScorecardSource = Sm5Source | LbSource;

export const SM5_SOURCE: Sm5Source = { kind: "sm5", sc: sm5Scorecard, team: sm5GameTeam };
export const LB_SOURCE: LbSource = { kind: "lb", sc: lbScorecard, team: lbGameTeam };

/** Game-level conditions over the `game` table. */
export function scopeGameConditions(scope: ResolvedScope): SQL[] {
  const conditions: SQL[] = [eq(game.type, scope.game_type)];

  if (!scope.include_excluded) conditions.push(eq(game.exclude, false));
  if (scope.centerRefs) {
    conditions.push(
      inArray(
        game.centerId,
        scope.centerRefs.map((c) => c.id),
      ),
    );
  }
  if (scope.competitionRefs) {
    conditions.push(
      inArray(
        game.competitionId,
        scope.competitionRefs.map((c) => c.id),
      ),
    );
  }

  if (scope.game_kind === "social") {
    conditions.push(isNull(game.competitionId));
  } else if (scope.game_kind === "competitive") {
    // A game in a `social`-type competition is neither social nor competitive.
    conditions.push(
      sql`${game.competitionId} in (select ${competition.id} from ${competition} where ${competition.type} = 'competitive')`,
    );
  }

  if (scope.round_types) {
    conditions.push(
      sql`exists (select 1 from ${competitionMatchGame}
        inner join ${competitionMatch} on ${competitionMatch.id} = ${competitionMatchGame.matchId}
        inner join ${competitionRound} on ${competitionRound.id} = ${competitionMatch.roundId}
        where ${competitionMatchGame.gameId} = ${game.id}
          and ${inArray(competitionRound.type, scope.round_types)})`,
    );
  }

  conditions.push(
    ...dateRangeConditions({
      dateFrom: scope.date_range.from ?? undefined,
      dateTo: scope.date_range.to ?? undefined,
    }),
  );
  return conditions;
}

/**
 * Scorecard-level conditions. The caller joins `src.team` on the scorecard's team, since
 * `team_result` and most metrics need it anyway.
 */
export function scopeScorecardConditions(scope: ResolvedScope, src: ScorecardSource): SQL[] {
  const conditions: SQL[] = [];
  if (src.kind === "sm5") {
    if (scope.positions) {
      conditions.push(inArray(src.sc.position, scope.positions.map(positionCode)));
    }
    if (scope.include_mercenary_games === false) {
      conditions.push(eq(src.sc.isMercenary, false));
    }
  }
  if (scope.team_result) conditions.push(eq(src.team.result, scope.team_result));
  return conditions;
}

/**
 * Guests have no stable identity (null player_id), so anything grouped by player drops
 * them. They still count in game-level figures such as team scores.
 */
export function identifiedPlayerCondition(src: ScorecardSource): SQL {
  return isNotNull(src.sc.playerId);
}
