// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Config map for the legacy competition migration.
 *
 * The legacy database (`lfstats`) holds competitive-event metadata for games that
 * already exist in `lfstats_modern`. Games are matched across the two databases by
 * `replace(legacy.games.tdf_key, '_', '-') = modern.game.tdf_filename`.
 *
 * Only events whose games carry a `tdf_key` can be migrated: legacy `tdf_key` only
 * starts appearing in late 2019, and pre-TDF games (Nationals 2012 through ECT 2020,
 * WCT 5, Internationals 2014-2019) do not exist in the modern database at all.
 *
 * Every judgement call — name overrides, round renumbering, team short names — lives
 * here rather than in the migration logic, so it can be reviewed in one place.
 */

/**
 * `team` events have event_teams, rounds, and matches, and get the full treatment.
 *
 * `solo` events are individually-scored leagues with no teams, rounds, or matches in
 * the legacy schema — only an `event_players` list, sometimes with handicaps. They get a
 * competition row with `format = 'solo'` and their game assignments, and nothing else:
 * standings come from per-player scoring (see docs/Competition_Structure.md, "Solo
 * Competitions") rather than any team structure — do not "fix" these events by inventing
 * teams. Legacy handicaps are not migrated; events already migrated before the solo
 * format existed are flagged by src/scripts/backfill-solo-format.ts.
 */
export type LegacyEventKind = "team" | "solo";

export type LegacyEventConfig = {
  /** `events.id` in the legacy database. */
  legacyId: number;
  kind: LegacyEventKind;
  /** Legacy `events.name`, recorded so the config is readable without a DB query. */
  legacyName: string;
  /** Overrides the legacy name on the migrated competition. Only set to fix typos. */
  name?: string;
  /**
   * Pins `competition_round.round_number` for a legacy `rounds.id`, overriding the
   * derived ordering. Empty for every event today: the derived rule (sort on
   * `is_finals`, then `round` with NULL last, then `id`; number 1..N) already
   * produces the correct order for all four events whose legacy round numbers
   * collide (1009, 1361, 1415, 1736). Kept as a safety valve.
   */
  roundNumbers?: Record<number, number>;
  /**
   * Pins `competition_team.short_name` for a legacy `event_teams.id`. Auto-derived
   * short names are printed by the migration for review; add entries here to correct
   * them, or set them in the admin UI afterwards.
   */
  shortNames?: Record<number, string>;
};

export const LEGACY_EVENTS: LegacyEventConfig[] = [
  // --- Team events (teams, rounds, matches, derived rosters) ---------------
  { legacyId: 1103, kind: "team", legacyName: "Nerd Sturgis (St. George 2020)" },
  { legacyId: 1207, kind: "team", legacyName: "Fake Nats 2021" },
  { legacyId: 1238, kind: "team", legacyName: "SYR Fake Random Draw 2021" },
  { legacyId: 1009, kind: "team", legacyName: "Darmstadt 2021 Season 1" },
  { legacyId: 1312, kind: "team", legacyName: "WCT 2022" },
  { legacyId: 1361, kind: "team", legacyName: "Syracuse Shindig 2022" },
  { legacyId: 1415, kind: "team", legacyName: "St. George Random Bonanza 2022" },
  { legacyId: 1482, kind: "team", legacyName: "Internationals 2023" },
  { legacyId: 1646, kind: "team", legacyName: "Armageddon 2024" },
  { legacyId: 1736, kind: "team", legacyName: "ECT 2025" },
  { legacyId: 1813, kind: "team", legacyName: "St George Summer League 2025" },

  // --- Solo events (competition + game assignment only) --------------------
  { legacyId: 975, kind: "solo", legacyName: "Brisbane 2020 Season 1" },
  { legacyId: 1070, kind: "solo", legacyName: "Brisbane 2020 Season 2 - Round 1" },
  { legacyId: 1082, kind: "solo", legacyName: "Brisbane 2020 Season 2 - Round 2" },
  { legacyId: 1108, kind: "solo", legacyName: "Brisbane 2020 Season 2 - Round 3" },
  { legacyId: 1118, kind: "solo", legacyName: "Brisbane 2020 Season 2 - Round 4" },
  { legacyId: 1172, kind: "solo", legacyName: "St George Super COVID FunTime BONANZA" },
  { legacyId: 1156, kind: "solo", legacyName: "Brisbane 2021 Season 2" },
  { legacyId: 1349, kind: "solo", legacyName: "LLT Summer 2022" },
  { legacyId: 1412, kind: "solo", legacyName: "Auckland Triple Threat 2022" },
  { legacyId: 1464, kind: "solo", legacyName: "Loveland Duos 2023" },
  { legacyId: 1479, kind: "solo", legacyName: "Loveland Summer League 2023" },
  { legacyId: 1548, kind: "solo", legacyName: "Loveland Winter League 2023" },
  {
    legacyId: 1893,
    kind: "solo",
    legacyName: "Uk Sumer Bash 2025",
    name: "UK Summer Bash 2025",
  },
];

