// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, desc, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { parseGameSlug } from "../../lib/game-slug";
import { getTdfArchiveUrl } from "../../lib/tdf";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  competitionTeam,
  game,
  lbGameTeam,
  lbMatchGame,
  lbScorecard,
  sm5GamePenalty,
  sm5GameTeam,
  sm5GameTeamPenalty,
  sm5Scorecard,
  sm5ScorecardMvp,
} from "../../schema";
import {
  POSITIONS,
  SEARCH_GAMES_FIELDS,
  SEARCH_GAMES_LIMITS,
  type GameDetailRequest,
  type GameType,
  type SearchGamesRequest,
} from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import { centerSlugSql, dataAsOf, gameSlugSql, localTimestampSql, scopedMeta } from "./meta";
import { getAnalyticsDb } from "./pool";
import { identifyPlayers, type IdentifiedPlayer } from "./resolve";
import {
  normalizeScope,
  resolveScope,
  scopeGameConditions,
  scopeScorecardConditions,
  sourceFor,
  type ScorecardSource,
  type ResolvedScope,
} from "./scope";

// POST /search_games and GET /games/{slug} (docs/Query_API_Spec.md), for SM5 and Laserball.

export function siteUrl(): string {
  return process.env.LFSTATS_SITE_URL ?? "https://lfstats.com";
}

export function gameWebUrl(slug: string, gameType: GameType = "sm5"): string {
  return `${siteUrl()}${gameType === "lb" ? "/laserball/games" : "/games"}/${slug}`;
}

const positionName = (code: number) => POSITIONS[code - 1] ?? null;

