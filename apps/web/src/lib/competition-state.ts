// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { CompetitionState } from "@lfstats/db";

export const COMPETITION_STATE_LABELS: Record<CompetitionState, string> = {
  preshow: "Preshow",
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
};

export function competitionStateBadgeVariant(
  state: CompetitionState,
): "default" | "secondary" | "outline" | "destructive" {
  switch (state) {
    case "active":
      return "default";
    case "upcoming":
      return "secondary";
    case "completed":
      return "outline";
    case "preshow":
      return "destructive";
  }
}
