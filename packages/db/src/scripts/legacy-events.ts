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
  1612: "inter_nationals_2024",
  1863: "internationals_2025",
  1915: "syracuse_shindig_2025",
  1988: "loveland_random_draw_2026",
  2024: "internationals_2026",
};

// ---------------------------------------------------------------------------
// PDF-era events (pre-TDF): see docs/Legacy_Migration_PDF_Events.md
// ---------------------------------------------------------------------------

/**
 * Legacy centers with no IPL id, mapped to a modern `country-site` code. Decided with
 * the site owner, 2026-10-17: two are aliases of a live center, the Armageddon events
 * were played at Syracuse, and closed centers take a `-999` site code. Shared by the PDF
 * game and PDF event migrations.
 */
export const LEGACY_CENTER_OVERRIDES: Record<number, string> = {
  1: "4-3", // Lasertag of Carmichael (Legacy)
  3: "4-23", // Armageddon 2014 — an event, played at Syracuse
  9: "4-23", // Armageddon 2015 — an event, played at Syracuse
  11: "4-999", // Lasertag of Santa Rosa — closed
  12: "4-6", // Laser Tag of Clinton Township — Detroit
  13: "4-43", // Invasion Laser Tag - San Marcos
  19: "4-6", // Detroit Training
  21: "7-999", // LaserZone Yorkshire — closed
};

/**
 * How much structure a PDF-era event has in legacy:
 *
 * - `matches` — event teams, rounds and matches; games carry their match and sides. Gets the
 *   full treatment.
 * - `sides` — event teams, and each game's two sides, but no rounds or matches (ECT 5).
 *   Teams and rosters come across; matches are left for a later pass that pairs the games.
 * - `shell` — no teams at all, only "Red Team" v "Green Team" games. A competition and its
 *   game assignments; teams and rosters are built by hand in the admin UI.
 */
export type LegacyPdfEventShape = "matches" | "sides" | "shell";

export type LegacyPdfEventConfig = {
  /** `events.id` in the legacy database. */
  legacyId: number;
  shape: LegacyPdfEventShape;
  category: "internationals" | "tournament" | "league";
  /**
   * `sides` events only: the `games.league_round` values that were finals. Rounds and
   * matches are rebuilt from each game's `league_round` / `league_match` / `league_game`.
   */
  finalsLeagueRounds?: number[];
  /**
   * `shell` events only: build teams and rosters from co-play groups (players who keep sharing
   * a side), named for their players' home center. `matches` says how its games become
   * matches: `pairs` (two-game matches, one round robin per round), `single` (one round of
   * one-game matches) or `none` (teams and rosters only). Decided 2026-10-28.
   */
  coplay?: { matches: "pairs" | "single" | "none" };
  /** Legacy `events.name`, recorded so the config is readable without a DB query. */
  legacyName: string;
  /** Overrides the legacy name on the migrated competition. */
  name?: string;
  /**
   * Legacy game ids to keep out of every match, with the reason. They still belong to the
   * competition and still count towards rosters.
   */
  unmatchedGames?: Record<number, string>;
  /** Appended to the legacy description on the migrated competition. */
  descriptionNote?: string;
  /** Pins `competition_team.short_name` for a legacy `event_teams.id`. */
  shortNames?: Record<number, string>;
};

/**
 * Every PDF-era competitive event, oldest first. Names are legacy's except where noted;
 * categories follow backfill-competition-category.ts (championships are `internationals`,
 * single-site seasons `league`, everything else `tournament`).
 */
