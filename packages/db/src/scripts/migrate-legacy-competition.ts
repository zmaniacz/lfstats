// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Migrates competitive-event metadata from the legacy `lfstats` database into
 * `lfstats_modern`.
 *
 * The games themselves are already in the modern database — only the organization
 * around them (competitions, teams, rounds, matches, rosters) needs importing.
 *
 * Usage:
 *   pnpm --filter @lfstats/db migrate-legacy-comp --event 1312 --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-comp --event 1312
 *   pnpm --filter @lfstats/db migrate-legacy-comp --all --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-comp --report
 *
 * Requires `LEGACY_DATABASE_URL` in addition to `DATABASE_URL`.
 *
 * ## Colour
 *
 * The legacy site assumed every team was red or green and coerced anything else, so
 * `game_teams.color_normal` is only ever `'red'` or `'green'` — St George Summer
 * League 2025 actually played Red vs Blue and Fire vs Ice, both of which legacy
 * labelled "green". This migration therefore treats `color_normal` purely as a *side
 * discriminator* (which of `games.red_team_id` / `green_team_id` a game-team belongs
 * to) and writes no colour data at all. Modern `sm5_game_team` already carries the
 * true TDF colour, and keeps it.
 */

import postgres from "postgres";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { initDb } from "../client";
import { slugify } from "../lib/slug";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  player,
  sm5GameTeam,
  sm5Scorecard,
} from "../schema";
import {
  createCompetition,
  deleteCompetition,
  getCompetitionBySlug,
  setGameCompetition,
} from "../queries/admin";
import {
  assignGameToMatch,
  createCompetitionMatch,
  createCompetitionRound,
  createCompetitionTeam,
  setPlayerMercenary,
} from "../queries/competition-tournament";
import {
  ALREADY_MIGRATED,
  LEGACY_EVENTS,
  deriveShortName,
  findLegacyEvent,
  uniquifyShortName,
  type LegacyEventConfig,
} from "./legacy-events";

/** Below this, the derived side mapping is not trustworthy — see checkRosterConsistency. */
const ROSTER_CONSISTENCY_FLOOR = 0.9;

// ---------------------------------------------------------------------------
// Legacy database access
// ---------------------------------------------------------------------------

type Legacy = ReturnType<typeof postgres>;

function connectLegacy(): Legacy {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) {
    throw new Error(
      "Missing env var: LEGACY_DATABASE_URL (e.g. postgresql://user:pass@host:5432/lfstats)",
    );
  }
  // The legacy site is still live. Enforce read-only on the server for every
  // connection in the pool rather than trusting this script to only issue SELECTs.
  return postgres(url, {
    max: 2,
    idle_timeout: 20,
    connection: { options: "-c default_transaction_read_only=on" },
  });
}

type LegacyEventRow = {
  id: number;
  name: string;
  description: string | null;
  scoring: string;
  challonge_link: string | null;
  ipl_id: string | null;
};

type LegacyGameRow = {
  id: number;
  fn: string;
  match_id: number | null;
  league_game: number | null;
  red_team_id: number | null;
  green_team_id: number | null;
};

type LegacyGameTeamRow = { game_id: number; idx: number; color_normal: string };
type LegacyEventTeamRow = { id: number; name: string };
type LegacyRoundRow = {
  id: number;
  round: number | null;
  is_finals: number;
  multiplier: number;
  match_count: number;
};
type LegacyMatchRow = {
  id: number;
  round_id: number;
  match: number;
  team_1_id: number | null;
  team_2_id: number | null;
};

type LegacyEventData = {
  event: LegacyEventRow;
  games: LegacyGameRow[];
  gameTeams: LegacyGameTeamRow[];
  teams: LegacyEventTeamRow[];
  rounds: LegacyRoundRow[];
  matches: LegacyMatchRow[];
};

