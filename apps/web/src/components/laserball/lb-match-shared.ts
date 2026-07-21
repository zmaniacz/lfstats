// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

export function halfLabel(half: number): string {
  return half === 3 ? "Overtime" : `Half ${half}`;
}

export function haltCaveat(outcome: string, excluded: boolean): string | null {
  if (excluded) return "Excluded from Stats";
  if (outcome === "replay") return "Replay";
  if (outcome === "aborted") return "Aborted";
  if (outcome === "forfeit") return "Forfeit";
  return null;
}
