// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Shared cookie + param vocabulary for the cross-page filter state.
 *
 * The generic pages (players, games, leaderboards, centers, penalties) all read
 * the same three filter dimensions — scope, center, competition — and persist
 * the last choice in a cookie so navigating between pages keeps your context.
 * Resolution order everywhere is: URL param > cookie > sensible default.
 *
 * This module is isomorphic (plain constants/types only) so it can be imported
 * from both server components and "use client" components.
 */

export const SCOPE_COOKIE = "lastScope";
export const CENTER_COOKIE = "lastCenterSlug";
export const COMPETITION_COOKIE = "lastCompetitionSlug";
export const GAME_TYPE_COOKIE = "lastGameType";

/** Game types display fully separately and keep independent filter cookies. */
export type FilterGameType = "sm5" | "lb";

/**
 * Cookie names for a game type's remembered filter state. SM5 uses the original
 * names; Laserball uses an `lb`-prefixed set so the two never cross-contaminate.
 */
export function filterCookieNames(gameType: FilterGameType): {
  scope: string;
  center: string;
  competition: string;
} {
  if (gameType === "lb") {
    return {
      scope: "lbLastScope",
      center: "lbLastCenterSlug",
      competition: "lbLastCompetitionSlug",
    };
  }
  return { scope: SCOPE_COOKIE, center: CENTER_COOKIE, competition: COMPETITION_COOKIE };
}

export type Scope = "social" | "competition" | "all";

export const SCOPES: readonly Scope[] = ["social", "competition", "all"];

export function isScope(value: string | undefined | null): value is Scope {
  return value === "social" || value === "competition" || value === "all";
}

/** Sentinel param value meaning "no specific center/competition selected". */
export const ALL_VALUE = "all";
