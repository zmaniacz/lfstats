// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Migrates the legacy PDF-era SM5 games — legacy `games.tdf_key IS NULL` — into
 * `lfstats_modern` as social games.
 *
 * These games were ingested from printed PDF scorecards, so only end-of-game state
 * exists. They land in `game` (type `sm5_pdf`, tdf_filename `''`) plus the `sm5_pdf_*`
 * tables, never in `sm5_*`, so nothing that reads TDF data can pick them up. The legacy
 * event / match / league numbering is staged on `sm5_pdf_game` for a later competition
 * migration; for now every game has `competition_id = NULL`.
 *
 * Mapping rules, all established by `legacy-pdf-report` (docs/Legacy_Migration_PDF_Games.md):
 *
 *   - start_time  the PDF importer read each printed (center-local) time as US Pacific
 *                 and stored it as UTC, so the wall time is `game_datetime` rendered in
 *                 America/Los_Angeles — whatever the center's own timezone. (TDF-era
 *                 legacy games used a different path; this applies to PDF games only.)
 *                 Established from upload times (`pdf_id` is epoch ms), play hours, and
 *                 15 Brisbane games that duplicate TDF games exactly under this reading.
 *                 Wrong by an hour in DST season — fix-legacy-pdf-start-times later
 *                 rewrote start_time from the printed PDF headers
 *   - duplicates  a PDF game within 2 minutes of a TDF game at the same center is that
 *                 game, already ingested from its TDF, and is skipped
 *   - score       scorecards sum to the side score and are penalty-free; legacy `adj`
 *                 is non-rescinded penalties plus a 10000 elimination bonus
 *   - players     every scorecard gets a `player`. A legacy player with an IPL id maps
 *                 to (or creates) the modern player with that id; one without gets a
 *                 synthetic `L-<id>` player. A legacy id with two scorecards in one game
 *                 (two people merged) is split by callsign into `L-<id>-<n>` variants
 *   - hits        aggregated per (shooter, target) scorecard; a target with no scorecard
 *                 in the game, or with several, is skipped and reported
 *   - centers     see CENTER_OVERRIDES — legacy centers with no IPL id
 *
 * Usage:
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-games --dry-run          # plan + anomalies, no writes
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-games --game 1234        # one legacy game
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-games --all
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-games --report           # reconcile modern against legacy
 *   pnpm --filter @lfstats/db migrate-legacy-pdf-games --all --reset      # delete migrated PDF games, then redo
 *   add --verbose to list every anomaly rather than the first few
 *
 * Re-runs skip games already present in `sm5_pdf_game`; `--reset` deletes every sm5_pdf game
 * first (players and the legacy player map are kept and reused), and refuses once any PDF game
 * belongs to a competition. Requires `LEGACY_DATABASE_URL`
 * alongside `DATABASE_URL`; the legacy connection is read-only.
 */

import postgres from "postgres";
import { inArray, sql } from "drizzle-orm";
import { initDb } from "../client";
import { SYNTHETIC_IPL_PREFIX, syntheticIplId } from "../lib/synthetic-ipl-id";
import {
  center,
  game,
  legacyPlayerMap,
  player,
  playerCallsignHistory,
  sm5PdfGame,
  sm5PdfGamePenalty,
  sm5PdfGamePlayerInteraction,
  sm5PdfGameTeam,
  sm5PdfGameTeamPenalty,
  sm5PdfScorecard,
} from "../schema";

type Legacy = ReturnType<typeof postgres>;
type Db = Awaited<ReturnType<typeof initDb>>;

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
// Configuration
// ---------------------------------------------------------------------------

/**
 * Legacy centers with no IPL id, mapped to a modern `country-site` code. Decided with
 * the site owner, 2026-10-17: two are aliases of a live center, the Armageddon events
 * were played at Syracuse, and closed centers take a `-999` site code.
 */
const CENTER_OVERRIDES: Record<number, string> = {
  1: "4-3", // Lasertag of Carmichael (Legacy)
  3: "4-23", // Armageddon 2014 — an event, played at Syracuse
  9: "4-23", // Armageddon 2015 — an event, played at Syracuse
  11: "4-999", // Lasertag of Santa Rosa — closed
  12: "4-6", // Laser Tag of Clinton Township — Detroit
  13: "4-43", // Invasion Laser Tag - San Marcos
  19: "4-6", // Detroit Training
  21: "7-999", // LaserZone Yorkshire — closed
};

/** Modern centers to create when absent. Every other code must already exist. */
const CREATE_CENTERS: Record<string, string> = {
  "4-43": "Invasion Laser Tag - San Marcos",
  "4-999": "Lasertag of Santa Rosa",
  "7-999": "LaserZone Yorkshire",
};

const POSITIONS: Record<string, number> = {
  Commander: 1,
  "Heavy Weapons": 2,
  Scout: 3,
  "Ammo Carrier": 4,
  Medic: 5,
};

const SIDES = {
  red: { name: "Red Team", colourEnum: 1 },
  green: { name: "Green Team", colourEnum: 2 },
} as const;
type Side = keyof typeof SIDES;

const ELIMINATION_BONUS = 10000;

