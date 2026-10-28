// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Rebuilds the PDF-era (pre-TDF) competitive events from the legacy `lfstats` database
 * around games that already exist in `lfstats_modern` as `sm5_pdf` games.
 *
 * Usage:
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --report
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --event 7 --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --all --dry-run
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --event 7
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --all
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-competition --event 4 --coplay   # candidate teams
 *   add --force to delete and rebuild a competition that already exists, --verbose to list
 *   every roster entry and match mismatch
 *
 * Requires `LEGACY_DATABASE_URL` alongside `DATABASE_URL`; the legacy connection is read-only.
 * Every event and judgement call is in LEGACY_PDF_EVENTS (legacy-events.ts). The plan and
 * the decisions behind it are in docs/Legacy_Migration_PDF_Events.md.
 *
 * ## Games
 *
 * An event's games are the `sm5_pdf_game` rows staged with its `legacy_event_id`, plus any
 * legacy game the PDF migration skipped as a duplicate of a TDF game: those are found again
 * the same way (a modern game at the same center within two minutes) and their sides are
 * mapped by who played on them.
 *
 * ## Sides
 *
 * Legacy `games.red_team_id` / `green_team_id` name the event team on each side, and the
 * PDF migration wrote `sm5_pdf_game_team.side` from the same columns, so the mapping is
 * direct. PDF-era games really were red v green, unlike the TDF-era colour caveat.
 *
 * ## Verification
 *
 * Legacy stored its own points for every played match (`matches.team_1_points` /
 * `team_2_points`). The dry run scores every match the modern way and compares, match by
 * match, then compares each team's total including match penalties.
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { initDb } from "../client";
import { slugify } from "../lib/slug";
import { applyTeamAdjustments, computeTeamStats, type StandingsGameRow } from "../lib/match-points";
import {
  center,
  competitionGameSide,
  competitionScorecard,
  game,
  legacyPlayerMap,
  sm5GameTeam,
  sm5PdfGame,
  sm5PdfGameTeam,
  sm5PdfScorecard,
  sm5Scorecard,
  player,
} from "../schema";
import {
  createCompetition,
  deleteCompetition,
  getCompetitionBySlug,
  setGameCompetition,
} from "../queries/admin";
import {
  addCompetitionTeamAdjustment,
  assignGameToMatch,
  createCompetitionMatch,
  createCompetitionRound,
  createCompetitionTeam,
  setPlayerMercenary,
} from "../queries/competition-tournament";
import {
  ALREADY_MIGRATED,
  assertLegacyPdfMigrationOpen,
  LEGACY_CENTER_OVERRIDES,
  LEGACY_PDF_EVENTS,
  deriveShortName,
  findLegacyPdfEvent,
  uniquifyShortName,
  type LegacyPdfEventConfig,
} from "./legacy-events";

/** Below this, the side mapping is suspect — players should mostly stay on one team. */
const ROSTER_CONSISTENCY_FLOOR = 0.9;

/** The PDF migration's rule for "this PDF game is that TDF game". */
const DUPLICATE_WINDOW_SECONDS = 120;

type Db = Awaited<ReturnType<typeof initDb>>;
type Legacy = ReturnType<typeof postgres>;

function connectLegacy(): Legacy {
  const url = process.env.LEGACY_DATABASE_URL;
  if (!url) throw new Error("Missing env var: LEGACY_DATABASE_URL");
  // The legacy site is still live — enforce read-only server-side.
  return postgres(url, {
    max: 2,
    idle_timeout: 20,
    connection: { options: "-c default_transaction_read_only=on" },
  });
}

// ---------------------------------------------------------------------------
// Legacy data
// ---------------------------------------------------------------------------

type LegacyEvent = {
  id: number;
  name: string;
  description: string | null;
  challonge_link: string | null;
  center_id: number;
  ipl_id: string | null;
};
type LegacyGame = {
  id: number;
  game_name: string;
  match_id: number | null;
  league_game: number | null;
  red_team_id: number | null;
  green_team_id: number | null;
  center_id: number;
  ipl_id: string | null;
  /** Pacific wall time, as the PDF migration read it. */
  start: string;
  league_round: number | null;
  league_match: number | null;
  description: string | null;
  winner: string | null;
  red_score: number;
  red_adj: number;
  green_score: number;
  green_adj: number;
  red_eliminated: number;
  green_eliminated: number;
  /** Legacy scorecards; 0 for a result typed in by hand (a forfeit, or a lost PDF). */
  cards: number;
};
type LegacyTeam = { id: number; name: string; points: number };
type LegacyRound = { id: number; round: number | null; is_finals: number; multiplier: number };
type LegacyMatch = {
  id: number;
  round_id: number;
  match: number;
  team_1_id: number | null;
  team_2_id: number | null;
  team_1_points: number | null;
  team_2_points: number | null;
};
type LegacyMatchPenalty = {
  team_id: number;
  type: string;
  description: string | null;
  value: number;
};

type LegacyEventData = {
  event: LegacyEvent;
  games: LegacyGame[];
  teams: LegacyTeam[];
  rounds: LegacyRound[];
  matches: LegacyMatch[];
  matchPenalties: LegacyMatchPenalty[];
};

async function fetchLegacyEvent(legacy: Legacy, legacyId: number): Promise<LegacyEventData> {
  const [event] = (await legacy`
    select e.id::int, e.name, nullif(trim(e.description), '') as description,
           nullif(trim(e.challonge_link), '') as challonge_link,
           e.center_id::int, nullif(trim(c.ipl_id), '') as ipl_id
    from events e join centers c on c.id = e.center_id
    where e.id = ${legacyId}
  `) as unknown as LegacyEvent[];
  if (!event) throw new Error(`Legacy event ${legacyId} not found`);

  const games = (await legacy`
    select g.id::int, g.game_name, g.match_id::int, g.league_game::int,
           g.red_team_id::int, g.green_team_id::int, g.center_id::int,
           nullif(trim(c.ipl_id), '') as ipl_id,
           to_char(g.game_datetime at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') as start,
           g.league_round::int, g.league_match::int,
           nullif(trim(g.game_description), '') as description, g.winner,
           coalesce(g.red_score, 0)::int as red_score, g.red_adj::int,
           coalesce(g.green_score, 0)::int as green_score, g.green_adj::int,
           g.red_eliminated::int, g.green_eliminated::int,
           (select count(*)::int from scorecards s where s.game_id = g.id) as cards
    from games g join centers c on c.id = g.center_id
    where g.event_id = ${legacyId} and g.tdf_key is null
    order by g.game_datetime, g.id
  `) as unknown as LegacyGame[];

  const teams = (await legacy`
    select t.id::int, t.name, t.points::int from event_teams t
    where t.event_id = ${legacyId} order by t.id
  `) as unknown as LegacyTeam[];

  const rounds = (await legacy`
    select r.id::int, r.round::int, coalesce(r.is_finals, 0)::int as is_finals,
           coalesce(r.multiplier, 1)::int as multiplier
    from rounds r where r.event_id = ${legacyId}
  `) as unknown as LegacyRound[];

  const matches = (await legacy`
    select m.id::int, m.round_id::int, m.match::int, m.team_1_id::int, m.team_2_id::int,
           m.team_1_points::int, m.team_2_points::int
    from matches m join rounds r on r.id = m.round_id
    where r.event_id = ${legacyId}
  `) as unknown as LegacyMatch[];

  const matchPenalties = (await legacy`
    select mp.team_id::int, mp.type, nullif(trim(mp.description), '') as description,
           mp.value::int
    from match_penalties mp join event_teams t on t.id = mp.team_id
    where t.event_id = ${legacyId}
    order by mp.id
  `) as unknown as LegacyMatchPenalty[];

  return { event, games, teams, rounds, matches, matchPenalties };
}