/** m:ss from milliseconds. */
function clock(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Score plus elimination bonus plus (negative) penalties: what decides an SM5 game. */
const effectiveScoreSql = sql<number>`(coalesce(${sm5GameTeam.score}, 0) + coalesce(${sm5GameTeam.eliminationBonus}, 0) + coalesce(${sm5GameTeam.penaltyScore}, 0))::int`;
/** Laserball has no bonus or penalties: the score is the goals. */
const lbScoreSql = sql<number>`coalesce(${lbGameTeam.score}, 0)::int`;

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

type CompetitionInfo = {
  slug: string;
  name: string;
  round: string | null;
  round_type: string | null;
  match_number: number | null;
  game_number: number | null;
};

/**
 * Competition, round and match per game, plus the competition team behind each game team.
 * Games in solo or no-scoring competitions have a competition but no match.
 */
async function competitionInfo(gameIds: string[]) {
  const db = getAnalyticsDb();
  const ct1 = alias(competitionTeam, "ct1");
  const ct2 = alias(competitionTeam, "ct2");
  const [base, matches] = await Promise.all([
    db
      .select({ gameId: game.id, slug: competition.slug, name: competition.name })
      .from(game)
      .innerJoin(competition, eq(competition.id, game.competitionId))
      .where(inArray(game.id, gameIds)),
    db
      .select({
        gameId: competitionMatchGame.gameId,
        round: competitionRound.name,
        roundType: competitionRound.type,
        matchNumber: competitionMatch.matchNumber,
        gameNumber: competitionMatchGame.gameNumber,
        team1GameTeamId: competitionMatchGame.team1GameTeamId,
        team2GameTeamId: competitionMatchGame.team2GameTeamId,
        team1: ct1.name,
        team2: ct2.name,
      })
      .from(competitionMatchGame)
      .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
      .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
      .leftJoin(ct1, eq(ct1.id, competitionMatch.team1Id))
      .leftJoin(ct2, eq(ct2.id, competitionMatch.team2Id))
      .where(inArray(competitionMatchGame.gameId, gameIds)),
  ]);

  const matchByGame = new Map(matches.map((m) => [m.gameId, m]));
  const byGame = new Map<string, CompetitionInfo>();
  const competitionTeamByGameTeam = new Map<string, string | null>();
  for (const b of base) {
    const m = matchByGame.get(b.gameId);
    byGame.set(b.gameId, {
      slug: b.slug,
      name: b.name,
      round: m?.round ?? null,
      round_type: m?.roundType ?? null,
      match_number: m?.matchNumber ?? null,
      game_number: m?.gameNumber ?? null,
    });
    if (m) {
      competitionTeamByGameTeam.set(m.team1GameTeamId, m.team1);
      competitionTeamByGameTeam.set(m.team2GameTeamId, m.team2);
    }
  }
  return { byGame, competitionTeamByGameTeam };
}

type TeamRow = {
  id: string;
  gameId: string;
  name: string;
  colourEnum: number;
  score: number | null;
  eliminationBonus: number | null;
  penaltyScore: number | null;
  effective: number;
  result: string | null;
  eliminated: boolean | null;
};

/** Non-neutral teams per game, best effective score first. */
async function teamsFor(gameType: GameType, gameIds: string[]): Promise<Map<string, TeamRow[]>> {
  const db = getAnalyticsDb();
  const rows: TeamRow[] =
    gameType === "sm5"
      ? await db
          .select({
            id: sm5GameTeam.id,
            gameId: sm5GameTeam.gameId,
            name: sm5GameTeam.name,
            colourEnum: sm5GameTeam.colourEnum,
            score: sm5GameTeam.score,
            eliminationBonus: sm5GameTeam.eliminationBonus,
            penaltyScore: sm5GameTeam.penaltyScore,
            effective: effectiveScoreSql,
            result: sm5GameTeam.result,
            eliminated: sm5GameTeam.eliminated,
          })
          .from(sm5GameTeam)
          .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
          .orderBy(desc(effectiveScoreSql), asc(sm5GameTeam.tdfTeamIndex))
      : await db
          .select({
            id: lbGameTeam.id,
            gameId: lbGameTeam.gameId,
            name: lbGameTeam.name,
            colourEnum: lbGameTeam.colourEnum,
            score: lbGameTeam.score,
            eliminationBonus: sql<null>`null`,
            penaltyScore: sql<null>`null`,
            effective: lbScoreSql,
            result: lbGameTeam.result,
            eliminated: sql<null>`null`,
          })
          .from(lbGameTeam)
          .where(and(inArray(lbGameTeam.gameId, gameIds), eq(lbGameTeam.isNeutral, false)))
          .orderBy(desc(lbScoreSql), asc(lbGameTeam.tdfTeamIndex));
  const byGame = new Map<string, TeamRow[]>();
  for (const r of rows) byGame.set(r.gameId, [...(byGame.get(r.gameId) ?? []), r]);
  return byGame;
}

function teamJson(t: TeamRow, competitionTeams: Map<string, string | null>, gameType: GameType) {
  if (gameType === "lb") {
    // Laserball teams have only a goal total and a result.
    return { name: t.name, colour_enum: t.colourEnum, score: t.score, result: t.result };
  }
  return {
    name: t.name,
    colour_enum: t.colourEnum,
    competition_team: competitionTeams.get(t.id) ?? null,
    score: t.score,
    elimination_bonus: t.eliminationBonus,
    penalty_score: t.penaltyScore ?? 0,
    effective_score: t.effective,
    result: t.result,
    eliminated: t.eliminated,
  };
}

// ---------------------------------------------------------------------------
// search_games
// ---------------------------------------------------------------------------

type SortKey = SearchGamesRequest["sort"] & string;
type Cursor = { s: SortKey; v: string | number; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(raw: string, sort: SortKey): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, "base64url").toString()) as Cursor;
    if (c.s === sort && typeof c.id === "string" && c.v !== undefined) return c;
  } catch {
    // Falls through to the error below.
  }
  throw new QueryApiError("invalid_request", "cursor is not valid for this query.", {
    field: "cursor",
    hint: "Pass meta.next_cursor unchanged, with the same sort as the request that returned it.",
  });
}