// ---------------------------------------------------------------------------
// Legacy rows
// ---------------------------------------------------------------------------

type LegacyGame = {
  id: number;
  center_id: number;
  ipl_id: string | null;
  start: string; // 'YYYY-MM-DD HH24:MI:SS', center-local wall time
  game_name: string;
  game_description: string;
  game_length: number | null;
  red_score: number | null;
  green_score: number | null;
  red_adj: number;
  green_adj: number;
  winner: string | null;
  red_eliminated: number;
  green_eliminated: number;
  type: string;
  league_round: number | null;
  league_match: number | null;
  league_game: number | null;
  pdf_id: string | null;
  event_id: number | null;
  match_id: number | null;
};

type LegacyScorecard = {
  id: number;
  game_id: number;
  player_id: number;
  player_name: string;
  team: string;
  position: string;
  survived: number | null;
  is_sub: boolean;
  shots_hit: number;
  shots_fired: number;
  times_zapped: number;
  times_missiled: number;
  missile_hits: number;
  nukes_activated: number;
  nukes_detonated: number;
  nukes_canceled: number;
  medic_hits: number;
  own_medic_hits: number;
  medic_nukes: number;
  scout_rapid: number;
  life_boost: number;
  ammo_boost: number;
  lives_left: number;
  score: number;
  max_score: number | null;
  shots_left: number;
  penalty_count: number;
  shot_3hit: number;
  elim_other_team: number;
  team_elim: number;
  own_nuke_cancels: number;
  shot_opponent: number;
  shot_team: number;
  missiled_opponent: number;
  missiled_team: number;
  resupplies: number;
  rank: number;
  bases_destroyed: number;
  accuracy: number;
  hit_diff: number;
  mvp_points: number;
  mvp_details: unknown;
  sp_earned: number;
  sp_spent: number;
};

type LegacyHit = {
  scorecard_id: number;
  target_id: number;
  hits: number;
  missiles: number;
};

type LegacyPenalty = {
  scorecard_id: number;
  type: string;
  description: string | null;
  value: number;
  mvp_value: number;
  in_game: number;
  rescinded: number;
};

type LegacyTeamPenalty = {
  game_id: number;
  team_color: string;
  type: string;
  description: string | null;
  value: number;
};

type LegacyData = {
  games: LegacyGame[];
  scorecards: LegacyScorecard[];
  hits: LegacyHit[];
  penalties: LegacyPenalty[];
  teamPenalties: LegacyTeamPenalty[];
  playerIpl: Map<number, string | null>;
};

