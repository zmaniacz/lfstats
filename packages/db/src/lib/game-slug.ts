// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * A game slug is `{countryCode}-{siteCode}-{YYYYMMDDHHmmss}`, e.g.
 * `4-23-20260808212334`. It is the identifier used in game page URLs, in the
 * public API, and anywhere a game needs to be named without exposing its uuid.
 *
 * The same string is built SQL-side as `gameSlugSql` in several query modules;
 * this is the inverse. Every consumer parses through here so the two halves
 * cannot drift apart.
 */
export type ParsedGameSlug = {
  countryCode: number;
  siteCode: number;
  /** `YYYYMMDDHHmmss`, compared against `to_char(start_time, 'YYYYMMDDHH24MISS')`. */
  timestamp: string;
};

export function parseGameSlug(slug: string): ParsedGameSlug | null {
  const parts = slug.split("-");
  if (parts.length !== 3) return null;

  const [cc, sc, ts] = parts;
  const countryCode = parseInt(cc!, 10);
  const siteCode = parseInt(sc!, 10);
  if (isNaN(countryCode) || isNaN(siteCode) || !/^\d{14}$/.test(ts!)) return null;

  return { countryCode, siteCode, timestamp: ts! };
}