/**
 * Gap between the top two non-neutral teams' scores (effective scores for SM5, goals for
 * Laserball); null with fewer than two teams.
 */
function marginCte(gameType: GameType): SQL {
  const team = gameType === "sm5" ? sm5GameTeam : lbGameTeam;
  const score = gameType === "sm5" ? effectiveScoreSql : lbScoreSql;
  return sql`
    select ${team.gameId} as game_id,
      (array_agg(${score} order by ${score} desc))[1]
        - (array_agg(${score} order by ${score} desc))[2] as margin
    from ${team}
    where ${team.isNeutral} = false
    group by ${team.gameId}`;
}

/** A scorecard for one of `playerIds` in the outer game, meeting the scope's scorecard filters. */
function playedSql(scope: ResolvedScope, src: ScorecardSource, playerIds: string[]): SQL {
  return sql`exists (select 1 from ${src.sc}
    inner join ${src.team} on ${src.team.id} = ${src.sc.teamId}
    where ${and(
      eq(src.sc.gameId, game.id),
      inArray(src.sc.playerId, playerIds),
      ...scopeScorecardConditions(scope, src),
    )})`;
}

function relationSql(
  gameType: GameType,
  a: IdentifiedPlayer,
  b: IdentifiedPlayer,
  sameTeam: boolean,
): SQL {
  const sc = gameType === "sm5" ? sm5Scorecard : lbScorecard;
  // Aliases spelled out: a drizzle alias() inside a raw sql template renders only its
  // alias name, without the `table AS alias` it needs in FROM.
  return sql`exists (select 1 from ${sc} rel_a
      inner join ${sc} rel_b on rel_b.game_id = rel_a.game_id
    where rel_a.game_id = ${game.id} and rel_a.player_id = ${a.id} and rel_b.player_id = ${b.id}
      and ${sameTeam ? sql`rel_a.team_id = rel_b.team_id` : sql`rel_a.team_id <> rel_b.team_id`})`;
}

