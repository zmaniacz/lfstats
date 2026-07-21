// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { LbGameDetailPlayer, LbGameDetailTeam, LbMatchDetail } from "@lfstats/db";

function sumScorecards(rows: LbGameDetailPlayer[]): LbGameDetailPlayer {
  const [first, ...rest] = rows;
  const combined = { ...first! };
  for (const row of rest) {
    for (const key of Object.keys(combined) as (keyof LbGameDetailPlayer)[]) {
      const base = combined[key];
      const value = row[key];
      if (typeof base === "number" && typeof value === "number") {
        (combined as Record<string, unknown>)[key] = base + value;
      }
    }
  }
  return combined;
}

// Combined per-player totals for one side across every linked half/overtime
// game. Guests (null playerId) have no stable identity across games — each
// half's appearance is kept as its own row rather than merged, matching the
// same caution already applied in getLbMatchRosterWarnings.
export function combineSidePlayers(
  matchDetail: LbMatchDetail,
  gamesById: Map<string, LbGameDetailTeam[]>,
  side: "side1" | "side2",
): LbGameDetailPlayer[] {
  const byPlayerId = new Map<string, LbGameDetailPlayer[]>();
  const guestRows: LbGameDetailPlayer[] = [];

  for (const h of matchDetail.halves) {
    const teams = gamesById.get(h.gameId) ?? [];
    const team = teams.find((t) => t.id === h[side].gameTeamId);
    if (!team) continue;
    for (const p of team.players) {
      if (p.playerId) {
        const list = byPlayerId.get(p.playerId) ?? [];
        list.push(p);
        byPlayerId.set(p.playerId, list);
      } else {
        guestRows.push(p);
      }
    }
  }

  const combined = [...byPlayerId.values()].map(sumScorecards);
  return [...combined, ...guestRows].sort((a, b) => b.goals - a.goals);
}
