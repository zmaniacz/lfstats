// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

export function halfLabel(half: number): string {
  // Halves 1 and 2 are regulation; overtime halves follow, OT 1 being half 3.
  return half > 2 ? `OT ${half - 2}` : `Half ${half}`;
}

export function haltCaveat(outcome: string, excluded: boolean): string | null {
  if (excluded) return "Excluded from Stats";
  if (outcome === "replay") return "Replay";
  if (outcome === "aborted") return "Aborted";
  if (outcome === "forfeit") return "Forfeit";
  return null;
}
