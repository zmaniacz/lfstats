// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { z } from "zod";
import { competitionRoundTypeEnum, teamResultEnum } from "../schema";

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
  })
  .describe("Fields here replace the base scope's; null removes a filter.");
export type ScopeOverride = z.infer<typeof ScopeOverrideSchema>;
