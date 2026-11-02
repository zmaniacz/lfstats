// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { GameHighlight, HighlightCategory } from "@lfstats/db";
import { formatMs, formatMsAsSeconds, formatScore } from "@/lib/format";

export const HIGHLIGHT_LABELS: Record<HighlightCategory, string> = {
  nuke_chain: "5 Chain",
  comeback: "Comeback",
  missile_chain: "Missile Chain",
  nuke_saved: "Nuke Saved",
  medic_save: "Medic Save",
  nuke_denied: "Nuke Denied",
  last_stand: "Last Stand",
};

export function describeHighlight(h: GameHighlight): string {
  const player = h.primaryCallsign ?? "Unknown";
  const other = h.secondaryCallsign ?? "Unknown";

  switch (h.category) {
    case "nuke_chain":
      return `${player} detonated 5 nukes in ${formatMsAsSeconds(h.magnitude)}`;
    case "comeback":
      return `${h.teamName ?? "The winning team"} came back from ${formatScore(h.magnitude)} down`;
    case "missile_chain":
      return `${player} landed ${h.magnitude} missiles in ${formatMsAsSeconds(h.details.spanMs ?? null)}`;
    case "nuke_saved":
      return h.magnitude > 1
        ? `${player} downed ${h.magnitude} attackers mid-nuke`
        : `${player} downed ${other} mid-nuke`;
    case "medic_save":
      return h.magnitude > 1
        ? `${player} saved ${h.magnitude} teammates from a nuke with a team boost`
        : `${player} saved ${other} from a nuke with ${h.details.livesBefore ?? "few"} lives left`;
    case "nuke_denied":
      return `${player} denied ${other}'s nuke`;
    case "last_stand":
      return `${player} held on with one life for ${formatMs(h.magnitude)}`;
  }
}