/** Legacy scorecards of the given games: who played on which side. */
async function fetchLegacySides(
  legacy: Legacy,
  gameIds: number[],
): Promise<{ game_id: number; player_id: number; ipl_id: string | null; side: string }[]> {
  if (gameIds.length === 0) return [];
  // PDF-era scorecards often have no team_id; their side is the `team` text.
  return (await legacy`
    select s.game_id::int, s.player_id::int, nullif(trim(p.ipl_id), '') as ipl_id,
           coalesce(gt.color_normal, lower(trim(s.team))) as side
    from scorecards s
    join players p on p.id = s.player_id
    left join game_teams gt on gt.id = s.team_id
    where s.game_id in ${legacy(gameIds)}
      and coalesce(gt.color_normal, lower(trim(s.team))) in ('red', 'green')
  `) as unknown as { game_id: number; player_id: number; ipl_id: string | null; side: string }[];
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** One legacy game as it exists in modern. */
type ModernGame = {
  legacyGameId: number;
  gameId: string;
  /** `result_only` is not in modern yet: applyPlan creates it with these ids. */
  kind: "sm5_pdf" | "sm5" | "result_only";
  startTime: Date;
  competitionId: string | null;
  /** Game team id per legacy side; absent when the sides could not be resolved. */
  sides: { red: string; green: string } | null;
  resultOnly?: ResultOnlyGame;
};

type ResultOnlySide = {
  score: number;
  eliminationBonus: number;
  eliminated: boolean;
  result: "win" | "loss" | "draw";
};

/**
 * A legacy game with no scorecards — a forfeit with dummy scores, or a real game whose PDF
 * was lost and whose totals were typed in. The PDF migration skipped these as placeholders;
 * they come across as sm5_pdf games with team totals and no scorecards. Decided 2026-10-28.
 */
type ResultOnlyGame = {
  centerId: string;
  legacy: LegacyGame;
  outcome: "score" | "elimination" | "draw";
  red: ResultOnlySide;
  green: ResultOnlySide;
};

const RESULT_ONLY_NOTE = "Result only — no scorecard in legacy.";

/**
 * Splits legacy `score + adj` into modern columns. Legacy `adj` folds penalties and the
 * 10,000 elimination bonus together and, on hand-typed results, often holds the whole score;
 * only an adj carrying the bonus against an eliminated opponent is split out. The total is
 * kept exactly; penalty_score is 0 since legacy recorded no penalty rows for these games.
 */
function resultOnlySides(g: LegacyGame): { red: ResultOnlySide; green: ResultOnlySide } {
  const side = (score: number, adj: number, opponentEliminated: boolean) => {
    const bonus = opponentEliminated && adj >= 10000 ? 10000 : 0;
    return { score: score + adj - bonus, eliminationBonus: bonus };
  };
  const red = side(g.red_score, g.red_adj, g.green_eliminated === 1);
  const green = side(g.green_score, g.green_adj, g.red_eliminated === 1);
  const redTotal = red.score + red.eliminationBonus;
  const greenTotal = green.score + green.eliminationBonus;
  const result = (a: number, b: number): ResultOnlySide["result"] =>
    a === b ? "draw" : a > b ? "win" : "loss";
  return {
    red: { ...red, eliminated: g.red_eliminated === 1, result: result(redTotal, greenTotal) },
    green: { ...green, eliminated: g.green_eliminated === 1, result: result(greenTotal, redTotal) },
  };
}

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
  legacyPoints: [number | null, number | null];
};
type PlannedMatchGame = {
  matchLegacyId: number;
  legacyGameId: number;
  gameNumber: number;
  gameId: string;
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
type PlannedAdjustment = { teamLegacyId: number; points: number; reason: string };

type Plan = {
  cfg: LegacyPdfEventConfig;
  name: string;
  slug: string;
  hostCenterId: string;
  startDate: string;
  endDate: string;
  description: string | null;
  challongeLink: string | null;
  games: ModernGame[];
  teams: PlannedTeam[];
  rounds: PlannedRound[];
  matches: PlannedMatch[];
  matchGames: PlannedMatchGame[];
  roster: PlannedRosterEntry[];
  rosterConsistency: number | null;
  adjustments: PlannedAdjustment[];
  legacyTeamPoints: Map<number, number>;
  warnings: string[];
  notes: string[];
};

function centerCode(centerId: number, iplId: string | null): string | null {
  return LEGACY_CENTER_OVERRIDES[centerId] ?? iplId;
}

async function modernCenterId(db: Db, code: string): Promise<string | null> {
  const [countryCode, siteCode] = code.split("-").map(Number);
  const [row] = await db
    .select({ id: center.id })
    .from(center)
    .where(and(eq(center.countryCode, countryCode), eq(center.siteCode, siteCode)));
  return row?.id ?? null;
}

async function resolveModernGames(
  db: Db,
  legacy: Legacy,
  data: LegacyEventData,
  warnings: string[],
  notes: string[],
): Promise<ModernGame[]> {
  const legacyIds = data.games.map((g) => g.id);
  const pdfRows =
    legacyIds.length === 0
      ? []
      : await db
          .select({
            legacyGameId: sm5PdfGame.legacyGameId,
            gameId: sm5PdfGame.gameId,
            startTime: game.startTime,
            competitionId: game.competitionId,
          })
          .from(sm5PdfGame)
          .innerJoin(game, eq(game.id, sm5PdfGame.gameId))
          .where(inArray(sm5PdfGame.legacyGameId, legacyIds));
  const pdfByLegacyId = new Map(pdfRows.map((r) => [r.legacyGameId, r]));

  const pdfTeams =
    pdfRows.length === 0
      ? []
      : await db
          .select({
            id: sm5PdfGameTeam.id,
            gameId: sm5PdfGameTeam.gameId,
            side: sm5PdfGameTeam.side,
          })
          .from(sm5PdfGameTeam)
          .where(
            inArray(
              sm5PdfGameTeam.gameId,
              pdfRows.map((r) => r.gameId),
            ),
          );
  const pdfSide = new Map(pdfTeams.map((t) => [`${t.gameId}:${t.side}`, t.id]));

  const result: ModernGame[] = [];
  const unresolved: LegacyGame[] = [];
  for (const g of data.games) {
    const row = pdfByLegacyId.get(g.id);
    if (!row) {
      unresolved.push(g);
      continue;
    }
    const red = pdfSide.get(`${row.gameId}:red`);
    const green = pdfSide.get(`${row.gameId}:green`);
    result.push({
      legacyGameId: g.id,
      gameId: row.gameId,
      kind: "sm5_pdf",
      startTime: row.startTime,
      competitionId: row.competitionId,
      sides: red && green ? { red, green } : null,
    });
  }

  // The PDF migration skipped a PDF game that was the same game as an already-ingested TDF
  // game. Find it again by the same rule, and map its sides by who played on them.
  const tdfMatches: {
    legacy: LegacyGame;
    gameId: string;
    startTime: Date;
    competitionId: string | null;
  }[] = [];
  for (const g of unresolved) {
    const code = centerCode(g.center_id, g.ipl_id);
    const centerId = code ? await modernCenterId(db, code) : null;
    const [near] = centerId
      ? await db
          .select({ id: game.id, startTime: game.startTime, competitionId: game.competitionId })
          .from(game)
          .where(
            and(
              eq(game.centerId, centerId),
              eq(game.type, "sm5"),
              sql`abs(extract(epoch from ${game.startTime} - ${g.start}::timestamp)) <= ${DUPLICATE_WINDOW_SECONDS}`,
            ),
          )
          .orderBy(sql`abs(extract(epoch from ${game.startTime} - ${g.start}::timestamp))`)
          .limit(1)
      : [];
    if (!near && g.cards === 0 && centerId) {
      const wall = `${g.start.replace(" ", "T")}Z`;
      const [taken] = await db
        .select({ id: game.id })
        .from(game)
        .where(and(eq(game.centerId, centerId), eq(game.startTime, new Date(wall))));
      if (taken) {
        warnings.push(`Result-only legacy game ${g.id} collides with game ${taken.id}; left out.`);
        continue;
      }
      const sides = resultOnlySides(g);
      const red = sides.red.score + sides.red.eliminationBonus;
      const green = sides.green.score + sides.green.eliminationBonus;
      notes.push(
        `Legacy game ${g.id} ("${g.game_name}") has no scorecards: created as a result-only ` +
          `game, red ${red} v green ${green}.`,
      );
      result.push({
        legacyGameId: g.id,
        gameId: randomUUID(),
        kind: "result_only",
        // Local wall time; the Z only stops the driver applying the machine's timezone.
        startTime: new Date(wall),
        competitionId: null,
        sides: { red: randomUUID(), green: randomUUID() },
        resultOnly: {
          centerId,
          legacy: g,
          outcome:
            g.red_eliminated === 1 || g.green_eliminated === 1
              ? "elimination"
              : red === green
                ? "draw"
                : "score",
          ...sides,
        },
      });
      continue;
    }
    if (!near) {
      notes.push(`Legacy game ${g.id} ("${g.game_name}") has no modern game; left out.`);
      continue;
    }
    tdfMatches.push({
      legacy: g,
      gameId: near.id,
      startTime: near.startTime,
      competitionId: near.competitionId,
    });
  }

  if (tdfMatches.length > 0) {
    const legacySides = await fetchLegacySides(
      legacy,
      tdfMatches.map((m) => m.legacy.id),
    );
    const maps = await db
      .select({
        legacyPlayerId: legacyPlayerMap.legacyPlayerId,
        playerId: legacyPlayerMap.playerId,
      })
      .from(legacyPlayerMap)
      .where(
        and(
          inArray(legacyPlayerMap.legacyPlayerId, [
            ...new Set(legacySides.map((s) => s.player_id)),
          ]),
          eq(legacyPlayerMap.legacyVariant, 0),
        ),
      );
    const modernPlayer = new Map(maps.map((m) => [m.legacyPlayerId, m.playerId]));
    // A player who only ever appears in TDF games has no legacy_player_map row; fall back
    // to the IPL id.
    const iplIds = [
      ...new Set(
        legacySides.filter((s) => !modernPlayer.has(s.player_id) && s.ipl_id).map((s) => s.ipl_id!),
      ),
    ];
    if (iplIds.length > 0) {
      const byIpl = await db
        .select({ id: player.id, iplId: player.iplId })
        .from(player)
        .where(inArray(player.iplId, iplIds));
      const idByIpl = new Map(byIpl.map((p) => [p.iplId, p.id]));
      for (const s of legacySides) {
        const id = s.ipl_id ? idByIpl.get(s.ipl_id) : undefined;
        if (id && !modernPlayer.has(s.player_id)) modernPlayer.set(s.player_id, id);
      }
    }
    const modernCards = await db
      .select({
        gameId: sm5Scorecard.gameId,
        teamId: sm5Scorecard.teamId,
        playerId: sm5Scorecard.playerId,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
      .where(
        and(
          inArray(
            sm5Scorecard.gameId,
            tdfMatches.map((m) => m.gameId),
          ),
          eq(sm5GameTeam.isNeutral, false),
          isNotNull(sm5Scorecard.playerId),
        ),
      );

    for (const m of tdfMatches) {
      const teamOf = new Map(
        modernCards.filter((c) => c.gameId === m.gameId).map((c) => [c.playerId!, c.teamId]),
      );
      // Votes per (legacy side, modern game team).
      const votes = new Map<string, number>();
      for (const s of legacySides.filter((x) => x.game_id === m.legacy.id)) {
        const p = modernPlayer.get(s.player_id);
        const team = p ? teamOf.get(p) : undefined;
        if (!team) continue;
        const key = `${s.side}|${team}`;
        votes.set(key, (votes.get(key) ?? 0) + 1);
      }
      const best = (side: string) =>
        [...votes.entries()]
          .filter(([k]) => k.startsWith(`${side}|`))
          .sort((a, b) => b[1] - a[1])[0];
      const red = best("red");
      const green = best("green");
      const redTeam = red?.[0].split("|")[1];
      const greenTeam = green?.[0].split("|")[1];
      const sides =
        redTeam && greenTeam && redTeam !== greenTeam ? { red: redTeam, green: greenTeam } : null;
      if (!sides) {
        warnings.push(
          `Legacy game ${m.legacy.id} is TDF game ${m.gameId}, but its sides could not be mapped by players.`,
        );
      }
      notes.push(
        `Legacy game ${m.legacy.id} is the TDF game at ${m.legacy.start} ` +
          `(sides mapped by ${red?.[1] ?? 0}+${green?.[1] ?? 0} players).`,
      );
      result.push({
        legacyGameId: m.legacy.id,
        gameId: m.gameId,
        kind: "sm5",
        startTime: m.startTime,
        competitionId: m.competitionId,
        sides,
      });
    }
  }

  return result;
}

async function buildPlan(
  db: Db,
  legacy: Legacy,
  cfg: LegacyPdfEventConfig,
  data: LegacyEventData,
): Promise<Plan> {
  const warnings: string[] = [];
  const notes: string[] = [];
  const name = cfg.name ?? data.event.name;

  const hostCode = centerCode(data.event.center_id, data.event.ipl_id);
  const hostCenterId = hostCode ? await modernCenterId(db, hostCode) : null;
  if (!hostCenterId) {
    throw new Error(`Legacy event ${cfg.legacyId}: no modern center for "${hostCode}"`);
  }

  const games = await resolveModernGames(db, legacy, data, warnings, notes);
  if (games.length === 0) throw new Error(`Legacy event ${cfg.legacyId} has no modern games`);
  // Games already in this event's own competition are a rebuild (--force), not a conflict.
  const own = await getCompetitionBySlug(slugify(name));
  for (const g of games) {
    if (g.competitionId && g.competitionId !== own?.id) {
      warnings.push(
        `Game ${g.gameId} (legacy ${g.legacyGameId}) already belongs to another competition.`,
      );
    }
  }
  const times = games.map((g) => g.startTime).sort((a, b) => a.getTime() - b.getTime());

  const description =
    [data.event.description, cfg.descriptionNote].filter(Boolean).join("\n\n") || null;

  const plan: Plan = {
    cfg,
    name,
    slug: slugify(name),
    hostCenterId,
    startDate: toDateString(times[0]),
    endDate: toDateString(times[times.length - 1]),
    description,
    challongeLink: data.event.challonge_link,
    games,
    teams: [],
    rounds: [],
    matches: [],
    matchGames: [],
    roster: [],
    rosterConsistency: null,
    adjustments: [],
    legacyTeamPoints: new Map(data.teams.map((t) => [t.id, t.points])),
    warnings,
    notes,
  };

  if (cfg.shape === "shell") {
    if (cfg.coplay) {
      await planFromCoplay(db, plan);
    } else {
      notes.push("No teams in legacy: competition and games only; build teams by hand.");
    }
    return plan;
  }

  // --- teams -------------------------------------------------------------
  const used = new Set<string>();
  plan.teams = data.teams.map((t) => ({
    legacyId: t.id,
    name: t.name.trim(),
    shortName: cfg.shortNames?.[t.id] ?? uniquifyShortName(deriveShortName(t.name), used),
  }));
  const teamIds = new Set(plan.teams.map((t) => t.legacyId));

  // --- which game team each event team played as --------------------------
  const modernByLegacy = new Map(games.map((g) => [g.legacyGameId, g]));
  const gameTeamToEventTeam = new Map<string, number>();
  for (const lg of data.games) {
    const mg = modernByLegacy.get(lg.id);
    if (!mg?.sides || lg.red_team_id === null || lg.green_team_id === null) continue;
    if (!teamIds.has(lg.red_team_id) || !teamIds.has(lg.green_team_id)) {
      warnings.push(`Legacy game ${lg.id} names a team from another event; sides ignored.`);
      continue;
    }
    gameTeamToEventTeam.set(mg.sides.red, lg.red_team_id);
    gameTeamToEventTeam.set(mg.sides.green, lg.green_team_id);
  }

  if (cfg.shape === "matches") planMatches(plan, data, modernByLegacy);
  if (cfg.shape === "sides") planMatches(plan, withLeagueStructure(cfg, data), modernByLegacy);

  // --- match penalties -> standings adjustments ----------------------------
  plan.adjustments = data.matchPenalties.map((p) => ({
    teamLegacyId: p.team_id,
    points: p.value,
    reason:
      [p.type.trim(), p.description]
        .filter((s): s is string => !!s)
        .filter((s, i, all) => all.indexOf(s) === i)
        .join(": ") || "Legacy match penalty",
  }));

  await buildRoster(db, plan, gameTeamToEventTeam);
  return plan;
}

/**
 * A `sides` event has no legacy rounds or matches, but each game still carries
 * `league_round` / `league_match` / `league_game`. Builds the rounds and matches those imply,
 * shaped like legacy's own (negative ids, no stored points), so planMatches treats the event
 * like any other — including its check that every game of a match is the same two teams.
 * The match's team 1 is the red side of its first game.
 */
function withLeagueStructure(cfg: LegacyPdfEventConfig, data: LegacyEventData): LegacyEventData {
  const finals = new Set(cfg.finalsLeagueRounds ?? []);
  const rounds = new Map<number, LegacyRound>();
  const matches = new Map<number, LegacyMatch>();
  const games = data.games.map((g) => {
    if (g.league_round === null || g.league_match === null) {
      return { ...g, match_id: null };
    }
    const roundId = -g.league_round;
    const matchId = -(g.league_round * 1000 + g.league_match);
    if (!rounds.has(roundId)) {
      rounds.set(roundId, {
        id: roundId,
        round: g.league_round,
        is_finals: finals.has(g.league_round) ? 1 : 0,
        multiplier: 1,
      });
    }
    if (!matches.has(matchId)) {
      matches.set(matchId, {
        id: matchId,
        round_id: roundId,
        match: g.league_match,
        team_1_id: g.red_team_id,
        team_2_id: g.green_team_id,
        team_1_points: null,
        team_2_points: null,
      });
    }
    return { ...g, match_id: matchId };
  });
  return { ...data, games, rounds: [...rounds.values()], matches: [...matches.values()] };
}

function planMatches(
  plan: Plan,
  data: LegacyEventData,
  modernByLegacy: Map<number, ModernGame>,
): void {
  const { cfg, warnings, notes } = plan;
  const gamesByMatch = new Map<number, LegacyGame[]>();
  for (const g of data.games) {
    if (g.match_id === null) continue;
    gamesByMatch.set(g.match_id, [...(gamesByMatch.get(g.match_id) ?? []), g]);
  }

  // Decided 2026-10-28: keep scheduled matches that were never played, drop the ones with an
  // empty slot (bracket placeholders that were never filled).
  const kept = data.matches.filter((m) => {
    if (m.team_1_id !== null && m.team_2_id !== null) return true;
    if (gamesByMatch.has(m.id)) {
      warnings.push(`Legacy match ${m.id} has games but an empty team slot; dropped.`);
    }
    return false;
  });
  const droppedMatches = data.matches.length - kept.length;
  if (droppedMatches > 0) notes.push(`Dropped ${droppedMatches} empty-slot placeholder match(es).`);
  const unplayed = kept.filter((m) => !gamesByMatch.has(m.id)).length;
  if (unplayed > 0)
    notes.push(`${unplayed} scheduled match(es) were never played; kept, unscored.`);

  // --- rounds: finals last, then legacy round number (NULL last), then id; renumbered 1..N
  const keptRoundIds = new Set(kept.map((m) => m.round_id));
  const rounds = data.rounds
    .filter((r) => keptRoundIds.has(r.id))
    .sort((a, b) => a.is_finals - b.is_finals || (a.round ?? 99) - (b.round ?? 99) || a.id - b.id);
  const finalsCount = rounds.filter((r) => r.is_finals === 1).length;
  let pool = 0;
  let finals = 0;
  plan.rounds = rounds.map((r, i) => {
    const isFinals = r.is_finals === 1;
    const label = isFinals
      ? finalsCount > 1
        ? `Finals ${++finals}`
        : "Finals"
      : `Round ${++pool}`;
    return {
      legacyId: r.id,
      name: label,
      roundNumber: i + 1,
      type: isFinals ? ("finals" as const) : ("pool" as const),
      multiplier: r.multiplier,
    };
  });
  const droppedRounds = data.rounds.length - rounds.length;
  if (droppedRounds > 0) notes.push(`Dropped ${droppedRounds} round(s) left with no matches.`);

  plan.matches = kept
    .map((m) => ({
      legacyId: m.id,
      roundLegacyId: m.round_id,
      matchNumber: m.match,
      team1LegacyId: m.team_1_id,
      team2LegacyId: m.team_2_id,
      legacyPoints: [m.team_1_points, m.team_2_points] as [number | null, number | null],
    }))
    .sort((a, b) => a.roundLegacyId - b.roundLegacyId || a.matchNumber - b.matchNumber);

  // --- match games -----------------------------------------------------------
  const matchById = new Map(plan.matches.map((m) => [m.legacyId, m]));
  for (const lg of data.games) {
    if (lg.match_id === null) {
      notes.push(`Legacy game ${lg.id} ("${lg.game_name}") is in no match; competition only.`);
      continue;
    }
    const reason = cfg.unmatchedGames?.[lg.id];
    if (reason) {
      notes.push(`Legacy game ${lg.id} kept out of its match by config: ${reason}.`);
      continue;
    }
    const match = matchById.get(lg.match_id);
    const mg = modernByLegacy.get(lg.id);
    if (!match || !mg) continue;
    if (!mg.sides) {
      warnings.push(`Legacy game ${lg.id}: sides unresolved; not placed in its match.`);
      continue;
    }
    if (lg.league_game !== 1 && lg.league_game !== 2) {
      warnings.push(`Legacy game ${lg.id} has league_game=${lg.league_game}; not placed.`);
      continue;
    }
    const gameSides = [lg.red_team_id, lg.green_team_id].sort();
    const matchSides = [match.team1LegacyId, match.team2LegacyId].sort();
    if (gameSides[0] !== matchSides[0] || gameSides[1] !== matchSides[1]) {
      throw new Error(
        `Legacy game ${lg.id} teams (${gameSides}) do not match its match ${match.legacyId} ` +
          `(${matchSides}); add it to unmatchedGames or fix the config.`,
      );
    }
    const team1IsRed = lg.red_team_id === match.team1LegacyId;
    plan.matchGames.push({
      matchLegacyId: match.legacyId,
      legacyGameId: lg.id,
      gameNumber: lg.league_game,
      gameId: mg.gameId,
      team1GameTeamId: team1IsRed ? mg.sides.red : mg.sides.green,
      team2GameTeamId: team1IsRed ? mg.sides.green : mg.sides.red,
    });
  }

  const slots = new Set<string>();
  for (const mg of plan.matchGames) {
    const key = `${mg.matchLegacyId}:${mg.gameNumber}`;
    if (slots.has(key))
      throw new Error(`Legacy match ${mg.matchLegacyId} has two game ${mg.gameNumber}s`);
    slots.add(key);
  }
}

/**
 * Rosters from who actually played, over TDF and PDF-era scorecards alike. A player's roster
 * team is the one they played the most games for (ties: earliest); every other team they
 * appear on gets a mercenary entry.
 */
async function buildRoster(
  db: Db,
  plan: Plan,
  gameTeamToEventTeam: Map<string, number>,
): Promise<void> {
  const gameTeamIds = [...gameTeamToEventTeam.keys()];
  if (gameTeamIds.length === 0) return;

  const rows = await db
    .select({
      playerId: competitionScorecard.playerId,
      teamId: competitionScorecard.teamId,
      callsign: player.currentCallsign,
      games: sql<number>`count(*)::int`,
      firstSeen: sql<string>`min(${game.startTime})::text`,
    })
    .from(competitionScorecard)
    .innerJoin(game, eq(game.id, competitionScorecard.gameId))
    .innerJoin(player, eq(player.id, competitionScorecard.playerId))
    .where(
      and(
        inArray(competitionScorecard.teamId, gameTeamIds),
        isNotNull(competitionScorecard.playerId),
      ),
    )
    .groupBy(competitionScorecard.playerId, competitionScorecard.teamId, player.currentCallsign);

  type Entry = {
    playerId: string;
    callsign: string;
    teamLegacyId: number;
    games: number;
    firstSeen: string;
  };
  const perPlayerTeam = new Map<string, Entry>();
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

  const byPlayer = new Map<string, Entry[]>();
  for (const e of perPlayerTeam.values()) {
    byPlayer.set(e.playerId, [...(byPlayer.get(e.playerId) ?? []), e]);
  }

  let total = 0;
  let onPrimary = 0;
  for (const entries of byPlayer.values()) {
    entries.sort((a, b) => b.games - a.games || a.firstSeen.localeCompare(b.firstSeen));
    entries.forEach((e, i) => {
      total += e.games;
      if (i === 0) onPrimary += e.games;
      plan.roster.push({ ...e, isMercenary: i > 0 });
    });
  }
  plan.rosterConsistency = total > 0 ? onPrimary / total : null;
  if (plan.rosterConsistency !== null && plan.rosterConsistency < ROSTER_CONSISTENCY_FLOOR) {
    // A note, not a warning: legacy's own match points check the side mapping independently
    // (verifyPoints), and long league seasons genuinely see players change teams.
    plan.notes.push(
      `Roster consistency ${(plan.rosterConsistency * 100).toFixed(1)}% is below ` +
        `${ROSTER_CONSISTENCY_FLOOR * 100}% — players moved between teams; the legacy points ` +
        `check confirms the sides.`,
    );
  }
}

function toDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Verification against legacy's own points
// ---------------------------------------------------------------------------

type Verification = {
  playedMatches: number;
  matchMismatches: string[];
  teamTotals: { team: string; legacy: number; modern: number }[];
};

async function verifyPoints(db: Db, plan: Plan): Promise<Verification> {
  const sideIds = plan.matchGames.flatMap((mg) => [mg.team1GameTeamId, mg.team2GameTeamId]);
  const sides =
    sideIds.length === 0
      ? []
      : await db
          .select({
            id: competitionGameSide.id,
            total: sql<number>`(${competitionGameSide.score} + ${competitionGameSide.eliminationBonus} + coalesce(${competitionGameSide.penaltyScore}, 0))::int`,
            result: competitionGameSide.result,
            eliminated: competitionGameSide.eliminated,
          })
          .from(competitionGameSide)
          .where(inArray(competitionGameSide.id, sideIds));
  const side = new Map<
    string,
    { total: number; result: string | null; eliminated: boolean | null }
  >(sides.map((s) => [s.id, s]));
  // Result-only games are not written yet: score them from the plan.
  for (const g of plan.games) {
    if (!g.resultOnly || !g.sides) continue;
    for (const s of ["red", "green"] as const) {
      const r = g.resultOnly[s];
      side.set(g.sides[s], {
        total: r.score + r.eliminationBonus,
        result: r.result,
        eliminated: r.eliminated,
      });
    }
  }
  const roundOf = new Map(plan.rounds.map((r) => [r.legacyId, r]));
  const teamName = new Map(plan.teams.map((t) => [t.legacyId, t.shortName]));

  const rowsByMatch = new Map<number, StandingsGameRow[]>();
  for (const mg of plan.matchGames) {
    const m = plan.matches.find((x) => x.legacyId === mg.matchLegacyId)!;
    const t1 = side.get(mg.team1GameTeamId)!;
    const t2 = side.get(mg.team2GameTeamId)!;
    rowsByMatch.set(mg.matchLegacyId, [
      ...(rowsByMatch.get(mg.matchLegacyId) ?? []),
      {
        matchId: String(m.legacyId),
        gameNumber: mg.gameNumber,
        roundMultiplier: roundOf.get(m.roundLegacyId)!.multiplier,
        team1Id: String(m.team1LegacyId),
        team1PartnerId: null,
        team1Partner2Id: null,
        team1Score: t1.total,
        team1Result: t1.result ?? "draw",
        team1EliminatedOpponent: t2.eliminated ?? false,
        team2Id: String(m.team2LegacyId),
        team2PartnerId: null,
        team2Partner2Id: null,
        team2Score: t2.total,
        team2Result: t2.result ?? "draw",
        team2EliminatedOpponent: t1.eliminated ?? false,
      },
    ]);
  }

  const matchMismatches: string[] = [];
  for (const m of plan.matches) {
    const rows = rowsByMatch.get(m.legacyId);
    if (!rows) continue;
    const stats = computeTeamStats(rows);
    const p1 = stats.get(String(m.team1LegacyId))?.matchPoints ?? 0;
    const p2 = stats.get(String(m.team2LegacyId))?.matchPoints ?? 0;
    const [l1, l2] = m.legacyPoints;
    if (l1 !== p1 || l2 !== p2) {
      const round = roundOf.get(m.roundLegacyId)!;
      matchMismatches.push(
        `${round.name} match ${m.matchNumber} ${teamName.get(m.team1LegacyId!)} v ` +
          `${teamName.get(m.team2LegacyId!)}: legacy ${l1 ?? "—"}-${l2 ?? "—"}, modern ${p1}-${p2}` +
          ` (${rows.length} game${rows.length === 1 ? "" : "s"})`,
      );
    }
  }

  // Whole-competition totals over non-finals rounds, as the standings page shows them.
  const poolRows = [...rowsByMatch.entries()]
    .filter(([id]) => {
      const m = plan.matches.find((x) => x.legacyId === id)!;
      return roundOf.get(m.roundLegacyId)!.type !== "finals";
    })
    .flatMap(([, rows]) => rows);
  const modern = computeTeamStats(poolRows);
  applyTeamAdjustments(
    modern,
    plan.adjustments.map((a) => ({ teamId: String(a.teamLegacyId), points: a.points })),
  );
  const legacyTotals = new Map<number, number>();
  for (const m of plan.matches) {
    if (roundOf.get(m.roundLegacyId)!.type === "finals") continue;
    const [l1, l2] = m.legacyPoints;
    if (m.team1LegacyId !== null)
      legacyTotals.set(m.team1LegacyId, (legacyTotals.get(m.team1LegacyId) ?? 0) + (l1 ?? 0));
    if (m.team2LegacyId !== null)
      legacyTotals.set(m.team2LegacyId, (legacyTotals.get(m.team2LegacyId) ?? 0) + (l2 ?? 0));
  }
  for (const a of plan.adjustments) {
    legacyTotals.set(a.teamLegacyId, (legacyTotals.get(a.teamLegacyId) ?? 0) + a.points);
  }
  const teamTotals = plan.teams.map((t) => ({
    team: t.shortName,
    legacy: legacyTotals.get(t.legacyId) ?? 0,
    modern: modern.get(String(t.legacyId))?.matchPoints ?? 0,
  }));

  return { playedMatches: rowsByMatch.size, matchMismatches, teamTotals };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printPlan(plan: Plan, v: Verification | null, verbose: boolean): void {
  const { cfg } = plan;
  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `Legacy event ${cfg.legacyId} (${cfg.shape}, ${cfg.category}) -> "${plan.name}" [${plan.slug}]`,
  );
  console.log("=".repeat(78));
  const tdf = plan.games.filter((g) => g.kind === "sm5").length;
  console.log(`  dates        ${plan.startDate} .. ${plan.endDate}`);
  console.log(`  games        ${plan.games.length}${tdf ? ` (${tdf} TDF)` : ""}`);
  if (plan.challongeLink) console.log(`  challonge    ${plan.challongeLink}`);
  if (plan.description) console.log(`  description  ${plan.description.replace(/\n+/g, " / ")}`);

  if (plan.teams.length > 0) {
    console.log(`\n  Teams (${plan.teams.length}):`);
    for (const t of plan.teams) {
      const roster = plan.roster.filter((r) => r.teamLegacyId === t.legacyId);
      const mercs = roster.filter((r) => r.isMercenary).length;
      console.log(
        `    ${t.shortName.padEnd(9)} ${t.name}  (${roster.length - mercs} players, ${mercs} merc)`,
      );
    }
    if (plan.rosterConsistency !== null) {
      console.log(`  Roster consistency ${(plan.rosterConsistency * 100).toFixed(1)}%`);
    }
    if (verbose) {
      const teamName = new Map(plan.teams.map((t) => [t.legacyId, t.shortName]));
      for (const r of plan.roster) {
        console.log(
          `    ${teamName.get(r.teamLegacyId)!.padEnd(9)} ${r.callsign.padEnd(20)} ${r.games}${r.isMercenary ? " merc" : ""}`,
        );
      }
    }
  }
  if (plan.rounds.length > 0) {
    console.log(`\n  Rounds (${plan.rounds.length}):`);
    for (const r of plan.rounds) {
      const n = plan.matches.filter((m) => m.roundLegacyId === r.legacyId).length;
      console.log(`    ${r.roundNumber}. ${r.name.padEnd(9)} ${r.type.padEnd(7)} ${n} matches`);
    }
    console.log(`  Matches ${plan.matches.length}, match games ${plan.matchGames.length}`);
  }
  for (const a of plan.adjustments) {
    const t = plan.teams.find((x) => x.legacyId === a.teamLegacyId);
    console.log(`  Adjustment   ${t?.shortName ?? a.teamLegacyId} ${a.points}: ${a.reason}`);
  }

  if (v && cfg.shape !== "matches") {
    // Nothing to check against: legacy stored no match points for an event with no matches.
    const standings = [...v.teamTotals].sort((a, b) => b.modern - a.modern);
    console.log(`\n  Legacy stored no match points. Modern standings (non-finals):`);
    console.log(`    ${standings.map((t) => `${t.team} ${t.modern}`).join(", ")}`);
  } else if (v) {
    const ok = v.playedMatches - v.matchMismatches.length;
    console.log(`\n  Legacy points: ${ok}/${v.playedMatches} played matches agree`);
    for (const line of verbose ? v.matchMismatches : v.matchMismatches.slice(0, 5)) {
      console.log(`    ≠ ${line}`);
    }
    if (!verbose && v.matchMismatches.length > 5) {
      console.log(`    … ${v.matchMismatches.length - 5} more (--verbose)`);
    }
    const diffs = v.teamTotals.filter((t) => t.legacy !== t.modern);
    console.log(
      diffs.length === 0
        ? `  Team totals (non-finals + adjustments): all ${v.teamTotals.length} agree`
        : `  Team totals differ: ${diffs.map((d) => `${d.team} legacy ${d.legacy} / modern ${d.modern}`).join(", ")}`,
    );
    const stored = plan.teams.filter((t) => (plan.legacyTeamPoints.get(t.legacyId) ?? 0) !== 0);
    if (stored.length > 0) {
      console.log(
        `  Legacy event_teams.points: ${stored.map((t) => `${t.shortName} ${plan.legacyTeamPoints.get(t.legacyId)}`).join(", ")}`,
      );
    }
  }

  for (const n of verbose ? plan.notes : plan.notes.slice(0, 6)) console.log(`  · ${n}`);
  if (!verbose && plan.notes.length > 6)
    console.log(`  · … ${plan.notes.length - 6} more notes (--verbose)`);
  for (const w of plan.warnings) console.log(`  ! ${w}`);
}

async function runReport(db: Db, legacy: Legacy): Promise<void> {
  const events = (await legacy`
    select e.id::int, e.name,
           (select count(*)::int from games g where g.event_id = e.id and g.tdf_key is null) as pdf_games,
           (select count(*)::int from games g where g.event_id = e.id and g.tdf_key is not null) as tdf_games
    from events e
    where e.is_comp or e.id in ${legacy(LEGACY_PDF_EVENTS.map((c) => c.legacyId))}
    order by e.id
  `) as unknown as { id: number; name: string; pdf_games: number; tdf_games: number }[];

  console.log(`\n| legacy | name | shape | pdf games | modern |`);
  console.log(`|---|---|---|---|---|`);
  for (const e of events) {
    const cfg = findLegacyPdfEvent(e.id);
    if (!cfg) {
      // A TDF-era event built by hand may still hold a stray PDF placeholder game.
      if (e.pdf_games > 0 && !ALREADY_MIGRATED[e.id]) {
        console.log(`| ${e.id} | ${e.name} | **UNCLASSIFIED** | ${e.pdf_games} | — |`);
      }
      continue;
    }
    const name = cfg.name ?? e.name;
    const existing = await getCompetitionBySlug(slugify(name));
    const status = existing
      ? `built (\`${existing.slug}\`, ${
          (
            await db
              .select({ n: sql<number>`count(*)::int` })
              .from(game)
              .where(eq(game.competitionId, existing.id))
          )[0].n
        } games)`
      : "not built";
    console.log(`| ${e.id} | ${name} | ${cfg.shape} | ${e.pdf_games} | ${status} |`);
  }
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

/** Writes a result-only game with the ids the plan gave it, already in its competition. */
async function createResultOnlyGame(
  db: Db,
  g: ModernGame,
  competitionId: string,
  legacyEventId: number,
): Promise<void> {
  const r = g.resultOnly!;
  const lg = r.legacy;
  await db.transaction(async (tx) => {
    await tx.insert(game).values({
      id: g.gameId,
      centerId: r.centerId,
      competitionId,
      startTime: g.startTime,
      tdfFilename: "",
      outcome: r.outcome,
      // Legacy recorded no length for these; the standard 15 minutes, as the PDF migration
      // falls back to.
      scheduledDuration: 900_000,
      actualDuration: 900_000,
      type: "sm5_pdf",
      description: [lg.description, RESULT_ONLY_NOTE].filter(Boolean).join(" "),
    });
    await tx.insert(sm5PdfGame).values({
      gameId: g.gameId,
      legacyGameId: lg.id,
      pdfId: null,
      gameName: lg.game_name || null,
      legacyEventId,
      legacyMatchId: lg.match_id,
      legacyType: "league",
      leagueRound: lg.league_round,
      leagueMatch: lg.league_match,
      leagueGame: lg.league_game,
      legacyWinner: lg.winner,
    });
    for (const s of ["red", "green"] as const) {
      await tx.insert(sm5PdfGameTeam).values({
        id: g.sides![s],
        gameId: g.gameId,
        side: s,
        name: s === "red" ? "Red Team" : "Green Team",
        colourEnum: s === "red" ? 1 : 2,
        score: r[s].score,
        eliminationBonus: r[s].eliminationBonus,
        penaltyScore: 0,
        result: r[s].result,
        eliminated: r[s].eliminated,
      });
    }
  });
}

async function applyPlan(db: Db, plan: Plan, force: boolean): Promise<void> {
  const existing = await getCompetitionBySlug(plan.slug);
  if (existing) {
    if (!force) {
      throw new Error(
        `Competition "${plan.slug}" already exists; --force deletes and rebuilds it.`,
      );
    }
    console.log(`  --force: deleting ${plan.slug}`);
    // Cascades to teams, rounds, matches, match games and adjustments; game.competition_id
    // is set null.
    await deleteCompetition(existing.id);
  }
  const blocked = plan.games.filter((g) => g.competitionId && g.competitionId !== existing?.id);
  if (blocked.length > 0) {
    throw new Error(`${blocked.length} game(s) already belong to another competition`);
  }

  // Mercenary stamps are derived from the roster; clear any left by an earlier build.
  const pdfGameIds = plan.games.filter((g) => g.kind === "sm5_pdf").map((g) => g.gameId);
  const tdfGameIds = plan.games.filter((g) => g.kind === "sm5").map((g) => g.gameId);
  if (pdfGameIds.length > 0) {
    await db
      .update(sm5PdfScorecard)
      .set({ isMercenary: false })
      .where(inArray(sm5PdfScorecard.gameId, pdfGameIds));
  }
  if (tdfGameIds.length > 0) {
    await db
      .update(sm5Scorecard)
      .set({ isMercenary: false })
      .where(inArray(sm5Scorecard.gameId, tdfGameIds));
  }

  const created = await createCompetition({
    name: plan.name,
    type: "competitive",
    format: "team",
    category: plan.cfg.category,
    state: "completed",
    hostCenterId: plan.hostCenterId,
    startDate: plan.startDate,
    endDate: plan.endDate,
    description: plan.description,
    challongeLink: plan.challongeLink,
  });
  console.log(`  created ${created.slug}`);

  for (const g of plan.games) {
    if (g.resultOnly) await createResultOnlyGame(db, g, created.id, plan.cfg.legacyId);
    else await setGameCompetition(g.gameId, created.id);
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

  const roundIds = new Map<number, string>();
  for (const r of plan.rounds) {
    roundIds.set(
      r.legacyId,
      await createCompetitionRound({
        competitionId: created.id,
        name: r.name,
        roundNumber: r.roundNumber,
        type: r.type,
        multiplier: r.multiplier,
      }),
    );
  }

  const matchIds = new Map<number, string>();
  for (const m of plan.matches) {
    matchIds.set(
      m.legacyId,
      await createCompetitionMatch({
        competitionId: created.id,
        roundId: roundIds.get(m.roundLegacyId)!,
        matchNumber: m.matchNumber,
        team1Id: teamIds.get(m.team1LegacyId!)!,
        team2Id: teamIds.get(m.team2LegacyId!)!,
      }),
    );
  }

  // Rosters before match games: assignGameToMatch stamps is_mercenary from the roster.
  for (const r of plan.roster) {
    const result = await setPlayerMercenary(
      teamIds.get(r.teamLegacyId)!,
      r.playerId,
      r.isMercenary,
    );
    if (!result.ok) throw new Error(`Roster entry for ${r.callsign}: ${result.error}`);
  }

  for (const mg of plan.matchGames) {
    await assignGameToMatch(
      matchIds.get(mg.matchLegacyId)!,
      mg.gameId,
      mg.gameNumber,
      mg.team1GameTeamId,
      mg.team2GameTeamId,
    );
  }

  for (const a of plan.adjustments) {
    const result = await addCompetitionTeamAdjustment({
      competitionId: created.id,
      teamId: teamIds.get(a.teamLegacyId)!,
      points: a.points,
      reason: a.reason,
    });
    if (!result.ok) throw new Error(`Adjustment: ${result.error}`);
  }

  console.log(
    `  ${plan.games.length} games, ${teamIds.size} teams, ${roundIds.size} rounds, ` +
      `${matchIds.size} matches, ${plan.matchGames.length} match games, ` +
      `${plan.roster.length} roster entries, ${plan.adjustments.length} adjustments`,
  );
}

// ---------------------------------------------------------------------------
// Co-play (shell events)
// ---------------------------------------------------------------------------

/** Two players are teammates when they share a side in at least this share of their games. */
const COPLAY_AFFINITY = 0.6;
/** …and at least this many times, so one shared game between occasional players doesn't. */
const COPLAY_MIN_GAMES = 2;
/** A side belongs to a group when at least this share of its players are in it. */
const COPLAY_SIDE_PURITY = 0.75;

type CoplaySide = {
  gameId: string;
  legacyGameId: number;
  side: "red" | "green";
  gameTeamId: string;
  startTime: Date;
  players: string[];
};

type Coplay = {
  sides: CoplaySide[];
  /** Groups of player ids, largest first, labelled A, B, … in that order. */
  groups: string[][];
  /** Group index for each `gameTeamId` whose side is clearly one group. */
  sideGroup: Map<string, number>;
  /** Players who never settled into a group (subs, one-game fill-ins). */
  loners: string[];
  gamesPlayed: Map<string, number>;
  callsign: Map<string, string>;
};

const groupLetter = (i: number) => String.fromCharCode(65 + i);

/**
 * Groups an event's players into teams by who keeps sharing a side: two players are linked
 * when they shared a side in at least COPLAY_AFFINITY of the games either of them played, and
 * the groups are the connected sets.
 */
async function coplayGroups(db: Db, games: ModernGame[]): Promise<Coplay> {
  const teamIds = games.flatMap((g) => (g.sides ? [g.sides.red, g.sides.green] : []));
  const rows =
    teamIds.length === 0
      ? []
      : await db
          .select({
            teamId: competitionScorecard.teamId,
            playerId: competitionScorecard.playerId,
            callsign: player.currentCallsign,
          })
          .from(competitionScorecard)
          .innerJoin(player, eq(player.id, competitionScorecard.playerId))
          .where(inArray(competitionScorecard.teamId, teamIds));

  const playersByTeam = new Map<string, string[]>();
  for (const r of rows) {
    playersByTeam.set(r.teamId, [...(playersByTeam.get(r.teamId) ?? []), r.playerId!]);
  }
  const sides: CoplaySide[] = games
    .flatMap((g) =>
      g.sides
        ? (["red", "green"] as const).map((side) => ({
            gameId: g.gameId,
            legacyGameId: g.legacyGameId,
            side,
            gameTeamId: g.sides![side],
            startTime: g.startTime,
            players: playersByTeam.get(g.sides![side]) ?? [],
          }))
        : [],
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.side.localeCompare(b.side));

  const gamesPlayed = new Map<string, number>();
  const together = new Map<string, number>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const s of sides) {
    for (const p of s.players) gamesPlayed.set(p, (gamesPlayed.get(p) ?? 0) + 1);
    for (let i = 0; i < s.players.length; i++) {
      for (let j = i + 1; j < s.players.length; j++) {
        const k = pairKey(s.players[i], s.players[j]);
        together.set(k, (together.get(k) ?? 0) + 1);
      }
    }
  }

  // Union-find over the teammate pairs.
  const parent = new Map<string, string>([...gamesPlayed.keys()].map((p) => [p, p]));
  const find = (p: string): string => {
    while (parent.get(p) !== p) {
      parent.set(p, parent.get(parent.get(p)!)!);
      p = parent.get(p)!;
    }
    return p;
  };
  for (const [k, n] of together) {
    const [a, b] = k.split("|");
    const affinity = n / Math.min(gamesPlayed.get(a)!, gamesPlayed.get(b)!);
    if (n >= COPLAY_MIN_GAMES && affinity >= COPLAY_AFFINITY) parent.set(find(a), find(b));
  }
  const members = new Map<string, string[]>();
  for (const p of gamesPlayed.keys()) {
    const root = find(p);
    members.set(root, [...(members.get(root) ?? []), p]);
  }
  const clusters = [...members.values()]
    .map((ps) => ps.sort((a, b) => gamesPlayed.get(b)! - gamesPlayed.get(a)!))
    .sort((a, b) => b.length - a.length);
  const groups = clusters.filter((c) => c.length > 1);
  const groupOf = new Map<string, number>();
  groups.forEach((c, i) => c.forEach((p) => groupOf.set(p, i)));

  const sideGroup = new Map<string, number>();
  for (const s of sides) {
    const counts = new Map<number, number>();
    for (const p of s.players) {
      const g = groupOf.get(p);
      if (g !== undefined) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] / s.players.length >= COPLAY_SIDE_PURITY) sideGroup.set(s.gameTeamId, top[0]);
  }

  return {
    sides,
    groups,
    sideGroup,
    loners: clusters.filter((c) => c.length === 1).map((c) => c[0]),
    gamesPlayed,
    callsign: new Map(rows.map((r) => [r.playerId!, r.callsign])),
  };
}

/**
 * Names each group after the center most of its players call home, decided 2026-10-28.
 * A player's home is the center of most of their social games within a year of the event,
 * else of all their social games. A group takes a center's name when at least half its
 * players share it; groups sharing a center get A, B, … suffixes; anything else stays
 * "Team <letter>", the co-play report's label, for an admin to rename.
 */
async function coplayTeamNames(
  db: Db,
  plan: Plan,
  groups: string[][],
): Promise<{ name: string; short: string | null }[]> {
  const playerIds = groups.flat();
  const times = plan.games.map((g) => g.startTime.getTime());
  // Wall-time strings: raw sql parameters do not serialise a Date.
  const wall = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
  const from = wall(Math.min(...times) - 365 * 86_400_000);
  const to = wall(Math.max(...times) + 365 * 86_400_000);
  const rows = (await db.execute<{ player_id: string; name: string }>(sql`
    with social as (
      select s.player_id, g.center_id,
             count(*) filter (where g.start_time between ${from}::timestamp and ${to}::timestamp) as era,
             count(*) as total
      from competition_scorecard s join game g on g.id = s.game_id
      where s.player_id in (${sql.join(
        playerIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        and g.competition_id is null
      group by 1, 2
    )
    select distinct on (social.player_id) social.player_id, c.name, c.short_name
    from social join center c on c.id = social.center_id
    order by social.player_id, (social.era > 0) desc, social.era desc, social.total desc
  `)) as unknown as { player_id: string; name: string; short_name: string | null }[];
  const home = new Map([...rows].map((r) => [r.player_id, r.name]));
  const shortOf = new Map([...rows].map((r) => [r.name, r.short_name]));

  const centerOf = groups.map((g) => {
    const counts = new Map<string, number>();
    for (const p of g) {
      const h = home.get(p);
      if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] * 2 >= g.length ? top[0] : null;
  });
  const shared = new Map<string, number>();
  for (const c of centerOf) if (c) shared.set(c, (shared.get(c) ?? 0) + 1);
  const seen = new Map<string, number>();
  return centerOf.map((c, i) => {
    // A center-named team takes the center's own short code ("LTC"), which reads better than
    // one derived from a long name ("Lasertag of Carmichael" -> "LASER").
    if (!c) return { name: `Team ${groupLetter(i)}`, short: null };
    const code = shortOf.get(c) ?? null;
    if (shared.get(c) === 1) return { name: c, short: code };
    const n = seen.get(c) ?? 0;
    seen.set(c, n + 1);
    return { name: `${c} ${groupLetter(n)}`, short: code && `${code}${groupLetter(n)}` };
  });
}

/**
 * Builds teams, rosters and (per `coplay.matches`) rounds and matches for a shell event from
 * its co-play groups. Teams take negative legacy ids (-1 for group A, …) since legacy has none.
 *
 * - `pairs`: a pairing's games, in time order, make two-game matches; the nth match of a
 *   pairing goes in round n (each round is one round robin).
 * - `single`: one round, every game its own one-game match.
 * - `none`: teams and rosters only.
 */
async function planFromCoplay(db: Db, plan: Plan): Promise<void> {
  const mode = plan.cfg.coplay!.matches;
  const coplay = await coplayGroups(db, plan.games);
  const names = await coplayTeamNames(db, plan, coplay.groups);
  const used = new Set<string>();
  plan.teams = coplay.groups.map((_, i) => ({
    legacyId: -(i + 1),
    name: names[i].name,
    shortName: uniquifyShortName(names[i].short ?? deriveShortName(names[i].name), used),
  }));
  const teamOf = (gameTeamId: string) => {
    const g = coplay.sideGroup.get(gameTeamId);
    return g === undefined ? null : -(g + 1);
  };

  const gameTeamToEventTeam = new Map<string, number>();
  for (const s of coplay.sides) {
    const t = teamOf(s.gameTeamId);
    if (t === null) {
      plan.warnings.push(`Legacy game ${s.legacyGameId} ${s.side} side has no clear group.`);
      continue;
    }
    gameTeamToEventTeam.set(s.gameTeamId, t);
  }
  plan.notes.push(
    `Teams from co-play groups (${coplay.groups.length}): ` +
      plan.teams.map((t, i) => `${groupLetter(i)} = ${t.name}`).join(", ") +
      (coplay.loners.length > 0 ? `; ${coplay.loners.length} ungrouped sub(s)` : ""),
  );

  if (mode !== "none") {
    // Games with both sides in a group, by pairing, in time order.
    const byPairing = new Map<string, ModernGame[]>();
    for (const g of plan.games) {
      if (!g.sides) continue;
      const red = teamOf(g.sides.red);
      const green = teamOf(g.sides.green);
      if (red === null || green === null || red === green) {
        plan.notes.push(`Legacy game ${g.legacyGameId} has no clear pairing; competition only.`);
        continue;
      }
      const k = [red, green].sort((a, b) => a - b).join(":");
      byPairing.set(k, [...(byPairing.get(k) ?? []), g]);
    }

    type Pending = { round: number; first: Date; games: ModernGame[] };
    const pending: Pending[] = [];
    for (const games of byPairing.values()) {
      games.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const size = mode === "pairs" ? 2 : 1;
      for (let i = 0; i < games.length; i += size) {
        const chunk = games.slice(i, i + size);
        pending.push({
          round: mode === "pairs" ? i / 2 + 1 : 1,
          first: chunk[0].startTime,
          games: chunk,
        });
        if (mode === "pairs" && chunk.length === 1) {
          plan.notes.push(
            `Legacy game ${chunk[0].legacyGameId} has no partner game: a one-game match.`,
          );
        }
      }
    }

    const roundNumbers = [...new Set(pending.map((p) => p.round))].sort((a, b) => a - b);
    plan.rounds = roundNumbers.map((r) => ({
      legacyId: -r,
      name: `Round ${r}`,
      roundNumber: r,
      type: "pool" as const,
      multiplier: 1,
    }));
    let matchSeq = 0;
    for (const r of roundNumbers) {
      const inRound = pending
        .filter((p) => p.round === r)
        .sort((a, b) => a.first.getTime() - b.first.getTime());
      inRound.forEach((p, i) => {
        const matchId = -++matchSeq;
        const first = p.games[0].sides!;
        const team1 = teamOf(first.red)!;
        const team2 = teamOf(first.green)!;
        plan.matches.push({
          legacyId: matchId,
          roundLegacyId: -r,
          matchNumber: i + 1,
          team1LegacyId: team1,
          team2LegacyId: team2,
          legacyPoints: [null, null],
        });
        p.games.forEach((g, n) => {
          const team1IsRed = teamOf(g.sides!.red) === team1;
          plan.matchGames.push({
            matchLegacyId: matchId,
            legacyGameId: g.legacyGameId,
            gameNumber: n + 1,
            gameId: g.gameId,
            team1GameTeamId: team1IsRed ? g.sides!.red : g.sides!.green,
            team2GameTeamId: team1IsRed ? g.sides!.green : g.sides!.red,
          });
        });
      });
    }
  }

  await buildRoster(db, plan, gameTeamToEventTeam);
}

/**
 * Prints an event's co-play groups and how cleanly they explain its games. Read-only; a
 * shell event configured with `coplay` is built from exactly these groups.
 */
async function runCoplayReport(db: Db, plan: Plan): Promise<void> {
  const c = await coplayGroups(db, plan.games);
  const names = await coplayTeamNames(db, plan, c.groups);
  const label = (p: string) => `${c.callsign.get(p)} (${c.gamesPlayed.get(p)})`;

  console.log(`\n${"=".repeat(78)}`);
  console.log(
    `Co-play: "${plan.name}" — ${c.sides.length / 2} games, ${c.gamesPlayed.size} players`,
  );
  console.log("=".repeat(78));
  console.log(
    `  Teammates share a side in ≥${COPLAY_AFFINITY * 100}% of their games (and ≥${COPLAY_MIN_GAMES}).`,
  );
  c.groups.forEach((g, i) => {
    const sides = [...c.sideGroup.values()].filter((x) => x === i).length;
    console.log(
      `\n  Group ${groupLetter(i)} "${names[i].name}" — ${g.length} players, ${sides} sides:`,
    );
    console.log(`    ${g.map(label).join(", ")}`);
  });
  if (c.loners.length > 0) {
    console.log(`\n  Ungrouped (${c.loners.length}): ${c.loners.map(label).join(", ")}`);
  }
  const pure = c.sides.filter((s) => c.sideGroup.has(s.gameTeamId)).length;
  console.log(
    `\n  Sides ≥${COPLAY_SIDE_PURITY * 100}% one group: ${pure}/${c.sides.length} ` +
      `(${((pure / c.sides.length) * 100).toFixed(0)}%) — the higher, the more these are real teams.`,
  );
  const meetings = new Map<string, number>();
  for (const g of plan.games) {
    if (!g.sides) continue;
    const red = c.sideGroup.get(g.sides.red);
    const green = c.sideGroup.get(g.sides.green);
    const k = [red, green]
      .map((x) => (x === undefined ? "?" : groupLetter(x)))
      .sort()
      .join(" v ");
    meetings.set(k, (meetings.get(k) ?? 0) + 1);
  }
  console.log(`  Meetings (games per pairing; ? = no clear group):`);
  console.log(
    `    ${[...meetings.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k}: ${n}`)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const eventArg = argv.indexOf("--event");
  const eventId = eventArg >= 0 ? Number(argv[eventArg + 1]) : null;
  const dryRun = flag("--dry-run");
  const verbose = flag("--verbose");
  if (!dryRun && !flag("--report") && !flag("--coplay")) assertLegacyPdfMigrationOpen(argv);

  const legacy = connectLegacy();
  const db = await initDb();
  try {
    if (flag("--report")) {
      await runReport(db, legacy);
      return;
    }
    let configs: LegacyPdfEventConfig[];
    if (flag("--all")) {
      configs = LEGACY_PDF_EVENTS;
    } else if (eventId !== null) {
      const cfg = findLegacyPdfEvent(eventId);
      if (!cfg) throw new Error(`Legacy event ${eventId} is not in LEGACY_PDF_EVENTS`);
      configs = [cfg];
      if (flag("--coplay")) {
        const data = await fetchLegacyEvent(legacy, eventId);
        await runCoplayReport(db, await buildPlan(db, legacy, cfg, data));
        return;
      }
    } else {
      throw new Error("Pass --report, --event <legacy id> or --all (with --dry-run to preview)");
    }

    for (const cfg of configs) {
      const data = await fetchLegacyEvent(legacy, cfg.legacyId);
      const plan = await buildPlan(db, legacy, cfg, data);
      const verification = plan.matches.length === 0 ? null : await verifyPoints(db, plan);
      printPlan(plan, verification, verbose);
      if (!dryRun) await applyPlan(db, plan, flag("--force"));
    }
    if (dryRun) console.log(`\nDry run — nothing was written.`);
  } finally {
    await legacy.end();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
