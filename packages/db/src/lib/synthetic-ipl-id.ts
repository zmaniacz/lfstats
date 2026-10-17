// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Legacy PDF-era players often have no IPL id: the printed scorecards never carried
 * one. They still get a `player` row, keyed by a synthetic IPL id that names the
 * legacy player instead — `L-<legacy player id>`, or `L-<id>-<variant>` where one
 * legacy id had to be split into several people.
 *
 * Real IPL ids never start with `L-`, so the prefix alone identifies these players.
 * `legacy_player_map.synthetic` records the same fact for SQL readers.
 */
export const SYNTHETIC_IPL_PREFIX = "L-";

export function syntheticIplId(legacyPlayerId: number, variant = 0): string {
  return variant === 0
    ? `${SYNTHETIC_IPL_PREFIX}${legacyPlayerId}`
    : `${SYNTHETIC_IPL_PREFIX}${legacyPlayerId}-${variant}`;
}

export function isSyntheticIplId(iplId: string | null | undefined): boolean {
  return !!iplId && iplId.startsWith(SYNTHETIC_IPL_PREFIX);
}
