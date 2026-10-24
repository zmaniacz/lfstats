// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionFormat } from "@lfstats/db";

export const COMPETITION_FORMAT_LABELS: Record<CompetitionFormat, string> = {
  team: "Team (matches & rounds)",
  solo: "Solo (individual scoring)",
  none: "No Scoring (games only, scored elsewhere)",
  trios: "Trios (two trios per side, matches & rounds)",
  duos: "Duos (three duos per side, matches & rounds)",
};

/** The short badge form, for the browse and admin lists. `team` is the default and unbadged. */
export const COMPETITION_FORMAT_BADGES: Partial<Record<CompetitionFormat, string>> = {
  solo: "Solo",
  none: "No Scoring",
  trios: "Trios",
  duos: "Duos",
};

/**
 * What one competition team is called in a format: a trio or duo where several share a side,
 * otherwise a team. Used for standings headings and admin prompts.
 */
export function competitionTeamNoun(format: CompetitionFormat): "Team" | "Trio" | "Duo" {
  return format === "trios" ? "Trio" : format === "duos" ? "Duo" : "Team";
}
