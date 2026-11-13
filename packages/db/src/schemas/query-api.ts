// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { z } from "zod";
import { HIGHLIGHT_CATEGORIES } from "../lib/highlights/detectors";
import {
  competitionCategoryEnum,
  competitionRoundTypeEnum,
  competitionStateEnum,
  competitionTypeEnum,
  gameOutcomeEnum,
  teamResultEnum,
} from "../schema";

// Request schemas for the query API (docs/Query_API_Spec.md). Each schema is the single
// source for HTTP body validation, the published JSON Schema and the MCP tool inputSchema,
// so `.describe()` text here is written for the model that will read it.
//
// Objects are strict: an unknown field is an error, never silently dropped. Models invent
// parameters, and a dropped filter returns a confident wrong answer.

/** SM5 positions in `sm5_scorecard.position` order: index + 1 is the stored code. */
export const POSITIONS = ["commander", "heavy", "scout", "ammo", "medic"] as const;
export type Position = (typeof POSITIONS)[number];

export function positionCode(position: Position): number {
  return POSITIONS.indexOf(position) + 1;
}

export const GAME_TYPES = ["sm5", "lb"] as const;
export type GameType = (typeof GAME_TYPES)[number];

export const GAME_KINDS = ["all", "social", "competitive"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const DATE_PRESETS = [
  "last_30_days",
  "last_90_days",
  "last_365_days",
  "this_year",
  "last_year",
  "all_time",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const ROUND_TYPES = competitionRoundTypeEnum.enumValues;
export const TEAM_RESULTS = teamResultEnum.enumValues;

const isoDate = z.iso.date().describe("YYYY-MM-DD, center-local");

export const DateRangeSchema = z
  .strictObject({
    preset: z
      .enum(DATE_PRESETS)
      .optional()
      .describe("Relative range resolved against the server's current date."),
    from: isoDate.optional().describe("Inclusive start date, YYYY-MM-DD."),
    to: isoDate.optional().describe("Inclusive end date, YYYY-MM-DD."),
  })
  .describe("Either `preset`, or `from` and/or `to`. Not both.");

const centerSlug = z
  .string()
  .regex(
    /^\d+-\d+$/,
    "Center slugs look like '4-23'. Use resolve to turn a center name into a slug.",
  );

const scopeFields = {
  game_type: z.enum(GAME_TYPES).describe("Default 'sm5'."),
  centers: z
    .array(centerSlug)
    .min(1)
    .max(20)
    .describe("Center slugs, e.g. '4-23'. Matches games at any of them."),
  competitions: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .describe("Competition slugs. Matches games in any of them."),
  game_kind: z
    .enum(GAME_KINDS)
    .describe(
      "'social' = no competition; 'competitive' = a competitive competition. Default 'all'.",
    ),
  round_types: z
    .array(z.enum(ROUND_TYPES))
    .min(1)
    .describe("Competition round types. SM5 only, and requires `competitions`."),
  date_range: DateRangeSchema,
  positions: z
    .array(z.enum(POSITIONS))
    .min(1)
    .describe("SM5 only. Filters scorecards (a player's games at these positions), not games."),
  team_result: z.enum(TEAM_RESULTS).describe("Only scorecards whose own team had this result."),
  include_mercenary_games: z
    .boolean()
    .nullable()
    .describe(
      "Default null = false when `competitions` is set (matching competition stat pages), otherwise true.",
    ),
  include_excluded: z
    .boolean()
    .describe("Include admin-excluded and aborted games. Default false; rarely wanted."),
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(10)
    .describe(
      "Game tag names (labels a center puts on games, e.g. 'League Night'), matched ignoring case. Matches games carrying any of them. The list tool shows the tags in use.",
    ),
};

export const ScopeSchema = z
  .strictObject({
    game_type: scopeFields.game_type.optional(),
    centers: scopeFields.centers.optional(),
    competitions: scopeFields.competitions.optional(),
    game_kind: scopeFields.game_kind.optional(),
    round_types: scopeFields.round_types.optional(),
    date_range: scopeFields.date_range.optional(),
    positions: scopeFields.positions.optional(),
    team_result: scopeFields.team_result.optional(),
    include_mercenary_games: scopeFields.include_mercenary_games.optional(),
    include_excluded: scopeFields.include_excluded.optional(),
    tags: scopeFields.tags.optional(),
  })
  .describe(
    "Which games and scorecards a query covers. Every field is optional; an empty scope is every non-excluded SM5 game.",
  );
export type ScopeInput = z.infer<typeof ScopeSchema>;

/**
 * A partial scope merged over another (e.g. `qualify.scope`). A field that is set replaces
 * the base value; `null` removes that filter. `game_type` cannot be overridden: qualifying
 * for an SM5 board on Laserball games is never what was meant.
 */
export const ScopeOverrideSchema = z
  .strictObject({
    centers: scopeFields.centers.nullable().optional(),
    competitions: scopeFields.competitions.nullable().optional(),
    game_kind: scopeFields.game_kind.nullable().optional(),
    round_types: scopeFields.round_types.nullable().optional(),
    date_range: scopeFields.date_range.nullable().optional(),
    positions: scopeFields.positions.nullable().optional(),
    team_result: scopeFields.team_result.nullable().optional(),
    include_mercenary_games: scopeFields.include_mercenary_games.optional(),
    include_excluded: scopeFields.include_excluded.nullable().optional(),
    tags: scopeFields.tags.nullable().optional(),
  })
  .describe("Fields here replace the base scope's; null removes a filter.");
export type ScopeOverride = z.infer<typeof ScopeOverrideSchema>;

// ---------------------------------------------------------------------------
// Endpoint request schemas
// ---------------------------------------------------------------------------

export const QUERY_LIMITS = {
  resolve_max_queries: 10,
  resolve_max_matches: 5,
  leaderboard_max_limit: 100,
  leaderboard_max_metrics: 10,
  leaderboard_max_min_games: 1000,
} as const;

export const CatalogRequestSchema = z.strictObject({});

const resolveList = (what: string) =>
  z
    .array(z.string().trim().min(1))
    .min(1)
    .max(QUERY_LIMITS.resolve_max_queries)
    .optional()
    .describe(what);

export const ResolveRequestSchema = z
  .strictObject({
    players: resolveList(
      "Player callsigns (current or previous), IPL ids ('#1234567') or member ids ('4-3-1137').",
    ),
    centers: resolveList("Center names, short names, cities or slugs ('4-23')."),
    competitions: resolveList("Competition names or slugs."),
  })
  .refine((r) => r.players || r.centers || r.competitions, {
    message: "Give at least one of players, centers or competitions.",
  })
  .describe(
    "Turns names into ids. Call this before any query that names a player, center or competition. If a result is 'ambiguous', ask the user which one they mean.",
  );
export type ResolveRequest = z.infer<typeof ResolveRequestSchema>;

const metricId = z.string().min(1).describe("A metric id from the catalog, e.g. 'avg_mvp'.");
const minGames = z.int().min(1).max(QUERY_LIMITS.leaderboard_max_min_games);

export const LeaderboardRequestSchema = z
  .strictObject({
    scope: ScopeSchema.optional(),
    sort_by: metricId.describe("Metric to rank by."),
    order: z
      .enum(["asc", "desc"])
      .nullable()
      .optional()
      .describe("Default: best first, from the metric's higher_is_better."),
    min_games: minGames
      .optional()
      .describe("Minimum games in `scope` to be ranked. Default 10. Mention it when answering."),
    qualify: z
      .strictObject({
        min_games: minGames.describe("Minimum games in the qualifying scope."),
        scope: ScopeOverrideSchema.optional(),
      })
      .optional()
      .describe(
        "Extra eligibility rule over a different scope, e.g. 'among players with at least 20 games in the last year'. qualify.scope is merged over `scope`.",
      ),
    limit: z
      .int()
      .min(1)
      .max(QUERY_LIMITS.leaderboard_max_limit)
      .optional()
      .describe("Default 10."),
    offset: z.int().min(0).optional(),
    metrics: z
      .array(metricId)
      .max(QUERY_LIMITS.leaderboard_max_metrics)
      .optional()
      .describe("Extra metric columns. sort_by and games are always included."),
    percentiles: z
      .array(metricId)
      .max(QUERY_LIMITS.leaderboard_max_metrics)
      .optional()
      .describe("Metrics (from sort_by or metrics) to also report as a 0–1 percentile, 1 = best."),
    group_by_position: z
      .boolean()
      .optional()
      .describe("SM5 only. One row per (player, position) instead of per player."),
  })
  .describe("Ranks players by one metric within a scope.");
export type LeaderboardRequest = z.infer<typeof LeaderboardRequestSchema>;

export const BREAKDOWNS = ["position", "period", "center", "game_kind"] as const;
export type Breakdown = (typeof BREAKDOWNS)[number];
export const PERIODS = ["month", "quarter", "year"] as const;
export type Period = (typeof PERIODS)[number];

export const PLAYER_STATS_LIMITS = {
  max_players: 10,
  max_breakdowns: 2,
  max_cells: 500,
} as const;

const playerRef = z
  .string()
  .trim()
  .min(1)
  .describe(
    "A callsign (current or previous), IPL id ('#1234567') or member id ('4-3-1137'). If a callsign matches more than one player, or only approximately, the request fails with ambiguous_player and the candidates: ask the user which one, then retry with its ipl_id.",
  );

export const PlayerStatsRequestSchema = z
  .strictObject({
    players: z
      .array(playerRef)
      .min(1)
      .max(PLAYER_STATS_LIMITS.max_players)
      .describe("1–10 players to report on side by side."),
    scope: ScopeSchema.optional(),
    metrics: z
      .array(metricId)
      .min(1)
      .max(QUERY_LIMITS.leaderboard_max_metrics)
      .optional()
      .describe(
        "Default: games, win_rate, avg_mvp, avg_score, avg_accuracy, avg_hit_diff. games is always included.",
      ),
    breakdown: z
      .array(z.enum(BREAKDOWNS))
      .max(PLAYER_STATS_LIMITS.max_breakdowns)
      .optional()
      .describe("Split each player's stats by up to two of: position, period, center, game_kind."),
    period: z
      .enum(PERIODS)
      .optional()
      .describe("Bucket size when breakdown includes 'period'. Default 'year'."),
    head_to_head: z
      .boolean()
      .optional()
      .describe(
        "Exactly 2 players: their record as teammates and as opponents, and tags landed on each other. Uses the scope's game filters only.",
      ),
    include_rating: z
      .boolean()
      .optional()
      .describe("Include each player's global rating (not scoped). Default true."),
    include_baseline: z
      .boolean()
      .optional()
      .describe("Include the same metrics averaged over everyone else in scope. Default true."),
    baseline_min_games: minGames
      .optional()
      .describe("Games a player needs in a cell to count toward the baseline. Default 10."),
  })
  .describe(
    "Stats for 1–10 named players over the same scope, for 'how is X doing' and 'compare X and Y'.",
  );
export type PlayerStatsRequest = z.infer<typeof PlayerStatsRequestSchema>;

export const GAME_OUTCOMES = gameOutcomeEnum.enumValues;
export const SEARCH_GAMES_SORTS = [
  "start_time_desc",
  "start_time_asc",
  "margin_asc",
  "margin_desc",
] as const;
export const SEARCH_GAMES_FIELDS = [
  "start_time",
  "center",
  "competition",
  "outcome",
  "margin",
  "teams",
  "excluded",
  "web_url",
] as const;
/**
 * Whether search_games returns legacy PDF-era SM5 games (2012–2020, from printed scorecards).
 * They are listed and searchable but never aggregated: no other endpoint reads them.
 */
export const LEGACY_MODES = ["include", "exclude", "only"] as const;
export type LegacyMode = (typeof LEGACY_MODES)[number];
export const SEARCH_GAMES_LIMITS = { max_limit: 100, default_limit: 20, max_players: 10 } as const;

export const SearchGamesRequestSchema = z
  .strictObject({
    scope: ScopeSchema.optional().describe(
      "Game filters. positions and team_result need `players` and then apply to those players' scorecards; include_mercenary_games is ignored.",
    ),
    players: z
      .strictObject({
        include: z
          .array(playerRef)
          .min(1)
          .max(SEARCH_GAMES_LIMITS.max_players)
          .describe("Players who must have played (callsigns, IPL ids or member ids)."),
        match: z
          .enum(["all", "any"])
          .optional()
          .describe("'all' (default): every listed player played. 'any': at least one did."),
        relation: z
          .enum(["any", "teammates", "opponents"])
          .optional()
          .describe("Exactly 2 players: require them on the same team, or opposing teams."),
      })
      .optional(),
    min_margin: z
      .int()
      .min(0)
      .optional()
      .describe("Minimum gap between the top two teams' effective scores."),
    max_margin: z.int().min(0).optional().describe("Maximum gap, e.g. 1000 for close games."),
    outcomes: z
      .array(z.enum(GAME_OUTCOMES))
      .min(1)
      .optional()
      .describe("game.outcome values. Default: all except aborted."),
    sort: z.enum(SEARCH_GAMES_SORTS).optional().describe("Default start_time_desc (newest first)."),
    limit: z.int().min(1).max(SEARCH_GAMES_LIMITS.max_limit).optional().describe("Default 20."),
    cursor: z.string().min(1).optional().describe("meta.next_cursor from the previous page."),
    fields: z
      .array(z.enum(SEARCH_GAMES_FIELDS))
      .min(1)
      .optional()
      .describe("Which fields to return; game_slug always is. Default: all."),
    include_rosters: z
      .boolean()
      .optional()
      .describe(
        "Add each team's players (callsign, position, score, MVP). Needs 'teams' in fields.",
      ),
    highlights: z
      .array(z.enum(HIGHLIGHT_CATEGORIES))
      .min(1)
      .optional()
      .describe(
        "SM5 only. Only games containing at least one of these highlight types: nuke_chain (five nukes in a row), comeback, medic_save, missile_chain, nuke_saved, nuke_denied, last_stand. Use game_detail with include_highlights to see them.",
      ),
    legacy: z
      .enum(LEGACY_MODES)
      .optional()
      .describe(
        "Legacy SM5 games (2012–2020, from printed scorecards; every result carries `legacy`): 'include' (default), 'exclude' or 'only'. They are never counted in player_stats or leaderboards.",
      ),
  })
  .describe("Finds games and returns compact summaries; follow up with game_detail for one game.");
export type SearchGamesRequest = z.infer<typeof SearchGamesRequestSchema>;

/** Query-string booleans arrive as text. */
const queryFlag = z.stringbool().optional();

export const GameDetailRequestSchema = z
  .strictObject({
    include_penalties: queryFlag.describe("Default true."),
    include_mvp_components: queryFlag.describe("Per-player MVP breakdown. Default false."),
    include_highlights: queryFlag.describe(
      "SM5 only. Notable moments (nuke chains, comebacks, medic saves…) with replay links. Default false.",
    ),
  })
  .describe("One game with every player's stats.");
export type GameDetailRequest = z.infer<typeof GameDetailRequestSchema>;

// ---------------------------------------------------------------------------
// Competitions, rankings, penalties and listings
// ---------------------------------------------------------------------------

const competitionOptions = {
  include_schedule:
    "Every scheduled or played game (SM5) or half (Laserball), finals included: round and match numbers, each side's teams (two for a trios side, three for duos), scores, and the game slug once played. Games not yet played have null actual_start_time, scores and game_slug. Default false.",
  include_rosters: "Each team's players. Default false.",
};

/** GET /competitions/{slug}: flags arrive as query-string text. */
export const CompetitionRequestSchema = z
  .strictObject({
    include_schedule: queryFlag.describe(competitionOptions.include_schedule),
    include_rosters: queryFlag.describe(competitionOptions.include_rosters),
  })
  .describe("One competition with its standings.");
export type CompetitionRequest = z.infer<typeof CompetitionRequestSchema>;

/** The MCP tool takes the slug as an argument, and booleans as booleans. */
export const CompetitionToolSchema = z
  .strictObject({
    slug: z
      .string()
      .min(1)
      .describe("Competition slug, e.g. 'internationals_2026', from resolve or list."),
    include_schedule: z.boolean().optional().describe(competitionOptions.include_schedule),
    include_rosters: z.boolean().optional().describe(competitionOptions.include_rosters),
  })
  .describe("One competition with its standings.");

export const RANKINGS_LIMITS = { max_limit: 200, default_limit: 25 } as const;

export const RankingsRequestSchema = z
  .strictObject({
    limit: z.int().min(1).max(RANKINGS_LIMITS.max_limit).optional().describe("Default 25."),
    offset: z.int().min(0).optional().describe("Ranks to skip, for paging. Default 0."),
  })
  .describe("The global SM5 player ranking, best first.");
export type RankingsRequest = z.infer<typeof RankingsRequestSchema>;

export const LIST_KINDS = ["centers", "competitions", "tags"] as const;
export const COMPETITION_CATEGORIES = competitionCategoryEnum.enumValues;
export const COMPETITION_STATES = competitionStateEnum.enumValues;
export const COMPETITION_TYPES = competitionTypeEnum.enumValues;
export const LIST_LIMITS = { max_limit: 200, default_limit: 100 } as const;

export const ListRequestSchema = z
  .strictObject({
    what: z.enum(LIST_KINDS).describe("Which list to return."),
    game_type: z
      .enum(GAME_TYPES)
      .optional()
      .describe("Competitions: only this game type. Centers and tags: ignored."),
    year: z
      .int()
      .min(2000)
      .max(2100)
      .optional()
      .describe("Competitions only: those that started in this calendar year."),
    category: z
      .enum(COMPETITION_CATEGORIES)
      .optional()
      .describe(
        "Competitions only. 'internationals' = the big annual championships, 'tournament' = other tournaments, 'league' = a site-run season.",
      ),
    state: z.enum(COMPETITION_STATES).optional().describe("Competitions only."),
    type: z
      .enum(COMPETITION_TYPES)
      .optional()
      .describe("Competitions only: 'competitive' or 'social'."),
    center: centerSlug
      .optional()
      .describe("Tags: only this center's tags. Competitions: only those it hosted."),
    limit: z.int().min(1).max(LIST_LIMITS.max_limit).optional().describe("Default 100."),
  })
  .describe(
    "Lists every center, competition or game tag, for questions with no name to resolve ('which tournaments ran in 2026?').",
  );
export type ListRequest = z.infer<typeof ListRequestSchema>;

export const PENALTY_LIMITS = { max_limit: 100, default_limit: 20, max_players: 10 } as const;

export const PenaltiesRequestSchema = z
  .strictObject({
    scope: ScopeSchema.optional().describe(
      "Which SM5 games to look in. positions and team_result apply to the penalized player's scorecard.",
    ),
    players: z
      .array(playerRef)
      .min(1)
      .max(PENALTY_LIMITS.max_players)
      .optional()
      .describe("Only penalties given to these players (callsigns, IPL ids or member ids)."),
    types: z
      .array(z.string().trim().min(1))
      .min(1)
      .max(10)
      .optional()
      .describe(
        "Penalty types, matched ignoring case, e.g. 'Common Foul'. meta.by_type lists the types present in scope.",
      ),
    include_rescinded: z
      .boolean()
      .optional()
      .describe("Include penalties that were later rescinded. Default false."),
    limit: z.int().min(1).max(PENALTY_LIMITS.max_limit).optional().describe("Default 20."),
    offset: z.int().min(0).optional(),
  })
  .describe("Finds SM5 player penalties across games, newest first.");
export type PenaltiesRequest = z.infer<typeof PenaltiesRequestSchema>;