export async function searchGames(req: SearchGamesRequest, today: string) {
  const normalized = normalizeScope(req.scope ?? {}, today);
  const gameType = normalized.game_type;
  const src = sourceFor(gameType);
  if (!req.players && (normalized.positions || normalized.team_result)) {
    throw new QueryApiError(
      "invalid_scope",
      "scope.positions and scope.team_result filter scorecards, so they need `players`.",
      {
        field: normalized.positions ? "scope.positions" : "scope.team_result",
        hint: "Add players (e.g. games where X played medic), or remove the filter.",
      },
    );
  }
  if (
    req.min_margin !== undefined &&
    req.max_margin !== undefined &&
    req.min_margin > req.max_margin
  ) {
    throw new QueryApiError("invalid_request", "min_margin is greater than max_margin.", {
      field: "min_margin",
    });
  }
  const relation = req.players?.relation ?? "any";
  const match = req.players?.match ?? "all";
  if (relation !== "any" && req.players?.include.length !== 2) {
    throw new QueryApiError("invalid_request", `relation '${relation}' needs exactly 2 players.`, {
      field: "players.relation",
    });
  }
  if (relation !== "any" && match === "any") {
    throw new QueryApiError("invalid_request", "relation requires players.match 'all'.", {
      field: "players.match",
    });
  }
  const fields = new Set(req.fields ?? SEARCH_GAMES_FIELDS);
  if (req.include_rosters && !fields.has("teams")) {
    throw new QueryApiError("invalid_request", "include_rosters needs 'teams' in fields.", {
      field: "include_rosters",
    });
  }

  const [scope, players] = await Promise.all([
    resolveScope(normalized),
    req.players ? identifyPlayers(req.players.include, "players.include") : null,
  ]);
  const unique = players ? [...new Map(players.map((p) => [p.id, p])).values()] : [];

  const sort: SortKey = req.sort ?? "start_time_desc";
  const limit = req.limit ?? SEARCH_GAMES_LIMITS.default_limit;
  const byMargin = sort.startsWith("margin");
  const descending = sort.endsWith("desc");

  const conditions: SQL[] = [...scopeGameConditions(scope)];
  conditions.push(req.outcomes ? inArray(game.outcome, req.outcomes) : ne(game.outcome, "aborted"));
  if (req.min_margin !== undefined) conditions.push(sql`m.margin >= ${req.min_margin}`);
  if (req.max_margin !== undefined) conditions.push(sql`m.margin <= ${req.max_margin}`);
  if (byMargin) conditions.push(sql`m.margin is not null`);
  if (unique.length > 0) {
    if (match === "all") {
      for (const p of unique) conditions.push(playedSql(scope, src, [p.id]));
    } else {
      conditions.push(
        playedSql(
          scope,
          src,
          unique.map((p) => p.id),
        ),
      );
    }
    if (relation !== "any") {
      conditions.push(relationSql(gameType, unique[0]!, unique[1]!, relation === "teammates"));
    }
  }
  const filtered = and(...conditions);

  // Keyset pagination on (sort key, game id).
  const keyExpr = byMargin ? sql`m.margin` : sql`${game.startTime}`;
  const keyText = byMargin
    ? sql`m.margin::text`
    : sql`to_char(${game.startTime}, 'YYYY-MM-DD HH24:MI:SS.US')`;
  const keyCast = byMargin ? sql`::int` : sql`::timestamp`;
  const dir = descending ? sql`desc` : sql`asc`;
  let pageCondition = sql`true`;
  if (req.cursor) {
    const c = decodeCursor(req.cursor, sort);
    const cmp = descending ? sql`<` : sql`>`;
    pageCondition = sql`(${keyExpr}, ${game.id}) ${cmp} (${String(c.v)}${keyCast}, ${c.id}::uuid)`;
  }

  const db = getAnalyticsDb();
  const [rows, [total], latest] = await Promise.all([
    db.execute<Record<string, unknown>>(sql`
      with m as (${marginCte(gameType)})
      select ${game.id} as id, ${gameSlugSql} as slug,
        ${localTimestampSql(game.startTime)} as start_time, ${keyText} as sort_key,
        ${game.outcome} as outcome, ${game.exclude} as excluded, m.margin as margin,
        ${centerSlugSql} as center_slug, ${center.name} as center_name
      from ${game}
        inner join ${center} on ${center.id} = ${game.centerId}
        left join m on m.game_id = ${game.id}
      where ${filtered} and ${pageCondition}
      order by ${keyExpr} ${dir}, ${game.id} ${dir}
      limit ${limit + 1}`),
    db.execute<{ n: number }>(sql`
      with m as (${marginCte(gameType)})
      select count(*)::int as n from ${game} left join m on m.game_id = ${game.id}
      where ${filtered}`),
    dataAsOf(scope),
  ]);

  const page = [...rows].slice(0, limit);
  const hasMore = rows.length > limit;
  const gameIds = page.map((r) => String(r.id));

  const needTeams = fields.has("teams");
  const [teams, comps, rosters] = await Promise.all([
    needTeams && gameIds.length > 0 ? teamsFor(gameType, gameIds) : new Map<string, TeamRow[]>(),
    (needTeams || fields.has("competition")) && gameIds.length > 0
      ? competitionInfo(gameIds)
      : { byGame: new Map<string, CompetitionInfo>(), competitionTeamByGameTeam: new Map() },
    req.include_rosters && gameIds.length > 0
      ? rostersFor(gameType, gameIds)
      : new Map<string, RosterRow[]>(),
  ]);

  const data = page.map((r) => {
    const id = String(r.id);
    const slug = String(r.slug);
    const out: Record<string, unknown> = { game_slug: slug };
    if (fields.has("start_time")) out.start_time = r.start_time;
    if (fields.has("center")) out.center = { slug: r.center_slug, name: r.center_name };
    if (fields.has("competition")) out.competition = comps.byGame.get(id) ?? null;
    if (fields.has("outcome")) out.outcome = r.outcome;
    if (fields.has("margin")) out.margin = r.margin === null ? null : Number(r.margin);
    if (needTeams) {
      out.teams = (teams.get(id) ?? []).map((t) => ({
        ...teamJson(t, comps.competitionTeamByGameTeam, gameType),
        ...(req.include_rosters && { players: rosters.get(t.id) ?? [] }),
      }));
    }
    if (fields.has("excluded")) out.excluded = r.excluded;
    if (fields.has("web_url")) out.web_url = gameWebUrl(slug, gameType);
    return out;
  });

  const last = page.at(-1);
  const warnings: string[] = [];
  if (byMargin)
    warnings.push("Games with fewer than two scored teams are left out when sorting by margin.");
  if (gameType === "sm5" && req.scope?.include_mercenary_games !== undefined) {
    warnings.push("include_mercenary_games does not apply to search_games and was ignored.");
  }
  const renamed = (players ?? []).filter((p) => p.input !== p.iplId);

  return {
    data,
    meta: {
      ...scopedMeta({
        scope,
        metricIds: [],
        rowCount: data.length,
        truncated: hasMore,
        warnings,
        dataAsOf: latest,
        extra: {
          ...(renamed.length > 0 && {
            resolved_players: Object.fromEntries(
              renamed.map((p) => [p.input, { ipl_id: p.iplId, matched_on: p.matchedOn }]),
            ),
          }),
          sort,
          total_matches: Number(total?.n ?? 0),
        },
      }),
      next_cursor:
        hasMore && last
          ? encodeCursor({ s: sort, v: String(last.sort_key), id: String(last.id) })
          : null,
    },
  };
}

