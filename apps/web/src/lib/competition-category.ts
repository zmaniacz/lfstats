// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionCategory } from "@lfstats/db";

/**
 * The order the browse page shows the categories in — biggest events first, then the
 * long tail of tournaments, then the local leagues.
 */
export const COMPETITION_CATEGORY_ORDER: CompetitionCategory[] = [
  "internationals",
  "tournament",
  "league",
];

/** Section heading on `/competitions`, and the badge text everywhere else. */
export const COMPETITION_CATEGORY_LABELS: Record<CompetitionCategory, string> = {
  internationals: "Internationals",
  tournament: "Tournaments",
  league: "Leagues",
};

/** Singular form, for a badge on a single competition. */
export const COMPETITION_CATEGORY_SINGULAR: Record<CompetitionCategory, string> = {
  internationals: "Internationals",
  tournament: "Tournament",
  league: "League",
};

export const COMPETITION_CATEGORY_DESCRIPTIONS: Record<CompetitionCategory, string> = {
  internationals: "The big annual championships, drawing teams from centers worldwide.",
  tournament: "Every other tournament — invitationals, random draws and one-off team events.",
  league: "Local seasons run at a single center, played out over weeks.",
};

/** Admin form select options, in the same order as the browse page. */
export const COMPETITION_CATEGORY_FORM_LABELS: Record<CompetitionCategory, string> = {
  internationals: "Internationals (annual championship)",
  tournament: "Tournament (team event)",
  league: "League (local season)",
};
