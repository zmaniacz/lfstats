// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  ALL_VALUE,
  filterCookieNames,
  GAME_TYPE_COOKIE,
  type FilterGameType,
  type Scope,
} from "@/lib/filter-cookies";

export type FilterUrlState = {
  scope: Scope;
  /** Center slug or null for "all centers". */
  center: string | null;
  /** Competition slug or null for "all competitions". */
  competition: string | null;
};

/**
 * Builds a page URL carrying the filter state. Only emits params relevant to
 * the active scope (so switching to "all" drops center/competition/extras), and
 * always drops `page` so pagination resets when filters change.
 */
export function buildFilterUrl(
  basePath: string,
  state: FilterUrlState,
  extras?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  params.set("scope", state.scope);

  if (state.scope === "social" && state.center) {
    params.set("center", state.center);
  }
  if (state.scope === "competition") {
    params.set("competition", state.competition ?? ALL_VALUE);
  }

  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value) params.set(key, value);
    }
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Persists the filter dimensions to cookies (1y) so other pages inherit them.
 * The cookie set is game-type specific so SM5 and Laserball never cross-contaminate.
 */
export function writeFilterCookies(
  state: Partial<FilterUrlState>,
  gameType: FilterGameType = "sm5",
): void {
  const names = filterCookieNames(gameType);
  const maxAge = 31536000; // 1 year
  const set = (name: string, value: string) => {
    document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
  };
  if (state.scope) set(names.scope, state.scope);
  if (state.center !== undefined) set(names.center, state.center ?? ALL_VALUE);
  if (state.competition !== undefined) {
    set(names.competition, state.competition ?? ALL_VALUE);
  }
}

/** Persists the active game type (1y) so other pages default to it. */
export function writeGameTypeCookie(gameType: FilterGameType): void {
  document.cookie = `${GAME_TYPE_COOKIE}=${gameType}; path=/; max-age=31536000; samesite=lax`;
}
