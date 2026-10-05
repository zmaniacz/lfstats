// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { z } from "zod";
import {
  CatalogRequestSchema,
  LeaderboardRequestSchema,
  PlayerStatsRequestSchema,
  ResolveRequestSchema,
  SearchGamesRequestSchema,
} from "../../schemas/query-api";
import { getQueryCatalog, QUERY_API_VERSION } from "./catalog";
import { getGameDetail, searchGames } from "./games";
import { getLeaderboard } from "./leaderboard";
import { getMetricCatalog } from "./metrics";
import { getPlayerStats } from "./player-stats";
import { resolveNames } from "./resolve";
import { localToday } from "./scope";

// The MCP tool set (docs/Query_API_Spec.md "MCP server"): one tool per query endpoint,
// sharing its zod schema and query function. The web app's /mcp route wires these into the
// MCP SDK; keeping them here keeps them testable and next to the code they describe.
//
// Descriptions are written for the model that reads them: what the tool answers, when to
// use it, and how to read its result.

export const MCP_SERVER_NAME = "lfstats";
export const MCP_SERVER_VERSION = QUERY_API_VERSION;

export const MCP_INSTRUCTIONS = `LFstats records Space Marines 5 (SM5) and Laserball laser tag games: per-player scorecards, team results, competitions and a global player rating.

How to use these tools:
- Players: pass callsigns straight to the tools. If a tool returns error code "ambiguous_player" (or resolve says "ambiguous"), ask the user which player they mean, using the candidates' home_center, games_played and last_played, then retry with that player's ipl_id. Never pick one yourself.
- Centers ("sites", "arenas") and competitions ("events", "tournaments"): call lfstats_resolve first; the other tools take them as slugs.
- Positions are commander, heavy, scout, ammo and medic. "MVP" means the per-game MVP points score; higher is better.
- Relative dates: use scope.date_range.preset (last_30_days, last_90_days, last_365_days, this_year, last_year, all_time) rather than computing dates.
- When answering, state the scope you used from meta.scope (dates, centers, positions), the number of games, and any meta.warnings. Treat fewer than ~10 games as a small sample and say so. Leaderboards only rank players with at least min_games games (default 10) — mention it.
- Link to web_url when present.
- Two game types: SM5 (the default) and Laserball. For Laserball questions set scope.game_type to "lb" and use the Laserball metrics (goals, assists, steals, blocks, …). Laserball has no positions, MVP, penalties or global rating.`;

export type McpTool = {
  name: string;
  title: string;
  description: string;
  /** Validates the arguments; also the source of the published JSON Schema. */
  schema: z.ZodType;
  run: (args: never) => Promise<{ data: unknown; meta?: Record<string, unknown> }>;
};

function metricList(): string {
  const ids = (gameType: "sm5" | "lb") =>
    getMetricCatalog()
      .filter((m) => m.game_type === gameType)
      .map((m) => `${m.id}${m.positions === "all" ? "" : ` (${m.positions.join("/")} only)`}`)
      .join(", ");
  return `SM5 — ${ids("sm5")}. Laserball (scope.game_type "lb") — ${ids("lb")}`;
}

/** game_detail takes the slug as an argument, and booleans as booleans, unlike the HTTP GET. */
export const GameDetailToolSchema = z
  .strictObject({
    slug: z
      .string()
      .min(1)
      .describe("Game slug, e.g. '4-23-20260808212334', from search_games or a game page URL."),
    include_penalties: z.boolean().optional().describe("Default true."),
    include_mvp_components: z
      .boolean()
      .optional()
      .describe("Per-player breakdown of how MVP points were earned. Default false."),
  })
  .describe("One game with every player's stats.");

export function mcpTools(): McpTool[] {
  const metrics = metricList();
  return [
    {
      name: "lfstats_resolve",
      title: "Resolve names",
      description:
        "Turn player callsigns, center names and competition names into ids. Required for centers and competitions (other tools take their slugs). For players it is optional — other tools accept callsigns — but useful to look someone up or to show the user candidates. Each name comes back 'unique', 'ambiguous' (ask the user which one) or 'not_found'.",
      schema: ResolveRequestSchema,
      run: (args: z.infer<typeof ResolveRequestSchema>) => resolveNames(args),
    },
    {
      name: "lfstats_leaderboard",
      title: "Leaderboard",
      description: `Rank players by one metric within a scope: "top 5 medics by average MVP at Syracuse", "best heavies at Internationals 2026 with at least 5 games". Only players with at least min_games games in scope are ranked (default 10). Use qualify for an extra eligibility rule over a different scope ("among players with 20+ games in the last year"). Metrics: ${metrics}.`,
      schema: LeaderboardRequestSchema,
      run: (args: z.infer<typeof LeaderboardRequestSchema>) => getLeaderboard(args, localToday()),
    },
    {
      name: "lfstats_player_stats",
      title: "Player stats",
      description: `Stats for 1–10 players over the same scope, side by side: "how is Brew doing this year", "compare Brew and Beanz at Syracuse over the last year". Optional breakdown by position, period, center or game_kind; a baseline of everyone else in scope for context; each player's global rating; and head_to_head for exactly two players (record as teammates and as opponents). Players can be callsigns. Metrics: ${metrics}.`,
      schema: PlayerStatsRequestSchema,
      run: (args: z.infer<typeof PlayerStatsRequestSchema>) => getPlayerStats(args, localToday()),
    },
    {
      name: "lfstats_search_games",
      title: "Search games",
      description:
        "Find games: by scope (center, competition, round type, dates), by players (callsigns; all or any of them; as teammates or opponents), by score margin and by outcome. Returns compact summaries with teams and scores, newest first or by margin, and meta.total_matches counts every match ('how many times did X play Y?' is one call with limit 1). Use lfstats_game_detail to look inside one game.",
      schema: SearchGamesRequestSchema,
      run: (args: z.infer<typeof SearchGamesRequestSchema>) => searchGames(args, localToday()),
    },
    {
      name: "lfstats_game_detail",
      title: "Game detail",
      description:
        "One game in full: teams, every player's stats, penalties, and optionally how each player's MVP points were earned. Laserball games return goals, steals, blocks and the like, plus the other half when the game is part of a two-half match. Takes a game slug from lfstats_search_games or a game page URL.",
      schema: GameDetailToolSchema,
      run: ({ slug, ...options }: z.infer<typeof GameDetailToolSchema>) =>
        getGameDetail(slug, options),
    },
    {
      name: "lfstats_catalog",
      title: "Catalog",
      description:
        "Every metric with its definition, every allowed filter value, the defaults and limits, and today's date on the server. Call it when unsure what a metric means or which values a field accepts.",
      schema: CatalogRequestSchema,
      run: async () => getQueryCatalog(localToday()),
    },
  ];
}

/** JSON Schema for a tool's arguments, as published in tools/list. */
export function toolInputSchema(tool: McpTool): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(tool.schema, { io: "input" }) as Record<
    string,
    unknown
  >;
  return schema;
}

/** The catalog as Markdown, published as the lfstats://docs/metrics resource. */
export function metricsMarkdown(): string {
  const rows = getMetricCatalog().map(
    (m) =>
      `| \`${m.id}\` | ${m.label} | ${m.definition} | ${m.positions === "all" ? "all" : m.positions.join(", ")} | ${m.higher_is_better ? "higher" : "lower"} |`,
  );
  return [
    "# LFstats metrics",
    "",
    "Per-game stats are averaged per game (mean of per-game values). Rates are fractions from 0 to 1.",
    "",
    "| id | Label | Definition | Positions | Better |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
