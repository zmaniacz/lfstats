// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { cookies } from "next/headers";
import {
  getCenterList,
  getCompetitiveCompetitions,
  type CenterListItem,
  type CompetitiveCompetitionSummary,
  type GameScopeFilter,
} from "@lfstats/db";
import { filterCookieNames, isScope, type Scope } from "./filter-cookies";

/** Raw filter params a generic page may receive. */
export type FilterSearchParams = {
  scope?: string;
  center?: string;
  competition?: string;
};

/** Resolved filter state plus the option lists the FilterBar needs to render. */
export type FilterContext = {
  scope: Scope;
  /** Selected center, or null for "all centers" (social/all scope). */
  center: CenterListItem | null;
  /** Selected competition, or null for "all competitions". */
  competition: CompetitiveCompetitionSummary | null;
  centers: CenterListItem[];
  competitions: CompetitiveCompetitionSummary[];
};

export type ResolveFilterContextOptions = {
  /** Scope used when no param/cookie applies. Defaults to "all". */
  defaultScope?: Scope;
  /** Restrict the page to a subset of scopes (e.g. competition-only pages). */
  allowedScopes?: Scope[];
  /**
   * Game type whose competitions populate the competition filter. Defaults to
   * "sm5". Laserball has no competitions yet, so "lb" yields an empty list.
   */
  gameType?: "sm5" | "lb";
};

const ALL = "all";

/**
 * Resolves the scope + center + competition for a generic page.
 *
 * Each dimension follows: explicit URL param > remembered cookie > default.
 * Invalid slugs fall through to the next source. Generalizes the older
 * resolveActiveCompetition() helper to the full scope model.
 */
export async function resolveFilterContext(
  searchParams: FilterSearchParams,
  options: ResolveFilterContextOptions = {},
): Promise<FilterContext> {
  const { allowedScopes, gameType = "sm5" } = options;

  // Laserball is displayed fully separately: it keeps its own filter cookies
  // (so an SM5 center selection can't hide Laserball games) and defaults to
  // "social" since all Laserball games are social.
  const cookieNames = filterCookieNames(gameType);
  const defaultScope: Scope = options.defaultScope ?? (gameType === "lb" ? "social" : "all");

  const [centers, competitions, cookieStore] = await Promise.all([
    getCenterList(),
    gameType === "lb" ? Promise.resolve([]) : getCompetitiveCompetitions(),
    cookies(),
  ]);

  const isAllowed = (s: Scope) => !allowedScopes || allowedScopes.includes(s);

  // --- scope ---
  const scopeCookie = cookieStore.get(cookieNames.scope)?.value;
  let scope: Scope = defaultScope;
  if (isScope(searchParams.scope) && isAllowed(searchParams.scope)) {
    scope = searchParams.scope;
  } else if (isScope(scopeCookie) && isAllowed(scopeCookie)) {
    scope = scopeCookie;
  }
  if (!isAllowed(scope)) {
    scope = allowedScopes?.[0] ?? defaultScope;
  }

  // Pick the first source that has an opinion (undefined = unspecified at that
  // source; null = explicitly "all"). Keeps an explicit "all" from being
  // clobbered by the default — important since ?? treats null as nullish.
  const pick = <T>(sources: (T | null | undefined)[], fallback: T | null): T | null => {
    for (const s of sources) {
      if (s !== undefined) return s;
    }
    return fallback;
  };

  // --- center (slug param/cookie; null = all centers) ---
  const centerCookie = cookieStore.get(cookieNames.center)?.value;
  const resolveCenter = (slug: string | undefined): CenterListItem | null | undefined => {
    if (!slug) return undefined; // not specified at this source
    if (slug === ALL) return null; // explicitly "all centers"
    return centers.find((c) => c.slug === slug) ?? undefined;
  };
  let center = pick<CenterListItem>(
    [resolveCenter(searchParams.center), resolveCenter(centerCookie)],
    null,
  );

  // --- competition (slug param/cookie; null = all competitions) ---
  const competitionCookie = cookieStore.get(cookieNames.competition)?.value;
  const resolveCompetition = (
    slug: string | undefined,
  ): CompetitiveCompetitionSummary | null | undefined => {
    if (!slug) return undefined;
    if (slug === ALL) return null;
    return competitions.find((c) => c.slug === slug) ?? undefined;
  };
  // Default to the most recent competition when nothing is remembered, so
  // competition-scope pages open on a real event rather than "all".
  let competition = pick<CompetitiveCompetitionSummary>(
    [resolveCompetition(searchParams.competition), resolveCompetition(competitionCookie)],
    competitions[0] ?? null,
  );

  // Normalize: clear the dimension(s) that don't apply to the resolved scope.
  if (scope === "social") competition = null;
  if (scope === "competition") center = null;
  if (scope === "all") {
    center = null;
    competition = null;
  }

  return { scope, center, competition, centers, competitions };
}

/** Adapts a resolved FilterContext into the db-layer GameScopeFilter. */
export function toGameScopeFilter(ctx: FilterContext): GameScopeFilter {
  switch (ctx.scope) {
    case "social":
      return ctx.center ? { scope: "social", centerId: ctx.center.id } : { scope: "social" };
    case "competition":
      return ctx.competition
        ? { scope: "competition", competitionId: ctx.competition.id }
        : { scope: "competition" };
    case "all":
      return { scope: "all" };
  }
}