async function fetchLegacyEvent(legacy: Legacy, legacyId: number): Promise<LegacyEventData> {
  const [event] = (await legacy`
    select e.id::int, e.name, e.description, e.scoring,
           nullif(trim(e.challonge_link), '') as challonge_link,
           nullif(trim(c.ipl_id), '') as ipl_id
    from events e join centers c on c.id = e.center_id
    where e.id = ${legacyId}
  `) as unknown as LegacyEventRow[];
  if (!event) throw new Error(`Legacy event ${legacyId} not found`);

  const games = (await legacy`
    select g.id::int, replace(g.tdf_key, '_', '-') as fn, g.match_id::int,
           g.league_game::int, g.red_team_id::int, g.green_team_id::int
    from games g
    where g.event_id = ${legacyId} and g.tdf_key is not null
    order by g.game_datetime
  `) as unknown as LegacyGameRow[];

  const gameTeams = (await legacy`
    select gt.game_id::int, gt.index::int as idx, gt.color_normal
    from game_teams gt join games g on g.id = gt.game_id
    where g.event_id = ${legacyId} and g.tdf_key is not null
      and gt.neutral_team is not true and coalesce(gt.color_normal, '') <> ''
  `) as unknown as LegacyGameTeamRow[];

  const teams = (await legacy`
    select t.id::int, t.name from event_teams t where t.event_id = ${legacyId} order by t.id
  `) as unknown as LegacyEventTeamRow[];

  const rounds = (await legacy`
    select r.id::int, r.round::int, r.is_finals::int, r.multiplier::int,
           (select count(*)::int from matches m where m.round_id = r.id) as match_count
    from rounds r where r.event_id = ${legacyId}
  `) as unknown as LegacyRoundRow[];

  const matches = (await legacy`
    select m.id::int, m.round_id::int, m.match::int,
           m.team_1_id::int, m.team_2_id::int
    from matches m join rounds r on r.id = m.round_id
    where r.event_id = ${legacyId}
  `) as unknown as LegacyMatchRow[];

  return { event, games, gameTeams, teams, rounds, matches };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

type PlannedTeam = { legacyId: number; name: string; shortName: string };
type PlannedRound = {
  legacyId: number;
  name: string;
  roundNumber: number;
  type: "pool" | "finals";
  multiplier: number;
};
type PlannedMatch = {
  legacyId: number;
  roundLegacyId: number;
  matchNumber: number;
  team1LegacyId: number | null;
  team2LegacyId: number | null;
};
type PlannedMatchGame = {
  matchLegacyId: number;
  gameNumber: number;
  modernGameId: string;
  tdfFilename: string;
  team1GameTeamId: string;
  team2GameTeamId: string;
};
type PlannedRosterEntry = {
  teamLegacyId: number;
  playerId: string;
  callsign: string;
  games: number;
  isMercenary: boolean;
};

type Plan = {
  cfg: LegacyEventConfig;
  name: string;
  slug: string;
  hostCenterId: string;
  startDate: string;
  endDate: string;
  description: string | null;
  challongeLink: string | null;
  modernGameIds: string[];
  teams: PlannedTeam[];
  rounds: PlannedRound[];
  matches: PlannedMatch[];
  matchGames: PlannedMatchGame[];
  roster: PlannedRosterEntry[];
  rosterConsistency: number | null;
  warnings: string[];
};

async function buildPlan(
  db: Awaited<ReturnType<typeof initDb>>,
  cfg: LegacyEventConfig,
  data: LegacyEventData,
): Promise<Plan> {
  const warnings: string[] = [];
  const name = cfg.name ?? data.event.name;

  // --- host center -------------------------------------------------------
  if (!data.event.ipl_id) {
    throw new Error(`Legacy event ${cfg.legacyId} has a center with no ipl_id; cannot map`);
  }
  const [countryCode, siteCode] = data.event.ipl_id.split("-").map((n) => Number(n));
  const [hostCenter] = await db
    .select({ id: center.id })
    .from(center)
    .where(and(eq(center.countryCode, countryCode), eq(center.siteCode, siteCode)));
  if (!hostCenter) {
    throw new Error(`No modern center for legacy ipl_id "${data.event.ipl_id}"`);
  }

  // --- games -------------------------------------------------------------
  if (data.games.length === 0) {
    throw new Error(`Legacy event ${cfg.legacyId} has no games with a tdf_key`);
  }
  const filenames = data.games.map((g) => g.fn);
  const modernGames = await db
    .select({ id: game.id, tdfFilename: game.tdfFilename, startTime: game.startTime })
    .from(game)
    .where(inArray(game.tdfFilename, filenames));
  const gameByFilename = new Map(modernGames.map((g) => [g.tdfFilename, g]));

  const missing = filenames.filter((f) => !gameByFilename.has(f));
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} legacy game(s) have no modern counterpart, e.g. ${missing.slice(0, 3).join(", ")}`,
    );
  }

  const modernGameIds = data.games.map((g) => gameByFilename.get(g.fn)!.id);

  const dates = modernGames.map((g) => g.startTime).sort((a, b) => a.getTime() - b.getTime());
  const startDate = toDateString(dates[0]);
  const endDate = toDateString(dates[dates.length - 1]);

  const plan: Plan = {
    cfg,
    name,
    slug: slugify(name),
    hostCenterId: hostCenter.id,
    startDate,
    endDate,
    description: data.event.description?.trim() || null,
    challongeLink: data.event.challonge_link,
    modernGameIds,
    teams: [],
    rounds: [],
    matches: [],
    matchGames: [],
    roster: [],
    rosterConsistency: null,
    warnings,
  };

  if (cfg.kind === "solo") {
    warnings.push(
      "Solo event: no teams, rounds, or matches exist in legacy. Standings will be empty by design.",
    );
    return plan;
  }

  // --- teams -------------------------------------------------------------
  const usedShortNames = new Set<string>();
  plan.teams = data.teams.map((t) => ({
    legacyId: t.id,
    name: t.name,
    shortName: cfg.shortNames?.[t.id] ?? uniquifyShortName(deriveShortName(t.name), usedShortNames),
  }));

  // --- rounds ------------------------------------------------------------
  // Legacy `rounds.round` is not unique per event and modern enforces
  // unique(competition_id, round_number). Sort finals last, NULL round numbers last
  // within that, then by id for stability, and renumber 1..N.
  const playedRounds = data.rounds.filter((r) => r.match_count > 0);
  const dropped = data.rounds.length - playedRounds.length;
  if (dropped > 0) warnings.push(`Dropped ${dropped} legacy round(s) with zero matches.`);

  const ordered = [...playedRounds].sort(
    (a, b) => a.is_finals - b.is_finals || (a.round ?? 99) - (b.round ?? 99) || a.id - b.id,
  );
  let poolCounter = 0;
  plan.rounds = ordered.map((r, i) => {
    const isFinals = r.is_finals === 1;
    if (!isFinals) poolCounter += 1;
    if (r.multiplier !== 1) {
      warnings.push(
        `Legacy round ${r.id} has multiplier ${r.multiplier}; the modern schema has no ` +
          `multiplier, so this round's points will NOT be weighted.`,
      );
    }
    return {
      legacyId: r.id,
      name: isFinals ? "Finals" : `Round ${poolCounter}`,
      roundNumber: cfg.roundNumbers?.[r.id] ?? i + 1,
      type: isFinals ? ("finals" as const) : ("pool" as const),
      multiplier: r.multiplier,
    };
  });
  const plannedRoundIds = new Set(plan.rounds.map((r) => r.legacyId));

  // --- matches -----------------------------------------------------------
  plan.matches = data.matches
    .filter((m) => plannedRoundIds.has(m.round_id))
    .map((m) => ({
      legacyId: m.id,
      roundLegacyId: m.round_id,
      matchNumber: m.match,
      team1LegacyId: m.team_1_id,
      team2LegacyId: m.team_2_id,
    }))
    .sort((a, b) => a.roundLegacyId - b.roundLegacyId || a.matchNumber - b.matchNumber);
  const matchByLegacyId = new Map(plan.matches.map((m) => [m.legacyId, m]));

  // --- match games (the side mapping) ------------------------------------
  const gameTeamsByGame = new Map<number, LegacyGameTeamRow[]>();
  for (const gt of data.gameTeams) {
    const list = gameTeamsByGame.get(gt.game_id) ?? [];
    list.push(gt);
    gameTeamsByGame.set(gt.game_id, list);
  }

  const modernTeamRows = await db
    .select({ id: sm5GameTeam.id, gameId: sm5GameTeam.gameId, idx: sm5GameTeam.tdfTeamIndex })
    .from(sm5GameTeam)
    .where(inArray(sm5GameTeam.gameId, modernGameIds));
  const modernTeamByGameAndIndex = new Map(
    modernTeamRows.map((t) => [`${t.gameId}:${t.idx}`, t.id]),
  );

  /** sm5_game_team.id -> the legacy event_teams.id that played it. */
  const gameTeamToEventTeam = new Map<string, number>();

  for (const lg of data.games) {
    if (lg.match_id === null) continue;
    const match = matchByLegacyId.get(lg.match_id);
    if (!match) continue;

    if (lg.red_team_id === null || lg.green_team_id === null) {
      warnings.push(`Legacy game ${lg.id} sits in a match but has no team on one side; skipped.`);
      continue;
    }
    if (match.team1LegacyId === null || match.team2LegacyId === null) {
      warnings.push(
        `Legacy match ${match.legacyId} has an unassigned side; its games cannot be linked.`,
      );
      continue;
    }
    if (lg.league_game !== 1 && lg.league_game !== 2) {
      warnings.push(`Legacy game ${lg.id} has league_game=${lg.league_game}; skipped.`);
      continue;
    }

    // Structural check: the match's two teams must be exactly the game's two sides.
    const gameSides = [lg.red_team_id, lg.green_team_id].sort((a, b) => a - b);
    const matchSides = [match.team1LegacyId, match.team2LegacyId].sort((a, b) => a - b);
    if (gameSides[0] !== matchSides[0] || gameSides[1] !== matchSides[1]) {
      throw new Error(
        `Legacy game ${lg.id} teams (${gameSides}) do not match its match ${match.legacyId} ` +
          `teams (${matchSides}); refusing to guess the side mapping.`,
      );
    }

    const modernGameId = gameByFilename.get(lg.fn)!.id;
    const sides = gameTeamsByGame.get(lg.id) ?? [];

    // `color_normal` is legacy's side discriminator, never a colour claim: it says
    // whether this game-team is the one named by red_team_id or by green_team_id.
    const sideEntries = sides.map((s) => ({
      eventTeamId: s.color_normal === "red" ? lg.red_team_id! : lg.green_team_id!,
      gameTeamId: modernTeamByGameAndIndex.get(`${modernGameId}:${s.idx}`),
    }));
    if (sideEntries.length !== 2 || sideEntries.some((s) => !s.gameTeamId)) {
      throw new Error(
        `Legacy game ${lg.id} (${lg.fn}) did not resolve to exactly two modern game teams`,
      );
    }

    const side1 = sideEntries.find((s) => s.eventTeamId === match.team1LegacyId);
    const side2 = sideEntries.find((s) => s.eventTeamId === match.team2LegacyId);
    if (!side1 || !side2) {
      throw new Error(`Legacy game ${lg.id} sides could not be matched to its match teams`);
    }

    gameTeamToEventTeam.set(side1.gameTeamId!, match.team1LegacyId);
    gameTeamToEventTeam.set(side2.gameTeamId!, match.team2LegacyId);

    plan.matchGames.push({
      matchLegacyId: match.legacyId,
      gameNumber: lg.league_game,
      modernGameId,
      tdfFilename: lg.fn,
      team1GameTeamId: side1.gameTeamId!,
      team2GameTeamId: side2.gameTeamId!,
    });
  }

  const singleGameMatches = countSingleGameMatches(plan.matchGames, plan.matches.length);
  if (singleGameMatches > 0) {
    warnings.push(
      `${singleGameMatches} match(es) have only one game. Modern awards the match bonus only ` +
        `when both games are recorded, so these read as "incomplete" and contribute 0 match points.`,
    );
  }

  // --- roster ------------------------------------------------------------
  await buildRoster(db, plan, gameTeamToEventTeam);

  return plan;
}