type RosterRow = Record<string, unknown> & { ipl_id: string | null; callsign: string };

/** Compact rosters per team id, best first. Guests have a null ipl_id. */
async function rostersFor(
  gameType: GameType,
  gameIds: string[],
): Promise<Map<string, RosterRow[]>> {
  const db = getAnalyticsDb();
  const rows: { teamId: string; row: RosterRow }[] =
    gameType === "sm5"
      ? (
          await db
            .select({
              teamId: sm5Scorecard.teamId,
              iplId: sm5Scorecard.iplId,
              callsign: sm5Scorecard.callsign,
              position: sm5Scorecard.position,
              score: sm5Scorecard.score,
              mvp: sm5Scorecard.mvpPoints,
              isMercenary: sm5Scorecard.isMercenary,
            })
            .from(sm5Scorecard)
            .where(inArray(sm5Scorecard.gameId, gameIds))
            .orderBy(desc(sm5Scorecard.score))
        ).map((r) => ({
          teamId: r.teamId,
          row: {
            ipl_id: r.iplId,
            callsign: r.callsign.trim(),
            position: positionName(r.position),
            score: r.score,
            mvp: r.mvp,
            is_mercenary: r.isMercenary,
          },
        }))
      : (
          await db
            .select({
              teamId: lbScorecard.teamId,
              iplId: lbScorecard.iplId,
              callsign: lbScorecard.callsign,
              goals: lbScorecard.goals,
              assists: sql<number>`${lbScorecard.assists1} + ${lbScorecard.assists2}`,
              steals: lbScorecard.stealsDone,
              blocks: lbScorecard.blocksDone,
            })
            .from(lbScorecard)
            .where(inArray(lbScorecard.gameId, gameIds))
            .orderBy(desc(lbScorecard.goals), desc(lbScorecard.stealsDone))
        ).map((r) => ({
          teamId: r.teamId,
          row: {
            ipl_id: r.iplId,
            callsign: r.callsign.trim(),
            goals: r.goals,
            assists: r.assists,
            steals: r.steals,
            blocks: r.blocks,
          },
        }));
  const byTeam = new Map<string, RosterRow[]>();
  for (const { teamId, row } of rows) byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), row]);
  return byTeam;
}

