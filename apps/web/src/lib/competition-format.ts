// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionFormat } from "@lfstats/db";

export const COMPETITION_FORMAT_LABELS: Record<CompetitionFormat, string> = {
  team: "Team (matches & rounds)",
  solo: "Solo (individual scoring)",
};