/**
 * Legacy events already built by hand in the modern database. The migration skips
 * these and only reports a legacy-vs-modern diff for them.
 */
export const ALREADY_MIGRATED: Record<number, string> = {
  1612: "(inter)nationals_2024",
  1863: "internationals_2025",
  1915: "syracuse_shindig_2025",
  1988: "loveland_random_draw_2026",
  2024: "internationals_2026",
};

export function findLegacyEvent(legacyId: number): LegacyEventConfig | undefined {
  return LEGACY_EVENTS.find((e) => e.legacyId === legacyId);
}

// ---------------------------------------------------------------------------
// Team short-name derivation
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "in",
  "it",
  "its",
  "is",
  "not",
  "and",
  "or",
  "to",
  "from",
  "on",
  "at",
  "for",
]);

/**
 * Derives a starting-point `competition_team.short_name` from a legacy team name.
 *
 * Legacy team names are free text and include emoji and punctuation
 * ("🥞Stacked Team🥞", "Team JACKAL! JACKAL! IT'S A JACKAL!"), while `slugify` only
 * lowercases and swaps whitespace for underscores — so feeding the raw name through
 * would produce slugs with emoji in them. Every derived value is printed by the
 * migration for review; correct them via `shortNames` or the admin UI.
 */
export function deriveShortName(rawName: string): string {
  const ascii = rawName
    .normalize("NFKD")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const withoutTeamPrefix = ascii.replace(/^team\s+/i, "");
  let tokens = withoutTeamPrefix.split(/[^A-Za-z0-9]+/).filter(Boolean);

  // A trailing single character is a discriminator ("Syracuse A" vs "Syracuse B")
  // and must survive truncation, or sibling teams collapse onto the same name.
  // Extract it *before* dropping stopwords, or "A" gets swallowed as an article
  // and "Syracuse A" derives the same name as plain "Syracuse".
  let suffix = "";
  const last = tokens.at(-1);
  if (last !== undefined && last.length === 1) {
    suffix = last.toUpperCase();
    tokens = tokens.slice(0, -1);
  }

  const main = tokens
    .filter((t) => !STOPWORDS.has(t.toLowerCase()))
    // Single characters left mid-name are apostrophe debris ("Loki's" -> ["Loki","s"]),
    // not words; keeping them corrupts the initials ("00Fatness's Angels" -> "0SA").
    .filter((t) => t.length > 1);

  let base: string;
  if (main.length === 0) {
    base = "TEAM";
  } else if (main.length === 1) {
    base = main[0];
  } else if (main.length === 2) {
    // Prefer the leading word when it can stand alone; fall back to initials when
    // it is a stub ("St. George" -> SG, not ST).
    base = main[0].length >= 3 ? main[0] : main[0][0] + main[1][0];
  } else {
    base = main.map((t) => t[0]).join("");
  }

  // Leave room for the discriminator; a suffixed name reads better short
  // ("SYRACA"/"SYRACB") than truncated to the wire ("SYRACUSA"/"SYRACUSB").
  const maxBase = suffix ? 5 : 8;
  return (base.slice(0, maxBase) + suffix).toUpperCase();
}

/**
 * Makes derived short names unique within a competition by appending 2, 3, ...
 * `competition_team` has a unique constraint on both (competition_id, name) and
 * (competition_id, slug), and the slug is derived from the short name.
 */
export function uniquifyShortName(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  let n = 2;
  while (used.has(`${candidate}${n}`)) n += 1;
  const result = `${candidate}${n}`;
  used.add(result);
  return result;
}
