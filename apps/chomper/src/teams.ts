// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { ParsedTeam } from "./types.js";

/**
 * Neutral team names as written by localized Laserforce installs. Lowercased.
 * Only a fallback — the structural rule in isNeutralTeam() catches any
 * language, this list just covers a file whose structure is unusual.
 */
const NEUTRAL_TEAM_NAMES = new Set(["neutral", "neutral team", "neutrální"]);

/**
 * Whether a line-type-2 team is the non-competing Neutral team (targets,
 * referees, beacons).
 *
 * The team name is localized by the center ("Neutral", "Neutrální", ...), so it
 * can't be the primary signal. Per TDF_Spec.md the Neutral team is always the
 * last team entry, and across the ingested corpus it is also the only team
 * with colour-enum 0 ("None"). Both together are required, so a real team that
 * happens to be configured with colour None is not swept up.
 */
export function isNeutralTeam(team: ParsedTeam, teams: readonly ParsedTeam[]): boolean {
  if (NEUTRAL_TEAM_NAMES.has(team.desc.trim().toLowerCase())) return true;
  const lastIndex = Math.max(...teams.map((t) => t.index));
  return team.colourEnum === 0 && team.index === lastIndex;
}