// ---------------------------------------------------------------------------
// games/{slug}
// ---------------------------------------------------------------------------

export async function getGameDetail(slug: string, req: GameDetailRequest) {
  const parsed = parseGameSlug(slug);
  if (!parsed) {
    throw new QueryApiError("game_not_found", `'${slug}' is not a game slug.`, {
      field: "slug",
      hint: "Game slugs look like '4-23-20260808212334'. Use search_games to find one.",
    });
  }
  const db = getAnalyticsDb();
  const [g] = await db
    .select({
      id: game.id,
      slug: gameSlugSql,
      type: game.type,
      startTime: localTimestampSql(game.startTime),
      outcome: game.outcome,
      exclude: game.exclude,
      description: game.description,
      scheduled: game.scheduledDuration,
      actual: game.actualDuration,
      tdfFilename: game.tdfFilename,
      centerSlug: centerSlugSql,
      centerName: center.name,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(center.countryCode, parsed.countryCode),
        eq(center.siteCode, parsed.siteCode),
        sql`to_char(${game.startTime}, 'YYYYMMDDHH24MISS') = ${parsed.timestamp}`,
      ),
    );
  if (!g) {
    throw new QueryApiError("game_not_found", `No game with slug '${slug}'.`, {
      field: "slug",
      hint: "Use search_games to find the game.",
    });
  }
  if (g.type === "lb") return lbGameDetail(g);

  const sc = sm5Scorecard;
  const [teams, comps, scorecards, penalties, teamPenalties, components] = await Promise.all([
    teamsFor("sm5", [g.id]),
    competitionInfo([g.id]),
    db
      .select({
        id: sc.id,
        teamId: sc.teamId,
        iplId: sc.iplId,
        callsign: sc.callsign,
        position: sc.position,
        isMercenary: sc.isMercenary,
        score: sc.score,
        mvp: sc.mvpPoints,
        accuracy: sc.accuracy,
        hitDiff: sc.hitDiff,
        shotsFired: sc.shotsFired,
        shotsHit: sc.shotsHit,
        timesHit: sc.timesHit,
        missilesHit: sc.missilesHitOpponent,
        timesHitByMissile: sc.timesHitByMissile,
        medicHits: sc.medicHits,
        eliminations: sc.eliminatedOpponent,
        assists: sc.assists,
        nukesDetonated: sc.nukesDetonated,
        nukesCanceled: sc.nukesCanceled,
        rapidFire: sc.rapidFire,
        resuppliesGiven: sc.resuppliesGiven,
        livesLeft: sc.livesLeft,
        shotsLeft: sc.shotsLeft,
        eliminated: sc.eliminated,
        penalties: sc.penalties,
        uptimePct: sql<
          number | null
        >`${sc.uptime}::float8 / nullif(${sc.uptime} + ${sc.resupplyDowntime} + ${sc.otherDowntime}, 0)`,
      })
      .from(sc)
      .where(eq(sc.gameId, g.id))
      .orderBy(desc(sc.score)),
    (req.include_penalties ?? true)
      ? db
          .select({
            iplId: sc.iplId,
            callsign: sc.callsign,
            type: sm5GamePenalty.type,
            description: sm5GamePenalty.description,
            scoreValue: sm5GamePenalty.scoreValue,
            mvpValue: sm5GamePenalty.mvpValue,
            time: sm5GamePenalty.time,
            rescinded: sm5GamePenalty.rescinded,
          })
          .from(sm5GamePenalty)
          .innerJoin(sc, eq(sc.id, sm5GamePenalty.scorecardId))
          .where(eq(sm5GamePenalty.gameId, g.id))
          .orderBy(sm5GamePenalty.time)
      : [],
    (req.include_penalties ?? true)
      ? db
          .select({
            team: sm5GameTeam.name,
            type: sm5GameTeamPenalty.type,
            description: sm5GameTeamPenalty.description,
            scoreValue: sm5GameTeamPenalty.scoreValue,
            time: sm5GameTeamPenalty.time,
            rescinded: sm5GameTeamPenalty.rescinded,
          })
          .from(sm5GameTeamPenalty)
          .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5GameTeamPenalty.gameTeamId))
          .where(eq(sm5GameTeamPenalty.gameId, g.id))
          .orderBy(sm5GameTeamPenalty.time)
      : [],
    req.include_mvp_components
      ? db
          .select({
            scorecardId: sm5ScorecardMvp.scorecardId,
            component: sm5ScorecardMvp.component,
            points: sm5ScorecardMvp.points,
          })
          .from(sm5ScorecardMvp)
          .innerJoin(
            sc,
            and(
              eq(sc.id, sm5ScorecardMvp.scorecardId),
              eq(sc.mvpModelId, sm5ScorecardMvp.mvpModelId),
            ),
          )
          .where(eq(sc.gameId, g.id))
      : [],
  ]);

  const componentsBy = new Map<string, Record<string, number>>();
  for (const c of components) {
    componentsBy.set(c.scorecardId, {
      ...componentsBy.get(c.scorecardId),
      [c.component]: c.points,
    });
  }

  const playersFor = (teamId: string) =>
    scorecards
      .filter((s) => s.teamId === teamId)
      .map((s) => ({
        ipl_id: s.iplId,
        callsign: s.callsign.trim(),
        position: positionName(s.position),
        is_mercenary: s.isMercenary,
        score: s.score,
        mvp: s.mvp,
        accuracy: s.accuracy,
        hit_diff: s.hitDiff,
        shots_fired: s.shotsFired,
        shots_hit: s.shotsHit,
        times_hit: s.timesHit,
        missiles_hit: s.missilesHit,
        times_hit_by_missile: s.timesHitByMissile,
        medic_hits: s.medicHits,
        eliminations: s.eliminations,
        assists: s.assists,
        // Position-specific: null where the position has no such ability.
        nukes_detonated: s.nukesDetonated,
        nukes_canceled: s.nukesCanceled,
        rapid_fire: s.rapidFire,
        resupplies_given: s.resuppliesGiven,
        lives_left: s.livesLeft,
        shots_left: s.shotsLeft,
        eliminated: s.eliminated,
        uptime_pct: s.uptimePct,
        penalties: s.penalties,
        ...(req.include_mvp_components && { mvp_components: componentsBy.get(s.id) ?? {} }),
      }));

  return {
    data: {
      game_slug: g.slug,
      game_type: g.type,
      start_time: g.startTime,
      center: { slug: g.centerSlug, name: g.centerName },
      competition: comps.byGame.get(g.id) ?? null,
      outcome: g.outcome,
      excluded: g.exclude,
      description: g.description,
      scheduled_length: clock(g.scheduled),
      actual_length: clock(g.actual),
      teams: (teams.get(g.id) ?? []).map((t) => ({
        ...teamJson(t, comps.competitionTeamByGameTeam, "sm5"),
        players: playersFor(t.id),
      })),
      ...((req.include_penalties ?? true) && {
        penalties: [
          ...penalties.map((p) => ({
            ipl_id: p.iplId,
            callsign: p.callsign.trim(),
            team: null,
            type: p.type,
            description: p.description,
            score_value: p.scoreValue,
            mvp_value: p.mvpValue,
            time: clock(p.time),
            rescinded: p.rescinded,
          })),
          ...teamPenalties.map((p) => ({
            ipl_id: null,
            callsign: null,
            team: p.team,
            type: p.type,
            description: p.description,
            score_value: p.scoreValue,
            mvp_value: null,
            time: clock(p.time),
            rescinded: p.rescinded,
          })),
        ],
      }),
      tdf_url: getTdfArchiveUrl(g.tdfFilename),
      web_url: gameWebUrl(g.slug, "sm5"),
    },
    meta: {
      warnings: g.exclude
        ? [
            "This game is excluded from all aggregates (aborted or excluded by an admin); don't treat it as typical.",
          ]
        : [],
    },
  };
}

