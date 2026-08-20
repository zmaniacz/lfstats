// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionFormat } from "@lfstats/db";

export const COMPETITION_FORMAT_LABELS: Record<CompetitionFormat, string> = {
  team: "Team (matches & rounds)",
  solo: "Solo (individual scoring)",
  none: "No Scoring (games only, scored elsewhere)",
};

/** The short badge form, for the browse and admin lists. `team` is the default and unbadged. */
export const COMPETITION_FORMAT_BADGES: Partial<Record<CompetitionFormat, string>> = {
  solo: "Solo",
  none: "No Scoring",
};