function countSingleGameMatches(matchGames: PlannedMatchGame[], _totalMatches: number): number {
  const counts = new Map<number, number>();
  for (const mg of matchGames) {
    counts.set(mg.matchLegacyId, (counts.get(mg.matchLegacyId) ?? 0) + 1);
  }
  return [...counts.values()].filter((n) => n === 1).length;
}

/**
 * Derives rosters from who actually played — legacy has no roster table.
 *
 * Reads *modern* scorecards rather than legacy ones: it avoids mapping legacy player
 * ids entirely, and guests (who have no modern `player` row) fall out naturally as
 * `player_id IS NULL`.
 *
 * A player's roster team is the one they played the most games for; every other team
 * they appear on gets a mercenary entry, which is the only legal way for a player to
 * be attached to two teams in one competition.
 */
async function buildRoster(
  db: Awaited<ReturnType<typeof initDb>>,
  plan: Plan,
  gameTeamToEventTeam: Map<string, number>,
): Promise<void> {
  const gameTeamIds = [...gameTeamToEventTeam.keys()];
  if (gameTeamIds.length === 0) return;

  const rows = await db
    .select({
      playerId: sm5Scorecard.playerId,
      teamId: sm5Scorecard.teamId,
      callsign: player.currentCallsign,
      games: sql<number>`count(*)::int`,
      firstSeen: sql<string>`min(${game.startTime})`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(inArray(sm5Scorecard.teamId, gameTeamIds), isNotNull(sm5Scorecard.playerId)))
    .groupBy(sm5Scorecard.playerId, sm5Scorecard.teamId, player.currentCallsign);

  // Collapse per-game-team counts into per-event-team counts.
  const perPlayerTeam = new Map<
    string,
    { playerId: string; callsign: string; teamLegacyId: number; games: number; firstSeen: string }
  >();
  for (const r of rows) {
    const teamLegacyId = gameTeamToEventTeam.get(r.teamId);
    if (teamLegacyId === undefined || !r.playerId) continue;
    const key = `${r.playerId}:${teamLegacyId}`;
    const existing = perPlayerTeam.get(key);
    if (existing) {
      existing.games += r.games;
      if (r.firstSeen < existing.firstSeen) existing.firstSeen = r.firstSeen;
    } else {
      perPlayerTeam.set(key, {
        playerId: r.playerId,
        callsign: r.callsign,
        teamLegacyId,
        games: r.games,
        firstSeen: r.firstSeen,
      });
    }
  }

  const byPlayer = new Map<
    string,
    (typeof perPlayerTeam extends Map<string, infer V> ? V : never)[]
  >();
  for (const entry of perPlayerTeam.values()) {
    const list = byPlayer.get(entry.playerId) ?? [];
    list.push(entry);
    byPlayer.set(entry.playerId, list);
  }

  let total = 0;
  let onPrimary = 0;
  for (const entries of byPlayer.values()) {
    // Most games wins; ties break on the earliest appearance.
    entries.sort((a, b) => b.games - a.games || a.firstSeen.localeCompare(b.firstSeen));
    entries.forEach((e, i) => {
      total += e.games;
      if (i === 0) onPrimary += e.games;
      plan.roster.push({
        teamLegacyId: e.teamLegacyId,
        playerId: e.playerId,
        callsign: e.callsign,
        games: e.games,
        isMercenary: i > 0,
      });
    });
  }

  plan.rosterConsistency = total > 0 ? onPrimary / total : null;
  if (plan.rosterConsistency !== null && plan.rosterConsistency < ROSTER_CONSISTENCY_FLOOR) {
    plan.warnings.push(
      `Roster consistency is ${(plan.rosterConsistency * 100).toFixed(1)}% (floor ` +
        `${(ROSTER_CONSISTENCY_FLOOR * 100).toFixed(0)}%). Players should mostly stay on one ` +
        `team; a low figure suggests the game-to-team side mapping is wrong.`,
    );
  }
}

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printPlan(plan: Plan): void {
  const { cfg } = plan;
  console.log(`\n${"=".repeat(78)}`);
  console.log(`Legacy event ${cfg.legacyId} (${cfg.kind}) -> "${plan.name}" [${plan.slug}]`);
  console.log("=".repeat(78));
  console.log(`  dates        ${plan.startDate} .. ${plan.endDate}`);
  console.log(`  games        ${plan.modernGameIds.length}`);
  if (plan.challongeLink) console.log(`  challonge    ${plan.challongeLink}`);
  if (plan.description) console.log(`  description  ${plan.description}`);

  if (cfg.kind === "team") {
    console.log(`\n  Teams (${plan.teams.length}) — short names are auto-derived, review them:`);
    for (const t of plan.teams) {
      const roster = plan.roster.filter((r) => r.teamLegacyId === t.legacyId);
      const mercs = roster.filter((r) => r.isMercenary).length;
      console.log(
        `    ${t.shortName.padEnd(9)} ${t.name}  (${roster.length} players, ${mercs} merc)`,
      );
    }

    console.log(`\n  Rounds (${plan.rounds.length}):`);
    for (const r of plan.rounds) {
      const n = plan.matches.filter((m) => m.roundLegacyId === r.legacyId).length;
      console.log(`    ${r.roundNumber}. ${r.name.padEnd(9)} ${r.type.padEnd(7)} ${n} matches`);
    }

    console.log(`\n  Matches ${plan.matches.length}, match games ${plan.matchGames.length}`);

    // One line per multi-team player, not per mercenary row: a player on three teams
    // has two mercenary entries but is still one person to review.
    const multiTeamPlayers = [
      ...new Set(plan.roster.filter((r) => r.isMercenary).map((r) => r.playerId)),
    ];
    if (multiTeamPlayers.length > 0) {
      console.log(
        `\n  Multi-team players (${multiTeamPlayers.length}) — first team is the roster team, rest are mercenary:`,
      );
      const teamName = new Map(plan.teams.map((t) => [t.legacyId, t.shortName]));
      for (const playerId of multiTeamPlayers) {
        const entries = plan.roster.filter((r) => r.playerId === playerId);
        const all = entries.map((r) => `${teamName.get(r.teamLegacyId)}:${r.games}`).join(" ");
        console.log(`    ${entries[0].callsign.padEnd(20)} ${all}`);
      }
    }
    if (plan.rosterConsistency !== null) {
      console.log(`\n  Roster consistency: ${(plan.rosterConsistency * 100).toFixed(1)}%`);
    }
  }

  if (plan.warnings.length > 0) {
    console.log(`\n  WARNINGS:`);
    for (const w of plan.warnings) console.log(`    ! ${w}`);
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function applyPlan(
  db: Awaited<ReturnType<typeof initDb>>,
  plan: Plan,
  force: boolean,
): Promise<void> {
  const existing = await getCompetitionBySlug(plan.slug);
  if (existing) {
    if (!force) {
      throw new Error(
        `Competition "${plan.slug}" already exists. Re-run with --force to delete and rebuild it.`,
      );
    }
    console.log(`  --force: deleting existing competition ${plan.slug}`);
    // Cascades to teams/rounds/matches/match-games; game.competition_id is SET NULL.
    await deleteCompetition(existing.id);
  }

  const created = await createCompetition({
    name: plan.name,
    type: "competitive",
    state: "completed",
    hostCenterId: plan.hostCenterId,
    startDate: plan.startDate,
    endDate: plan.endDate,
    description: plan.description,
    challongeLink: plan.challongeLink,
  });
  console.log(`  created competition ${created.slug} (${created.id})`);

  for (const gameId of plan.modernGameIds) {
    await setGameCompetition(gameId, created.id);
  }
  console.log(`  assigned ${plan.modernGameIds.length} games`);

  if (plan.cfg.kind === "solo") {
    console.log(`  solo event: no teams/rounds/matches to build`);
    return;
  }

  const teamIds = new Map<number, string>();
  for (const t of plan.teams) {
    teamIds.set(
      t.legacyId,
      await createCompetitionTeam({
        competitionId: created.id,
        name: t.name,
        shortName: t.shortName,
      }),
    );
  }
  console.log(`  created ${teamIds.size} teams`);

  const roundIds = new Map<number, string>();
  for (const r of plan.rounds) {
    roundIds.set(
      r.legacyId,
      await createCompetitionRound({
        competitionId: created.id,
        name: r.name,
        roundNumber: r.roundNumber,
        type: r.type,
      }),
    );
  }
  console.log(`  created ${roundIds.size} rounds`);

  const matchIds = new Map<number, string>();
  for (const m of plan.matches) {
    matchIds.set(
      m.legacyId,
      await createCompetitionMatch({
        competitionId: created.id,
        roundId: roundIds.get(m.roundLegacyId)!,
        poolId: null,
        matchNumber: m.matchNumber,
        team1Id: m.team1LegacyId === null ? null : (teamIds.get(m.team1LegacyId) ?? null),
        team2Id: m.team2LegacyId === null ? null : (teamIds.get(m.team2LegacyId) ?? null),
      }),
    );
  }
  console.log(`  created ${matchIds.size} matches`);

  // Rosters must exist before match games are assigned: assignGameToMatch stamps
  // sm5_scorecard.is_mercenary from competition_team_player.
  for (const r of plan.roster) {
    const result = await setPlayerMercenary(
      teamIds.get(r.teamLegacyId)!,
      r.playerId,
      r.isMercenary,
    );
    if (!result.ok) {
      throw new Error(`Roster insert failed for ${r.callsign}: ${result.error}`);
    }
  }
  console.log(`  created ${plan.roster.length} roster entries`);

  for (const mg of plan.matchGames) {
    await assignGameToMatch(
      matchIds.get(mg.matchLegacyId)!,
      mg.modernGameId,
      mg.gameNumber,
      mg.team1GameTeamId,
      mg.team2GameTeamId,
    );
  }
  console.log(`  assigned ${plan.matchGames.length} games to matches`);
}

// ---------------------------------------------------------------------------
// Report mode
// ---------------------------------------------------------------------------

async function runReport(db: Awaited<ReturnType<typeof initDb>>, legacy: Legacy): Promise<void> {
  const allEvents = (await legacy`
    select e.id::int, e.name, e.scoring,
           (select count(*)::int from games g where g.event_id = e.id) as games,
           (select count(*)::int from games g where g.event_id = e.id and g.tdf_key is not null) as tdf_games,
           (select count(*)::int from event_teams t where t.event_id = e.id) as teams,
           (select count(*)::int from rounds r where r.event_id = e.id) as rounds,
           (select count(*)::int from matches m join rounds r on r.id = m.round_id
             where r.event_id = e.id) as matches
    from events e where e.is_comp order by e.id
  `) as unknown as {
    id: number;
    name: string;
    scoring: string;
    games: number;
    tdf_games: number;
    teams: number;
    rounds: number;
    matches: number;
  }[];

  console.log(`\n# Legacy competitive events (${allEvents.length})\n`);
  console.log("| id | name | scoring | games | w/ tdf | status |");
  console.log("|---|---|---|---|---|---|");

  const diffTargets: { legacyId: number; slug: string; row: (typeof allEvents)[number] }[] = [];
  for (const e of allEvents) {
    let status: string;
    if (ALREADY_MIGRATED[e.id]) {
      status = `already built (\`${ALREADY_MIGRATED[e.id]}\`)`;
      diffTargets.push({ legacyId: e.id, slug: ALREADY_MIGRATED[e.id], row: e });
    } else if (findLegacyEvent(e.id)) {
      status = `in scope (${findLegacyEvent(e.id)!.kind})`;
    } else if (e.tdf_games === 0) {
      status = "out of scope — pre-TDF, not in modern DB";
    } else {
      status = "**UNCLASSIFIED — has TDF games but no config entry**";
    }
    console.log(`| ${e.id} | ${e.name} | ${e.scoring} | ${e.games} | ${e.tdf_games} | ${status} |`);
  }

  console.log(`\n## Already-built competitions: legacy vs modern\n`);
  console.log("| legacy | slug | legacy rounds/matches/games | modern rounds/matches/games |");
  console.log("|---|---|---|---|");
  for (const t of diffTargets) {
    const comp = await getCompetitionBySlug(t.slug);
    if (!comp) {
      console.log(`| ${t.legacyId} | ${t.slug} | — | **not found in modern DB** |`);
      continue;
    }
    const [counts] = await db
      .select({
        rounds: sql<number>`(select count(*)::int from ${competitionRound} where competition_id = ${comp.id})`,
        matches: sql<number>`(select count(*)::int from ${competitionMatch} where competition_id = ${comp.id})`,
        games: sql<number>`(select count(*)::int from ${game} where competition_id = ${comp.id})`,
        matchGames: sql<number>`(select count(*)::int from ${competitionMatchGame} mg join ${competitionMatch} m on m.id = mg.match_id where m.competition_id = ${comp.id})`,
      })
      .from(competition)
      .where(eq(competition.id, comp.id));
    const legacySide = `${t.row.rounds}/${t.row.matches}/${t.row.tdf_games}`;
    const modernSide = `${counts.rounds}/${counts.matches}/${counts.games} (${counts.matchGames} in matches)`;
    // Only a *deficit* is interesting. Modern routinely has more games than legacy
    // because forfeits are synthesized here and never existed in the legacy data, and
    // events that were still upcoming when legacy was retired have no legacy games.
    const deficit = t.row.tdf_games - counts.matchGames;
    const flag =
      t.row.tdf_games > 0 && deficit > 0 ? ` ⚠ ${deficit} legacy game(s) unaccounted for` : "";
    console.log(`| ${t.legacyId} | ${t.slug} | ${legacySide} | ${modernSide}${flag} |`);
  }
  console.log(
    `\nReport only — the migration never writes to an already-built competition.\n` +
      `Counts are rounds/matches/games. ⚠ marks games that exist in legacy but are not\n` +
      `assigned to a match in modern; a surplus on the modern side is normal (forfeits).\n`,
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]) {
  const args = {
    event: undefined as number | undefined,
    all: false,
    dryRun: false,
    force: false,
    report: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--event":
        args.event = Number(argv[++i]);
        break;
      case "--all":
        args.all = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--report":
        args.report = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const legacy = connectLegacy();
  const db = await initDb();

  try {
    if (args.report) {
      await runReport(db, legacy);
      return;
    }

    let configs: LegacyEventConfig[];
    if (args.all) {
      configs = LEGACY_EVENTS;
    } else if (args.event !== undefined) {
      const cfg = findLegacyEvent(args.event);
      if (!cfg) {
        throw new Error(
          `Legacy event ${args.event} is not in the migration config. ` +
            `Run with --report to see every event and its status.`,
        );
      }
      configs = [cfg];
    } else {
      throw new Error("Specify --event <legacyId>, --all, or --report");
    }

    for (const cfg of configs) {
      const data = await fetchLegacyEvent(legacy, cfg.legacyId);
      const plan = await buildPlan(db, cfg, data);
      printPlan(plan);
      if (args.dryRun) continue;
      await applyPlan(db, plan, args.force);
    }

    if (args.dryRun) console.log(`\nDry run — nothing was written.`);
  } finally {
    await legacy.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