type GameHeader = {
  id: string;
  slug: string;
  type: string;
  startTime: string;
  outcome: string;
  exclude: boolean;
  description: string | null;
  scheduled: number;
  actual: number;
  tdfFilename: string;
  centerSlug: string;
  centerName: string;
};

/**
 * A Laserball game: goal totals, every player's stats, and, when the game is one half of a
 * linked match, the other half. Laserball has no penalties or MVP.
 */
async function lbGameDetail(g: GameHeader) {
  const db = getAnalyticsDb();
  const sc = lbScorecard;
  const other = alias(lbMatchGame, "other");
  const [teams, scorecards, [half]] = await Promise.all([
    teamsFor("lb", [g.id]),
    db
      .select({
        teamId: sc.teamId,
        iplId: sc.iplId,
        callsign: sc.callsign,
        goals: sc.goals,
        assists: sql<number>`${sc.assists1} + ${sc.assists2}`,
        passes: sc.passesDone,
        steals: sc.stealsDone,
        stealsReceived: sc.stealsReceived,
        blocks: sc.blocksDone,
        blocksReceived: sc.blocksReceived,
        clears: sc.clearsDone,
        failedClears: sc.failedClearsCalc,
        clutchSaves: sc.clutchSaves,
        possessionMs: sc.possessionTimeMs,
        timePlayedMs: sc.timePlayedMs,
      })
      .from(sc)
      .where(eq(sc.gameId, g.id))
      .orderBy(desc(sc.goals), desc(sc.stealsDone)),
    db
      .select({
        half: lbMatchGame.half,
        otherHalf: other.half,
        otherSlug: gameSlugSql,
      })
      .from(lbMatchGame)
      .leftJoin(
        other,
        and(eq(other.matchId, lbMatchGame.matchId), sql`${other.gameId} <> ${lbMatchGame.gameId}`),
      )
      .leftJoin(game, eq(game.id, other.gameId))
      .leftJoin(center, eq(center.id, game.centerId))
      .where(eq(lbMatchGame.gameId, g.id)),
  ]);

  return {
    data: {
      game_slug: g.slug,
      game_type: g.type,
      start_time: g.startTime,
      center: { slug: g.centerSlug, name: g.centerName },
      outcome: g.outcome,
      excluded: g.exclude,
      description: g.description,
      scheduled_length: clock(g.scheduled),
      actual_length: clock(g.actual),
      // A Laserball match is two halves with sides swapped; null when not linked.
      match: half
        ? {
            half: half.half,
            other_half: half.otherSlug ? { half: half.otherHalf, game_slug: half.otherSlug } : null,
          }
        : null,
      teams: (teams.get(g.id) ?? []).map((t) => ({
        ...teamJson(t, new Map(), "lb"),
        players: scorecards
          .filter((s) => s.teamId === t.id)
          .map((s) => ({
            ipl_id: s.iplId,
            callsign: s.callsign.trim(),
            goals: s.goals,
            assists: s.assists,
            passes: s.passes,
            steals: s.steals,
            steals_received: s.stealsReceived,
            blocks: s.blocks,
            blocks_received: s.blocksReceived,
            clears: s.clears,
            failed_clears: s.failedClears,
            clutch_saves: s.clutchSaves,
            possession_ms: s.possessionMs,
            time_played_ms: s.timePlayedMs,
          })),
      })),
      tdf_url: getTdfArchiveUrl(g.tdfFilename),
      web_url: gameWebUrl(g.slug, "lb"),
    },
    meta: {
      warnings: g.exclude
        ? [
            "This game is excluded from all aggregates (aborted or excluded by an admin); don't treat it as typical.",
          ]
        : [],
    },
  };
}
