// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { center, competition, game, sm5GamePenalty } from "../../schema";
import { PENALTY_LIMITS, POSITIONS, type PenaltiesRequest } from "../../schemas/query-api";
import { QueryApiError } from "./errors";
import { gameWebUrl } from "./games";
import { centerSlugSql, dataAsOf, gameSlugSql, localTimestampSql, scopedMeta } from "./meta";
import { getAnalyticsDb } from "./pool";
import { identifyPlayers } from "./resolve";
import {
  normalizeScope,
  resolveScope,
  scopeGameConditions,
  scopeScorecardConditions,
  SM5_SOURCE,
} from "./scope";

// POST /penalties (docs/Query_API_Spec.md): player penalties across games. game_detail
// already lists one game's penalties; this answers "what was X penalized for this year?" and
// "every Unsportsmanlike call at Internationals". SM5 only: Laserball records no penalties.
//
// Team penalties (given to a whole team, not a player) are not listed here; they appear in
// game_detail and in the teams' penalty_score.

/** m:ss into the game, or null for a penalty added after the game with no time. */
function clock(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export async function searchPenalties(req: PenaltiesRequest, today: string) {
  const normalized = normalizeScope(req.scope ?? {}, today);
  if (normalized.game_type !== "sm5") {
    throw new QueryApiError("invalid_scope", "Laserball records no penalties.", {
      field: "scope.game_type",
      hint: "Remove scope.game_type, or set it to 'sm5'.",
    });
  }
  const limit = req.limit ?? PENALTY_LIMITS.default_limit;
  const offset = req.offset ?? 0;

  const [scope, players] = await Promise.all([
    resolveScope(normalized),
    req.players ? identifyPlayers(req.players, "players") : null,
  ]);
  const { sc, team } = SM5_SOURCE;

  // Everything but the type filter, so by_type can show which types exist in scope.
  const base: SQL[] = [
    ...scopeGameConditions(scope),
    ...scopeScorecardConditions(scope, SM5_SOURCE),
  ];
  if (players) {
    base.push(inArray(sc.playerId, [...new Set(players.map((p) => p.id))]));
  }
  if (!req.include_rescinded) base.push(eq(sm5GamePenalty.rescinded, false));

  const conditions = [...base];
  if (req.types) {
    conditions.push(
      inArray(
        sql`lower(trim(${sm5GamePenalty.type}))`,
        req.types.map((t) => t.toLowerCase()),
      ),
    );
  }

  const db = getAnalyticsDb();
  const [rows, byType, [total], latest] = await Promise.all([
    db
      .select({
        slug: gameSlugSql,
        startTime: localTimestampSql(game.startTime),
        centerSlug: centerSlugSql,
        centerName: center.name,
        competitionSlug: competition.slug,
        competitionName: competition.name,
        iplId: sc.iplId,
        callsign: sc.callsign,
        position: sc.position,
        team: team.name,
        type: sm5GamePenalty.type,
        description: sm5GamePenalty.description,
        scoreValue: sm5GamePenalty.scoreValue,
        mvpValue: sm5GamePenalty.mvpValue,
        time: sm5GamePenalty.time,
        inGame: sm5GamePenalty.inGame,
        rescinded: sm5GamePenalty.rescinded,
      })
      .from(sm5GamePenalty)
      .innerJoin(sc, eq(sc.id, sm5GamePenalty.scorecardId))
      .innerJoin(team, eq(team.id, sc.teamId))
      .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
      .innerJoin(center, eq(center.id, game.centerId))
      .leftJoin(competition, eq(competition.id, game.competitionId))
      .where(and(...conditions))
      .orderBy(desc(game.startTime), desc(sm5GamePenalty.time), desc(sm5GamePenalty.id))
      .limit(limit + 1)
      .offset(offset),
    db
      .select({ type: sm5GamePenalty.type, n: sql<number>`count(*)::int` })
      .from(sm5GamePenalty)
      .innerJoin(sc, eq(sc.id, sm5GamePenalty.scorecardId))
      .innerJoin(team, eq(team.id, sc.teamId))
      .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
      .where(and(...base))
      .groupBy(sm5GamePenalty.type)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(sm5GamePenalty)
      .innerJoin(sc, eq(sc.id, sm5GamePenalty.scorecardId))
      .innerJoin(team, eq(team.id, sc.teamId))
      .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
      .where(and(...conditions)),
    dataAsOf(scope),
  ]);

  const page = rows.slice(0, limit);
  const data = page.map((r) => ({
    game_slug: r.slug,
    start_time: r.startTime,
    center: { slug: r.centerSlug, name: r.centerName },
    competition: r.competitionSlug ? { slug: r.competitionSlug, name: r.competitionName } : null,
    // Null for a guest, who has no stable identity.
    ipl_id: r.iplId,
    callsign: r.callsign.trim(),
    position: POSITIONS[r.position - 1] ?? null,
    team: r.team,
    type: r.type,
    description: r.description,
    score_value: r.scoreValue,
    mvp_value: r.mvpValue,
    time: clock(r.time),
    // False for a penalty a referee added after the game ended.
    in_game: r.inGame,
    rescinded: r.rescinded,
    web_url: gameWebUrl(r.slug, "sm5"),
  }));

  const renamed = (players ?? []).filter((p) => p.input !== p.iplId);
  return {
    data,
    meta: scopedMeta({
      scope,
      metricIds: [],
      rowCount: data.length,
      truncated: rows.length > limit,
      warnings: [],
      dataAsOf: latest,
      extra: {
        ...(renamed.length > 0 && {
          resolved_players: Object.fromEntries(
            renamed.map((p) => [p.input, { ipl_id: p.iplId, matched_on: p.matchedOn }]),
          ),
        }),
        offset,
        total_matches: Number(total?.n ?? 0),
        // Counts per type in scope before the `types` filter, most common first.
        by_type: Object.fromEntries(byType.map((t) => [t.type, t.n])),
      },
    }),
  };
}