export const LEGACY_PDF_EVENTS: LegacyPdfEventConfig[] = [
  {
    legacyId: 4,
    shape: "shell",
    category: "internationals",
    legacyName: "Nationals 2012",
    // Six fixed teams of six; three round robins of two-game matches.
    coplay: { matches: "pairs" },
  },
  {
    legacyId: 5,
    shape: "shell",
    category: "internationals",
    legacyName: "Nationals 2013",
    // Seven clean teams, but pairings met 4, 6 or 7 times (pools and finals that cannot be
    // told apart), so matches are left for an admin.
    coplay: { matches: "none" },
  },
  {
    legacyId: 130,
    shape: "shell",
    category: "tournament",
    legacyName: "Socials 2014-06-30",
    // Legacy filed it as a social event at a pseudo-center named after the event.
    name: "Armageddon 2014",
    // Nine teams of eight; one round robin of one-game matches (G v H never played).
    coplay: { matches: "single" },
  },
  { legacyId: 7, shape: "matches", category: "internationals", legacyName: "Internationals 2014" },
  { legacyId: 1, shape: "matches", category: "league", legacyName: "LTC Season 1" },
  { legacyId: 2, shape: "matches", category: "league", legacyName: "LTC Season 2" },
  {
    legacyId: 6,
    shape: "sides",
    category: "internationals",
    legacyName: "ECT 5",
    // Days 1 and 2 are each a full 15-match round robin; day 3 is a 10-match bracket ending
    // in a one-game final, as ECT 6 and ECT 7 run their finals.
    finalsLeagueRounds: [3],
  },
  {
    legacyId: 194,
    shape: "shell",
    category: "tournament",
    legacyName: "Socials 2015-06-27",
    name: "Armageddon 2015",
    // Seven teams of eight; one complete round robin of one-game matches.
    coplay: { matches: "single" },
  },
  { legacyId: 8, shape: "matches", category: "internationals", legacyName: "Internationals 2015" },
  { legacyId: 9, shape: "matches", category: "internationals", legacyName: "WCT 3" },
  { legacyId: 10, shape: "matches", category: "internationals", legacyName: "Nats 2016" },
  { legacyId: 11, shape: "matches", category: "league", legacyName: "LTC Season 3" },
  { legacyId: 12, shape: "matches", category: "internationals", legacyName: "WCT4", name: "WCT 4" },
  { legacyId: 13, shape: "matches", category: "internationals", legacyName: "ECT6", name: "ECT 6" },
  { legacyId: 14, shape: "matches", category: "league", legacyName: "Brisbane Season 1" },
  { legacyId: 15, shape: "matches", category: "league", legacyName: "LTC Season 4" },
  {
    legacyId: 16,
    shape: "matches",
    category: "internationals",
    legacyName: "Internationals 2017",
    unmatchedGames: {
      3248: "played by teams 71 v 72 but filed under match 71 v 78",
      3249: "played by teams 71 v 72 but filed under match 71 v 78",
    },
  },
  { legacyId: 17, shape: "matches", category: "internationals", legacyName: "ECT7", name: "ECT 7" },
  { legacyId: 18, shape: "matches", category: "internationals", legacyName: "WCT 2018" },
  { legacyId: 413, shape: "matches", category: "league", legacyName: "Brisbane 2018 Season 1" },
  { legacyId: 419, shape: "matches", category: "league", legacyName: "LTC 2018 Season 1" },
  {
    legacyId: 434,
    shape: "matches",
    category: "tournament",
    legacyName: "Detroit Invitational 2018",
  },
  {
    legacyId: 507,
    shape: "matches",
    category: "internationals",
    legacyName: "Internationals 2018",
  },
  { legacyId: 566, shape: "matches", category: "league", legacyName: "Brisbane 2018 Season 2" },
  { legacyId: 557, shape: "matches", category: "league", legacyName: "LLT Season 4" },
  {
    legacyId: 687,
    shape: "matches",
    category: "tournament",
    legacyName: "Syracuse Random Draw 2019",
  },
  { legacyId: 764, shape: "matches", category: "league", legacyName: "Brisbane 2019 Season 1" },
  { legacyId: 808, shape: "matches", category: "league", legacyName: "LLT Season 5" },
  { legacyId: 845, shape: "matches", category: "tournament", legacyName: "Armageddon 2019" },
  {
    legacyId: 853,
    shape: "matches",
    category: "internationals",
    legacyName: "Internationals 2019",
  },
  {
    legacyId: 895,
    shape: "matches",
    category: "league",
    legacyName: "Brisbane 2019 Season 2",
    // Legacy scored it `solo` and kept player handicaps, but it was played as four
    // captain-named teams in matches; decided 2026-10-28 to migrate it as a team event.
    descriptionNote:
      "Legacy player handicaps, not applied to team standings: Tragedy 4, Screaver 6, Anarki 9.",
  },
  { legacyId: 911, shape: "matches", category: "internationals", legacyName: "WCT 5" },
  { legacyId: 948, shape: "matches", category: "tournament", legacyName: "SM5 Holiday Tournament" },
  { legacyId: 959, shape: "matches", category: "internationals", legacyName: "ECT 2020" },
];

export function findLegacyPdfEvent(legacyId: number): LegacyPdfEventConfig | undefined {
  return LEGACY_PDF_EVENTS.find((e) => e.legacyId === legacyId);
}

/**
 * The legacy migration of TDF-based events was declared complete on this date. Since
 * then the modern database is the source of truth: admins edit competitions and
 * penalties directly, and two legacy penalty awards were deliberately rescinded because
 * the TDF score already held them. Re-running a migration or back-fill would overwrite
 * that work with legacy's view, so the scripts that write refuse to.
 */
export const LEGACY_MIGRATION_CLOSED = "2026-10-17";

const REOPEN_FLAG = "--reopen-closed-migration";

/**
 * Exits unless `argv` carries the reopen flag. Call only on a script's *writing* path:
 * `--report` and `--dry-run` stay available, as does the read-only legacy-variance.
 */
export function assertLegacyMigrationOpen(argv: string[]): void {
  if (argv.includes(REOPEN_FLAG)) return;
  console.error(
    `The legacy migration was closed on ${LEGACY_MIGRATION_CLOSED}; this script would ` +
      `overwrite data edited in the modern database since then.\n` +
      `See docs/Legacy_Migration_TDF_Events.md. ` +
      `Pass ${REOPEN_FLAG} only if you mean to reopen it.`,
  );
  process.exit(1);
}

/** Strips the reopen flag so a script's own argument parser never sees it. */
export function withoutReopenFlag(argv: string[]): string[] {
  return argv.filter((a) => a !== REOPEN_FLAG);
}

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
 * ("🥞Stacked Team🥞", "Team JACKAL! JACKAL! IT'S A JACKAL!"). `slugify` folds those
 * away safely, but it fills the gaps with underscores rather than words, so feeding
 * the raw name straight through yields a technically valid but ugly slug. Every
 * derived value is printed by the migration for review; correct them via
 * `shortNames` or the admin UI.
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