async function loadLegacy(legacy: Legacy, onlyGame: number | null): Promise<LegacyData> {
  // Games with no scorecards are placeholders ("Fake1", "Dummy Game") — nothing to migrate.
  const gameFilter = onlyGame === null ? legacy`` : legacy`and g.id = ${onlyGame}`;
  const games = await legacy<LegacyGame[]>`
    select g.id::int, g.center_id::int, nullif(trim(c.ipl_id), '') as ipl_id,
           to_char(g.game_datetime at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI:SS') as start,
           g.game_name, g.game_description, g.game_length,
           g.red_score, g.green_score, g.red_adj, g.green_adj, g.winner,
           g.red_eliminated::int, g.green_eliminated::int, g.type,
           g.league_round::int, g.league_match::int, g.league_game::int,
           g.pdf_id::text, g.event_id::int, g.match_id::int
    from games g join centers c on c.id = g.center_id
    where g.tdf_key is null ${gameFilter}
      and exists (select 1 from scorecards s where s.game_id = g.id)
    order by g.game_datetime, g.id`;
  const ids = games.map((g) => g.id);
  if (ids.length === 0) {
    return {
      games,
      scorecards: [],
      hits: [],
      penalties: [],
      teamPenalties: [],
      playerIpl: new Map(),
    };
  }

  const scorecards = await legacy<LegacyScorecard[]>`
    select s.id::int, s.game_id::int, s.player_id::int, s.player_name, s.team, s.position,
           s.survived, s.is_sub, s.shots_hit, s.shots_fired, s.times_zapped, s.times_missiled,
           s.missile_hits, s.nukes_activated, s.nukes_detonated, s.nukes_canceled,
           s.medic_hits, s.own_medic_hits, s.medic_nukes, s.scout_rapid, s.life_boost,
           s.ammo_boost, s.lives_left, s.score, s.max_score, s.shots_left, s.penalty_count,
           s.shot_3hit, s.elim_other_team::int, s.team_elim::int, s.own_nuke_cancels,
           s.shot_opponent, s.shot_team, s.missiled_opponent, s.missiled_team, s.resupplies,
           s.rank, s.bases_destroyed, s.accuracy::float8, s.hit_diff::float8,
           s.mvp_points::float8, s.mvp_details, s.sp_earned, s.sp_spent
    from scorecards s where s.game_id in ${legacy(ids)}
    order by s.game_id, s.id`;

  const hits = await legacy<LegacyHit[]>`
    select h.scorecard_id::int, h.target_id::int, h.hits, h.missiles
    from hits h join scorecards s on s.id = h.scorecard_id
    where s.game_id in ${legacy(ids)}`;

  const penalties = await legacy<LegacyPenalty[]>`
    select p.scorecard_id::int, p.type, p.description, p.value, p.mvp_value::float8,
           p.in_game::int, p.rescinded::int
    from penalties p join scorecards s on s.id = p.scorecard_id
    where s.game_id in ${legacy(ids)}
    order by p.id`;

  const teamPenalties = await legacy<LegacyTeamPenalty[]>`
    select game_id::int, lower(team_color) as team_color, type, description, value
    from team_penalties where game_id in ${legacy(ids)}
    order by id`;

  const playerIds = [...new Set(scorecards.map((s) => s.player_id))];
  const players = await legacy<{ id: number; ipl_id: string | null }[]>`
    select id::int, nullif(trim(ipl_id), '') as ipl_id from players where id in ${legacy(playerIds)}`;

  return {
    games,
    scorecards,
    hits,
    penalties,
    teamPenalties,
    playerIpl: new Map(players.map((p) => [p.id, p.ipl_id])),
  };
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** One modern player, identified by legacy player id plus split variant. */
type Identity = {
  key: string;
  legacyPlayerId: number;
  variant: number;
  iplId: string;
  synthetic: boolean;
  /** callsign → first / last start_time seen */
  callsigns: Map<string, { first: string; last: string }>;
  currentCallsign: string;
  currentAt: string;
  firstSeen: string;
};

type PlannedTeam = {
  side: Side;
  score: number;
  eliminationBonus: number;
  penaltyScore: number;
  eliminated: boolean;
  total: number;
};

type PlannedGame = {
  legacy: LegacyGame;
  centerCode: string;
  scheduledMs: number;
  actualMs: number;
  outcome: "score" | "elimination" | "draw";
  teams: Record<Side, PlannedTeam>;
  winner: Side | "draw";
  scorecards: { row: LegacyScorecard; side: Side; identity: string; position: number }[];
  /** keyed `${shooterLegacyScorecardId}:${targetLegacyScorecardId}` */
  interactions: Map<string, { shooter: number; target: number; hits: number; missiles: number }>;
  penalties: LegacyPenalty[];
  teamPenalties: (LegacyTeamPenalty & { side: Side })[];
};

type Anomaly = { kind: string; legacyGameId: number | null; detail: string };

type Plan = {
  games: PlannedGame[];
  identities: Map<string, Identity>;
  anomalies: Anomaly[];
  skippedGames: number;
  alreadyMigrated: number;
};

function identityKey(legacyPlayerId: number, variant: number): string {
  return `${legacyPlayerId}:${variant}`;
}

/** Start times (epoch seconds of the wall time) of existing non-PDF games, per center code. */
type Occupied = Map<string, number[]>;

const DUPLICATE_WINDOW_SECONDS = 120;

function wallSeconds(start: string): number {
  return Date.parse(`${start.replace(" ", "T")}Z`) / 1000;
}

function buildPlan(
  data: LegacyData,
  modernCenters: Set<string>,
  occupied: Occupied,
  migrated: Set<number>,
): Plan {
  const anomalies: Anomaly[] = [];
  const note = (kind: string, legacyGameId: number | null, detail: string) =>
    anomalies.push({ kind, legacyGameId, detail });

  const scorecardsByGame = groupBy(data.scorecards, (s) => s.game_id);
  const penaltiesBySc = groupBy(data.penalties, (p) => p.scorecard_id);
  const teamPenaltiesByGame = groupBy(data.teamPenalties, (p) => p.game_id);
  const hitsBySc = groupBy(data.hits, (h) => h.scorecard_id);

  // Each legacy player's usual callsign, to decide which scorecard keeps the real
  // identity when one legacy id appears twice in a game.
  const callsignCounts = new Map<number, Map<string, number>>();
  for (const s of data.scorecards) {
    const m = callsignCounts.get(s.player_id) ?? new Map<string, number>();
    m.set(s.player_name, (m.get(s.player_name) ?? 0) + 1);
    callsignCounts.set(s.player_id, m);
  }
  const usualCallsign = (pid: number) =>
    [...(callsignCounts.get(pid) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];
  // Stable variant numbers per (player, off-callsign) across games.
  const variants = new Map<string, number>();
  const variantFor = (pid: number, callsign: string): number => {
    const k = `${pid}:${callsign}`;
    let v = variants.get(k);
    if (v === undefined) {
      v = [...variants.keys()].filter((key) => key.startsWith(`${pid}:`)).length + 1;
      variants.set(k, v);
    }
    return v;
  };

  const identities = new Map<string, Identity>();
  const touch = (pid: number, variant: number, callsign: string, at: string) => {
    const key = identityKey(pid, variant);
    let id = identities.get(key);
    if (!id) {
      const real = variant === 0 ? data.playerIpl.get(pid) : null;
      id = {
        key,
        legacyPlayerId: pid,
        variant,
        iplId: real ?? syntheticIplId(pid, variant),
        synthetic: !real,
        callsigns: new Map(),
        currentCallsign: callsign,
        currentAt: at,
        firstSeen: at,
      };
      identities.set(key, id);
    }
    const c = id.callsigns.get(callsign);
    if (!c) id.callsigns.set(callsign, { first: at, last: at });
    else {
      if (at < c.first) c.first = at;
      if (at > c.last) c.last = at;
    }
    if (at >= id.currentAt) {
      id.currentAt = at;
      id.currentCallsign = callsign;
    }
    if (at < id.firstSeen) id.firstSeen = at;
    return key;
  };

  const games: PlannedGame[] = [];
  let skippedGames = 0;
  let alreadyMigrated = 0;
  const planned = new Set<string>();

  for (const g of data.games) {
    if (migrated.has(g.id)) {
      alreadyMigrated++;
      continue;
    }
    const centerCode = CENTER_OVERRIDES[g.center_id] ?? g.ipl_id;
    if (!centerCode || (!modernCenters.has(centerCode) && !CREATE_CENTERS[centerCode])) {
      note("no-center", g.id, `legacy center ${g.center_id} (${g.ipl_id ?? "no ipl_id"})`);
      skippedGames++;
      continue;
    }
    // PDF times are often only minute-precise, so a TDF game within a couple of minutes
    // at the same center is the same game.
    const t = wallSeconds(g.start);
    const near = (occupied.get(centerCode) ?? []).find(
      (o) => Math.abs(o - t) <= DUPLICATE_WINDOW_SECONDS,
    );
    if (near !== undefined) {
      note(
        "duplicate-of-tdf-game",
        g.id,
        `${centerCode} ${g.start} — a TDF game starts within ${Math.abs(near - t)}s`,
      );
      skippedGames++;
      continue;
    }
    const slot = `${centerCode}|${g.start}`;
    if (planned.has(slot)) {
      note(
        "start-time-collision",
        g.id,
        `${centerCode} ${g.start} is taken by another legacy game`,
      );
      skippedGames++;
      continue;
    }
    planned.add(slot);

    // Scorecards and player identities
    const rows = scorecardsByGame.get(g.id) ?? [];
    const perPlayer = groupBy(rows, (s) => s.player_id);
    const scorecards: PlannedGame["scorecards"] = [];
    // A scorecard with no usable team goes to the side whose scorecards fall short of
    // the legacy side score by exactly its score; otherwise it is dropped.
    const shortfall = (side: Side) => {
      const legacyScore = side === "red" ? g.red_score : g.green_score;
      const sum = rows
        .filter((r) => r.team.toLowerCase() === side)
        .reduce((n, r) => n + r.score, 0);
      return legacyScore === null ? null : legacyScore - sum;
    };
    for (const s of rows) {
      const raw = s.team.toLowerCase();
      let side: Side;
      if (raw === "red" || raw === "green") side = raw;
      else {
        const fits = (["red", "green"] as const).filter((sd) => shortfall(sd) === s.score);
        if (fits.length !== 1) {
          note("bad-team", g.id, `scorecard ${s.id} (${s.player_name}) team "${s.team}" — skipped`);
          continue;
        }
        side = fits[0]!;
        note(
          "team-inferred",
          g.id,
          `scorecard ${s.id} (${s.player_name}) team "${s.team}" → ${side}`,
        );
      }
      const position = POSITIONS[s.position];
      if (!position) {
        note("bad-position", g.id, `scorecard ${s.id} position "${s.position}" — skipped`);
        continue;
      }
      let variant = 0;
      if (
        (perPlayer.get(s.player_id)?.length ?? 0) > 1 &&
        s.player_name !== usualCallsign(s.player_id)
      ) {
        variant = variantFor(s.player_id, s.player_name);
        note(
          "player-split",
          g.id,
          `legacy player ${s.player_id} "${s.player_name}" → variant ${variant}`,
        );
      }
      scorecards.push({
        row: s,
        side,
        position,
        identity: touch(s.player_id, variant, s.player_name, g.start),
      });
    }
    const kept = new Set(scorecards.map((s) => s.row.id));

    // Hits: target resolved by the target's legacy player id within this game.
    const byPlayer = groupBy(scorecards, (s) => s.row.player_id);
    const interactions: PlannedGame["interactions"] = new Map();
    for (const s of scorecards) {
      for (const h of hitsBySc.get(s.row.id) ?? []) {
        if (h.hits === 0 && h.missiles === 0) continue;
        const targets = byPlayer.get(h.target_id) ?? [];
        if (targets.length !== 1) {
          note(
            targets.length === 0 ? "hit-no-target" : "hit-ambiguous-target",
            g.id,
            `${s.row.player_name} → legacy player ${h.target_id}: ${h.hits} hits, ${h.missiles} missiles`,
          );
          continue;
        }
        const target = targets[0]!.row.id;
        const k = `${s.row.id}:${target}`;
        const cur = interactions.get(k) ?? { shooter: s.row.id, target, hits: 0, missiles: 0 };
        cur.hits += h.hits;
        cur.missiles += h.missiles;
        interactions.set(k, cur);
      }
    }

    // Penalties
    const penalties = rows.flatMap((s) => (kept.has(s.id) ? (penaltiesBySc.get(s.id) ?? []) : []));
    const teamPenalties: PlannedGame["teamPenalties"] = [];
    for (const tp of teamPenaltiesByGame.get(g.id) ?? []) {
      if (tp.team_color !== "red" && tp.team_color !== "green") {
        note("bad-team-penalty", g.id, `team penalty on "${tp.team_color}" — skipped`);
        continue;
      }
      teamPenalties.push({ ...tp, side: tp.team_color });
    }

    // Teams and result
    const sideOf = new Map(scorecards.map((s) => [s.row.id, s.side]));
    const teams = {} as Record<Side, PlannedTeam>;
    for (const side of ["red", "green"] as const) {
      const other: Side = side === "red" ? "green" : "red";
      const eliminated = (side === "red" ? g.red_eliminated : g.green_eliminated) === 1;
      const otherEliminated = (other === "red" ? g.red_eliminated : g.green_eliminated) === 1;
      const score = scorecards.filter((s) => s.side === side).reduce((n, s) => n + s.row.score, 0);
      const penaltyScore =
        penalties
          .filter((p) => p.rescinded === 0 && sideOf.get(p.scorecard_id) === side)
          .reduce((n, p) => n + p.value, 0) +
        teamPenalties.filter((p) => p.side === side).reduce((n, p) => n + p.value, 0);
      const eliminationBonus = otherEliminated ? ELIMINATION_BONUS : 0;
      teams[side] = {
        side,
        score,
        eliminationBonus,
        penaltyScore,
        eliminated,
        total: score + eliminationBonus + penaltyScore,
      };

      const legacyScore = side === "red" ? g.red_score : g.green_score;
      const legacyAdj = side === "red" ? g.red_adj : g.green_adj;
      if (legacyScore !== null && score !== legacyScore) {
        note("score-mismatch", g.id, `${side}: scorecards sum ${score}, legacy ${legacyScore}`);
      }
      if (legacyScore !== null && teams[side].total !== legacyScore + legacyAdj) {
        note(
          "total-mismatch",
          g.id,
          `${side}: modern ${teams[side].total} (score ${score} + bonus ${eliminationBonus} + penalties ${penaltyScore}), legacy ${legacyScore} + adj ${legacyAdj}`,
        );
      }
    }
    const winner: Side | "draw" =
      teams.red.total === teams.green.total
        ? "draw"
        : teams.red.total > teams.green.total
          ? "red"
          : "green";
    if (g.winner && winner !== g.winner) {
      note("winner-mismatch", g.id, `modern ${winner}, legacy ${g.winner}`);
    }
    const outcome =
      g.red_eliminated === 1 || g.green_eliminated === 1
        ? "elimination"
        : winner === "draw"
          ? "draw"
          : "score";

    // Durations: legacy game_length is seconds, often null. A full-game survivor's
    // `survived` is the scheduled length.
    const survivedMax = Math.max(0, ...rows.map((s) => s.survived ?? 0)) || null;
    const scheduledMs = (survivedMax ?? g.game_length ?? 900) * 1000;
    const actualMs = (g.game_length ?? survivedMax ?? 900) * 1000;

    games.push({
      legacy: g,
      centerCode,
      scheduledMs,
      actualMs,
      outcome,
      teams,
      winner,
      scorecards,
      interactions,
      penalties,
      teamPenalties,
    });
  }

  return { games, identities, anomalies, skippedGames, alreadyMigrated };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

async function ensureCenters(db: Db, plan: Plan, modern: Map<string, string>): Promise<void> {
  const needed = new Set(plan.games.map((g) => g.centerCode));
  for (const code of needed) {
    if (modern.has(code)) continue;
    const name = CREATE_CENTERS[code]!;
    const [countryCode, siteCode] = code.split("-").map(Number) as [number, number];
    const [row] = await db
      .insert(center)
      .values({ countryCode, siteCode, name })
      .returning({ id: center.id });
    modern.set(code, row!.id);
    console.log(`Created center ${code} "${name}"`);
  }
}

/** Resolves every identity to a modern player id, creating players as needed. */
async function ensurePlayers(db: Db, plan: Plan): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const identities = [...plan.identities.values()];

  const mapped = await db
    .select({
      legacyPlayerId: legacyPlayerMap.legacyPlayerId,
      legacyVariant: legacyPlayerMap.legacyVariant,
      playerId: legacyPlayerMap.playerId,
    })
    .from(legacyPlayerMap);
  for (const m of mapped) resolved.set(identityKey(m.legacyPlayerId, m.legacyVariant), m.playerId);

  const pending = identities.filter((i) => !resolved.has(i.key));
  let created = 0;
  let linked = 0;
  for (const batch of chunks(pending, 500)) {
    const existing = await db
      .select({ id: player.id, iplId: player.iplId })
      .from(player)
      .where(
        inArray(
          player.iplId,
          batch.map((i) => i.iplId),
        ),
      );
    const byIpl = new Map(existing.map((p) => [p.iplId, p.id]));
    const toCreate = batch.filter((i) => !byIpl.has(i.iplId));
    if (toCreate.length) {
      const rows = await db
        .insert(player)
        .values(
          toCreate.map((i) => ({
            iplId: i.iplId,
            currentCallsign: i.currentCallsign,
            firstSeenAt: new Date(`${i.firstSeen}Z`),
          })),
        )
        .returning({ id: player.id, iplId: player.iplId });
      for (const r of rows) byIpl.set(r.iplId, r.id);
      created += rows.length;
    }
    linked += batch.length - toCreate.length;
    await db.insert(legacyPlayerMap).values(
      batch.map((i) => ({
        legacyPlayerId: i.legacyPlayerId,
        legacyVariant: i.variant,
        playerId: byIpl.get(i.iplId)!,
        synthetic: i.synthetic,
      })),
    );
    for (const i of batch) resolved.set(i.key, byIpl.get(i.iplId)!);
  }

  // Callsign history for every identity — existing modern players only gain rows, and
  // their first_seen_at can only move earlier. current_callsign is left alone.
  const history = identities.flatMap((i) =>
    [...i.callsigns].map(([callsign, c]) => ({
      playerId: resolved.get(i.key)!,
      callsign,
      firstSeenAt: new Date(`${c.first}Z`),
      lastSeenAt: new Date(`${c.last}Z`),
    })),
  );
  const syntheticOwner = sql`exists (select 1 from ${legacyPlayerMap}
    where ${legacyPlayerMap.playerId} = ${playerCallsignHistory.playerId} and ${legacyPlayerMap.synthetic})`;
  for (const batch of chunks(history, 1000)) {
    await db
      .insert(playerCallsignHistory)
      .values(batch)
      .onConflictDoUpdate({
        target: [playerCallsignHistory.playerId, playerCallsignHistory.callsign],
        // A synthetic player's history comes only from this migration, so a re-run
        // overwrites it; a real player's only widens.
        set: {
          firstSeenAt: sql`case when ${syntheticOwner} then excluded.first_seen_at
            else least(${playerCallsignHistory.firstSeenAt}, excluded.first_seen_at) end`,
          lastSeenAt: sql`case when ${syntheticOwner} then excluded.last_seen_at
            else greatest(${playerCallsignHistory.lastSeenAt}, excluded.last_seen_at) end`,
        },
      });
  }
  for (const batch of chunks(identities, 500)) {
    await db.execute(sql`
      update player p set first_seen_at = v.first_seen
      from (values ${sql.join(
        batch.map((i) => sql`(${resolved.get(i.key)!}::uuid, ${i.firstSeen}::timestamp)`),
        sql`, `,
      )}) as v(id, first_seen)
      where p.id = v.id and (v.first_seen < p.first_seen_at or p.ipl_id like ${`${SYNTHETIC_IPL_PREFIX}%`})`);
  }

  console.log(
    `Players: ${created} created, ${linked} linked to existing, ${mapped.length} already mapped.`,
  );
  return resolved;
}

async function applyGame(
  db: Db,
  g: PlannedGame,
  centerId: string,
  players: Map<string, string>,
): Promise<void> {
  // Local wall time; the Z only stops the driver applying the machine's timezone.
  const startTime = new Date(`${g.legacy.start.replace(" ", "T")}Z`);
  await db.transaction(async (tx) => {
    const [gameRow] = await tx
      .insert(game)
      .values({
        centerId,
        competitionId: null,
        startTime,
        tdfFilename: "",
        outcome: g.outcome,
        scheduledDuration: g.scheduledMs,
        actualDuration: g.actualMs,
        type: "sm5_pdf",
        description: g.legacy.game_description.trim() || null,
      })
      .returning({ id: game.id });
    const gameId = gameRow!.id;

    await tx.insert(sm5PdfGame).values({
      gameId,
      legacyGameId: g.legacy.id,
      pdfId: g.legacy.pdf_id,
      gameName: g.legacy.game_name || null,
      legacyEventId: g.legacy.event_id,
      legacyMatchId: g.legacy.match_id,
      legacyType: g.legacy.type,
      leagueRound: g.legacy.league_round,
      leagueMatch: g.legacy.league_match,
      leagueGame: g.legacy.league_game,
      legacyWinner: g.legacy.winner,
    });

    const teamIds = {} as Record<Side, string>;
    for (const side of ["red", "green"] as const) {
      const t = g.teams[side];
      const other = g.teams[side === "red" ? "green" : "red"];
      const [row] = await tx
        .insert(sm5PdfGameTeam)
        .values({
          gameId,
          side,
          name: SIDES[side].name,
          colourEnum: SIDES[side].colourEnum,
          score: t.score,
          eliminationBonus: t.eliminationBonus,
          penaltyScore: t.penaltyScore,
          result: t.total === other.total ? "draw" : t.total > other.total ? "win" : "loss",
          eliminated: t.eliminated,
        })
        .returning({ id: sm5PdfGameTeam.id });
      teamIds[side] = row!.id;
    }

    const scRows = await tx
      .insert(sm5PdfScorecard)
      .values(g.scorecards.map((s) => scorecardValues(s, gameId, teamIds[s.side], players)))
      .returning({ id: sm5PdfScorecard.id, legacyId: sm5PdfScorecard.legacyScorecardId });
    const scId = new Map(scRows.map((r) => [r.legacyId, r.id]));

    if (g.interactions.size) {
      await tx.insert(sm5PdfGamePlayerInteraction).values(
        [...g.interactions.values()].map((i) => ({
          gameId,
          scorecardId: scId.get(i.shooter)!,
          targetScorecardId: scId.get(i.target)!,
          shotsHit: i.hits,
          missileHits: i.missiles,
        })),
      );
    }
    if (g.penalties.length) {
      await tx.insert(sm5PdfGamePenalty).values(
        g.penalties.map((p) => ({
          gameId,
          scorecardId: scId.get(p.scorecard_id)!,
          scoreValue: p.value,
          description: p.description?.trim() || p.type,
          type: p.type,
          mvpValue: p.mvp_value,
          inGame: p.in_game === 1,
          rescinded: p.rescinded === 1,
        })),
      );
    }
    if (g.teamPenalties.length) {
      await tx.insert(sm5PdfGameTeamPenalty).values(
        g.teamPenalties.map((p) => ({
          gameId,
          gameTeamId: teamIds[p.side],
          scoreValue: p.value,
          description: p.description?.trim() || p.type,
          type: p.type,
        })),
      );
    }
  });
}

function scorecardValues(
  s: PlannedGame["scorecards"][number],
  gameId: string,
  teamId: string,
  players: Map<string, string>,
): typeof sm5PdfScorecard.$inferInsert {
  const r = s.row;
  const only = (position: number, value: number) => (s.position === position ? value : null);
  return {
    gameId,
    teamId,
    playerId: players.get(s.identity)!,
    legacyScorecardId: r.id,
    callsign: r.player_name,
    position: s.position,
    isSub: r.is_sub,
    eliminated: r.lives_left === 0,
    survived: r.survived,
    shotsFired: r.shots_fired,
    shotsHit: r.shots_hit,
    shotsHitOpponent: r.shot_opponent,
    shotsHitTeam: r.shot_team,
    shotsHitOpponent3hit: r.shot_3hit,
    timesHit: r.times_zapped,
    missileHits: r.missile_hits,
    missilesHitOpponent: r.missiled_opponent,
    missilesHitTeam: r.missiled_team,
    timesHitByMissile: r.times_missiled,
    medicHits: r.medic_hits,
    ownMedicHits: r.own_medic_hits,
    nukesCanceled: r.nukes_canceled,
    teamNukesCanceled: r.own_nuke_cancels,
    resupplies: r.resupplies,
    elimOtherTeam: r.elim_other_team === 1,
    teamElim: r.team_elim === 1,
    nukesActivated: only(1, r.nukes_activated),
    nukesDetonated: only(1, r.nukes_detonated),
    nukesHitMedic: only(1, r.medic_nukes),
    rapidFire: only(3, r.scout_rapid),
    ammoBoost: only(4, r.ammo_boost),
    lifeBoost: only(5, r.life_boost),
    spEarned: s.position === 2 ? null : r.sp_earned,
    spSpent: s.position === 2 ? null : r.sp_spent,
    targetsDestroyed: r.bases_destroyed,
    penalties: r.penalty_count,
    livesLeft: r.lives_left,
    shotsLeft: r.shots_left,
    score: r.score,
    maxScore: r.max_score,
    rank: r.rank,
    accuracy: r.accuracy,
    hitDiff: r.hit_diff,
    legacyMvpPoints: r.mvp_points,
    legacyMvpDetails: r.mvp_details ?? null,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printPlan(plan: Plan, verbose: boolean): void {
  const ids = [...plan.identities.values()];
  const count = (f: (g: PlannedGame) => number) => plan.games.reduce((n, g) => n + f(g), 0);
  console.log("\nPlan:");
  console.table([
    {
      games: plan.games.length,
      skipped: plan.skippedGames,
      alreadyMigrated: plan.alreadyMigrated,
      scorecards: count((g) => g.scorecards.length),
      interactions: count((g) => g.interactions.size),
      penalties: count((g) => g.penalties.length),
      teamPenalties: count((g) => g.teamPenalties.length),
    },
  ]);
  console.table([
    {
      identities: ids.length,
      realIplId: ids.filter((i) => !i.synthetic).length,
      synthetic: ids.filter((i) => i.synthetic).length,
      splitVariants: ids.filter((i) => i.variant > 0).length,
    },
  ]);
  const byCenter = groupBy(plan.games, (g) => g.centerCode);
  console.table(
    [...byCenter].map(([code, gs]) => ({
      center: code,
      games: gs.length,
      first: gs[0]!.legacy.start.slice(0, 10),
      last: gs[gs.length - 1]!.legacy.start.slice(0, 10),
    })),
  );

  const byKind = groupBy(plan.anomalies, (a) => a.kind);
  console.log("\nAnomalies:");
  console.table([...byKind].map(([kind, list]) => ({ kind, count: list.length })));
  for (const [kind, list] of byKind) {
    console.log(`\n${kind}:`);
    for (const a of verbose ? list : list.slice(0, 8)) {
      console.log(`  legacy game ${a.legacyGameId ?? "-"}: ${a.detail}`);
    }
    if (!verbose && list.length > 8) console.log(`  … ${list.length - 8} more (--verbose)`);
  }
}

/** Reconciles what is in modern against the full legacy plan. */
async function report(db: Db): Promise<void> {
  const [modern] = await db.execute<{
    games: number;
    scorecards: number;
    interactions: number;
    penalties: number;
    team_penalties: number;
    players_mapped: number;
    synthetic: number;
  }>(sql`
    select (select count(*)::int from sm5_pdf_game) as games,
           (select count(*)::int from sm5_pdf_scorecard) as scorecards,
           (select count(*)::int from sm5_pdf_game_player_interaction) as interactions,
           (select count(*)::int from sm5_pdf_game_penalty) as penalties,
           (select count(*)::int from sm5_pdf_game_team_penalty) as team_penalties,
           (select count(*)::int from legacy_player_map) as players_mapped,
           (select count(*)::int from legacy_player_map where synthetic) as synthetic`);
  console.log("\nIn modern:");
  console.table([modern]);

  const [leak] = await db.execute<{ sm5_rows: number; non_social: number }>(sql`
    select (select count(*)::int from sm5_scorecard s join game g on g.id = s.game_id
              where g.type = 'sm5_pdf') as sm5_rows,
           (select count(*)::int from game where type = 'sm5_pdf' and competition_id is not null)
             as non_social`);
  console.log("Isolation (both must be 0):");
  console.table([leak]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.includes(name);
  const gameArg = argv.indexOf("--game");
  const onlyGame = gameArg >= 0 ? Number(argv[gameArg + 1]) : null;
  const dryRun = flag("--dry-run");
  const reportOnly = flag("--report");
  const verbose = flag("--verbose");
  const reset = flag("--reset");
  if (reset && !flag("--all") && !dryRun) {
    console.error("--reset only goes with --all (or --dry-run, to preview).");
    process.exit(1);
  }
  if (!dryRun && !reportOnly && !flag("--all") && onlyGame === null) {
    console.error("Pass one of --dry-run, --report, --all or --game <legacy id>.");
    process.exit(1);
  }
  if (onlyGame !== null && !Number.isInteger(onlyGame)) {
    console.error("--game takes a legacy game id.");
    process.exit(1);
  }

  const db = await initDb();
  const legacy = connectLegacy();
  try {
    console.log("Loading legacy PDF-era games…");
    const data = await loadLegacy(legacy, onlyGame);
    console.log(
      `${data.games.length} games, ${data.scorecards.length} scorecards, ${data.hits.length} hit rows, ` +
        `${data.penalties.length} penalties, ${data.teamPenalties.length} team penalties.`,
    );

    const centers = await db
      .select({
        id: center.id,
        code: sql<string>`${center.countryCode} || '-' || ${center.siteCode}`,
      })
      .from(center);
    const modernCenters = new Map(centers.map((c) => [c.code, c.id]));
    // A dry run may precede the schema migration that creates the sm5_pdf tables.
    const [{ ready }] = await db.execute<{ ready: boolean }>(
      sql`select to_regclass('public.sm5_pdf_game') is not null as ready`,
    );
    if (!ready && !dryRun) {
      throw new Error("sm5_pdf tables are missing — run pnpm db:migrate first.");
    }
    if (reset && !dryRun) {
      // Deleting a game cascades to its competition_match_game row, so a reset would silently
      // drop every competition's PDF match assignments along with the games.
      const [{ n: inCompetitions }] = await db.execute<{ n: number }>(
        sql`select count(*)::int as n from game where type = 'sm5_pdf' and competition_id is not null`,
      );
      if (inCompetitions > 0) {
        throw new Error(
          `--reset refused: ${inCompetitions} PDF games belong to competitions, and deleting them ` +
            `would drop those competitions' match assignments. See docs/Legacy_Migration_PDF_Events.md.`,
        );
      }
      const deleted = await db.execute<{ n: number }>(
        sql`with d as (delete from game where type = 'sm5_pdf' returning 1) select count(*)::int as n from d`,
      );
      console.log(`Reset: deleted ${deleted[0]?.n ?? 0} previously migrated PDF games.`);
    }
    const occupiedRows = await db.execute<{ code: string; start: string }>(sql`
      select c.country_code || '-' || c.site_code as code,
             to_char(g.start_time, 'YYYY-MM-DD HH24:MI:SS') as start
      from game g join center c on c.id = g.center_id
      where g.type <> 'sm5_pdf'`);
    const occupied: Occupied = new Map();
    for (const r of occupiedRows) {
      const list = occupied.get(r.code) ?? [];
      list.push(wallSeconds(r.start));
      occupied.set(r.code, list);
    }
    const migratedRows =
      ready && !reset ? await db.select({ id: sm5PdfGame.legacyGameId }).from(sm5PdfGame) : [];

    const plan = buildPlan(
      data,
      new Set(modernCenters.keys()),
      occupied,
      new Set(migratedRows.map((r) => r.id)),
    );
    printPlan(plan, verbose);

    if (reportOnly) {
      await report(db);
      return;
    }
    if (dryRun) {
      console.log("\nDry run — nothing written.");
      return;
    }

    await ensureCenters(db, plan, modernCenters);
    const players = await ensurePlayers(db, plan);
    let done = 0;
    for (const g of plan.games) {
      await applyGame(db, g, modernCenters.get(g.centerCode)!, players);
      if (++done % 250 === 0) console.log(`  ${done} / ${plan.games.length} games`);
    }
    console.log(`Migrated ${done} games.`);
    await report(db);
  } finally {
    await legacy.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
