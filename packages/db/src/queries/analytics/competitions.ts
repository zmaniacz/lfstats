// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, count, desc, eq, max, sql, type SQL } from "drizzle-orm";
import {
  center,
  competition,
  competitionTeam,
  competitionTeamPlayer,
  game,
  gameTag,
  gameTagAssignment,
  player,
} from "../../schema";
import { LIST_LIMITS, type CompetitionRequest, type ListRequest } from "../../schemas/query-api";
import { getLbCompetitionSchedule, getLbCompetitionStandingsData } from "../competition-laserball";
import { getSoloCompetitionStandingsData } from "../competition-solo";
import { getCompetitionSchedule, getCompetitionStandingsData } from "../competition-tournament";
import { QueryApiError, suggestionPrefix } from "./errors";
import { siteUrl } from "./games";
import { centerSlugSql } from "./meta";
import { getAnalyticsDb } from "./pool";

// GET /competitions/{slug} and POST /list (docs/Query_API_Spec.md).
//
// Standings and schedules come from the same functions as the site's standings page and the
// public /api/competitions routes, so the three can never disagree. Those functions predate
// the query API and read through the site's own pool, not the read-only analytics pool; they
// are fixed-shape reads of one competition, so that costs nothing in safety.

/** camelCase → snake_case. Digits stay attached to the word before them (team1Name → team1_name). */
function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * A row from one of the site's competition queries, in query API form: snake_case keys,
 * center-local timestamps with no zone suffix, and neither internal ids nor image fields.
 */
export function publicRow(row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (/(^|[a-z0-9])Id$/.test(key) && key !== "iplId") continue;
    if (/Logo|Picture/.test(key)) continue;
    // Stored timestamps are center-local; the driver reads them as if UTC, so the ISO
    // string minus its zone is the stored wall-clock time.
    out[snakeKey(key)] = value instanceof Date ? value.toISOString().slice(0, 19) : value;
  }
  return out;
}

const STANDINGS_NOTE =
  "Standings leave out finals rounds. To say who won a competition that has finals, read the finals games in the schedule (include_schedule).";

export async function getCompetitionDetail(slug: string, req: CompetitionRequest) {
  const db = getAnalyticsDb();
  const [comp] = await db
    .select({
      id: competition.id,
      slug: competition.slug,
      name: competition.name,
      type: competition.type,
      gameType: competition.gameType,
      format: competition.format,
      category: competition.category,
      state: competition.state,
      startDate: competition.startDate,
      endDate: competition.endDate,
      description: competition.description,
      challongeLink: competition.challongeLink,
      hostSlug: sql<
        string | null
      >`case when ${center.id} is null then null else ${centerSlugSql} end`,
      hostName: center.name,
    })
    .from(competition)
    .leftJoin(center, eq(center.id, competition.hostCenterId))
    .where(eq(competition.slug, slug));
  if (!comp) {
    const all = await db.select({ slug: competition.slug }).from(competition);
    throw new QueryApiError("competition_not_found", `No competition with slug '${slug}'.`, {
      field: "slug",
      hint: `${suggestionPrefix(
        slug,
        all.map((r) => r.slug),
      )}Use resolve to turn a competition name into its slug, or list to see them all.`,
    });
  }

  const lb = comp.gameType === "lb";
  const warnings: string[] = [];

  // What ranks in this competition depends on its format: teams (also trios and duos, one
  // row per trio or duo), individual players (solo), or nothing at all (none).
  let standingsOf: "teams" | "players" | null;
  let standings: Record<string, unknown>[] = [];
  if (comp.format === "none") {
    standingsOf = null;
    warnings.push(
      "This competition is scored elsewhere, so it has no standings, teams or schedule here. Its games and player stats are still available: use search_games or leaderboard with scope.competitions.",
    );
  } else if (lb) {
    standingsOf = "teams";
    standings = (await getLbCompetitionStandingsData(comp.id)).map(publicRow);
  } else if (comp.format === "solo") {
    standingsOf = "players";
    standings = ((await getSoloCompetitionStandingsData(slug)) ?? []).map(publicRow);
  } else {
    standingsOf = "teams";
    standings = ((await getCompetitionStandingsData(slug)) ?? []).map(publicRow);
  }
  const teamBased = standingsOf === "teams";
  if (teamBased) {
    standings = standings.map((row, i) => ({
      rank: i + 1,
      ...row,
      web_url: `${siteUrl()}/competitions/${comp.slug}/teams/${String(row.team_slug)}`,
    }));
    warnings.push(STANDINGS_NOTE);
  }

  let schedule: Record<string, unknown>[] | undefined;
  if (req.include_schedule) {
    if (!teamBased) {
      warnings.push("include_schedule was ignored: only team competitions have a schedule.");
    } else {
      const entries = lb
        ? await getLbCompetitionSchedule(comp.id)
        : ((await getCompetitionSchedule(slug)) ?? []);
      schedule = entries.map(publicRow);
    }
  }

  let teams: Record<string, unknown>[] | undefined;
  if (req.include_rosters) {
    if (!teamBased) {
      warnings.push("include_rosters was ignored: this competition has no teams.");
    } else {
      teams = await competitionRosters(comp.id);
    }
  }

  return {
    data: {
      slug: comp.slug,
      name: comp.name,
      type: comp.type,
      game_type: comp.gameType,
      format: comp.format,
      category: comp.category,
      state: comp.state,
      start_date: comp.startDate,
      end_date: comp.endDate,
      host_center: comp.hostSlug ? { slug: comp.hostSlug, name: comp.hostName } : null,
      description: comp.description,
      bracket_url: comp.challongeLink,
      standings_of: standingsOf,
      standings,
      ...(schedule && { schedule }),
      ...(teams && { teams }),
    },
    meta: { row_count: standings.length, warnings },
  };
}

/** Every team with its players, mercenaries flagged. */
async function competitionRosters(competitionId: string) {
  const rows = await getAnalyticsDb()
    .select({
      teamName: competitionTeam.name,
      teamShortName: competitionTeam.shortName,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      isMercenary: competitionTeamPlayer.isMercenary,
    })
    .from(competitionTeam)
    .leftJoin(
      competitionTeamPlayer,
      eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
    )
    .leftJoin(player, eq(player.id, competitionTeamPlayer.playerId))
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.name), asc(player.currentCallsign));

  const teams = new Map<
    string,
    { name: string; short_name: string | null; players: Record<string, unknown>[] }
  >();
  for (const r of rows) {
    const team = teams.get(r.teamName) ?? {
      name: r.teamName,
      short_name: r.teamShortName,
      players: [],
    };
    if (r.iplId !== null && r.callsign !== null) {
      team.players.push({
        ipl_id: r.iplId,
        callsign: r.callsign.trim(),
        is_mercenary: r.isMercenary ?? false,
      });
    }
    teams.set(r.teamName, team);
  }
  return [...teams.values()];
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function centerIdForSlug(slug: string): Promise<string> {
  const [country, site] = slug.split("-").map(Number) as [number, number];
  const [row] = await getAnalyticsDb()
    .select({ id: center.id })
    .from(center)
    .where(and(eq(center.countryCode, country), eq(center.siteCode, site)));
  if (!row) {
    throw new QueryApiError("center_not_found", `No center with slug '${slug}'.`, {
      field: "center",
      hint: "Use resolve to turn a center name into its slug, or list centers.",
    });
  }
  return row.id;
}

/** Fields that only make sense for another list are reported, never silently dropped. */
function ignoredFilters(req: ListRequest, allowed: (keyof ListRequest)[]): string[] {
  const ignored = (["game_type", "year", "category", "state", "type", "center"] as const).filter(
    (k) => req[k] !== undefined && !allowed.includes(k),
  );
  return ignored.length > 0
    ? [`${ignored.join(", ")} does not apply to a list of ${req.what} and was ignored.`]
    : [];
}

export async function listDirectory(req: ListRequest) {
  const db = getAnalyticsDb();
  const limit = req.limit ?? LIST_LIMITS.default_limit;
  let rows: Record<string, unknown>[];
  let warnings: string[];

  if (req.what === "centers") {
    warnings = ignoredFilters(req, []);
    // Excluded and legacy games still happened at the center, so they count as activity.
    const gamesOf = (type: string) =>
      sql<number>`(count(*) filter (where ${game.type} = ${type}))::int`;
    rows = await db
      .select({
        slug: centerSlugSql,
        name: center.name,
        short_name: center.shortName,
        city: center.city,
        country: center.countryName,
        sm5_games: gamesOf("sm5"),
        laserball_games: gamesOf("lb"),
        legacy_sm5_games: gamesOf("sm5_pdf"),
        last_played: sql<string | null>`to_char(${max(game.startTime)}, 'YYYY-MM-DD')`,
      })
      .from(center)
      .leftJoin(game, eq(game.centerId, center.id))
      .groupBy(center.id)
      .orderBy(desc(count(game.id)), asc(center.name))
      .limit(limit + 1);
  } else if (req.what === "competitions") {
    warnings = ignoredFilters(req, ["game_type", "year", "category", "state", "type", "center"]);
    const conditions: SQL[] = [];
    if (req.game_type) conditions.push(eq(competition.gameType, req.game_type));
    if (req.year) conditions.push(sql`extract(year from ${competition.startDate}) = ${req.year}`);
    if (req.category) conditions.push(eq(competition.category, req.category));
    if (req.state) conditions.push(eq(competition.state, req.state));
    if (req.type) conditions.push(eq(competition.type, req.type));
    if (req.center)
      conditions.push(eq(competition.hostCenterId, await centerIdForSlug(req.center)));
    rows = await db
      .select({
        slug: competition.slug,
        name: competition.name,
        type: competition.type,
        game_type: competition.gameType,
        format: competition.format,
        category: competition.category,
        state: competition.state,
        start_date: competition.startDate,
        end_date: competition.endDate,
        host_center: sql<
          string | null
        >`case when ${center.id} is null then null else ${centerSlugSql} end`,
        games: sql<number>`(select count(*)::int from ${game} where ${game.competitionId} = ${competition.id} and ${game.exclude} = false)`,
      })
      .from(competition)
      .leftJoin(center, eq(center.id, competition.hostCenterId))
      .where(and(...conditions))
      .orderBy(desc(competition.startDate), asc(competition.name))
      .limit(limit + 1);
  } else {
    warnings = ignoredFilters(req, ["center"]);
    const conditions: SQL[] = [eq(gameTag.archived, false)];
    if (req.center) conditions.push(eq(gameTag.centerId, await centerIdForSlug(req.center)));
    rows = (
      await db
        .select({
          name: gameTag.name,
          description: gameTag.description,
          centerSlug: centerSlugSql,
          centerName: center.name,
          games: count(gameTagAssignment.id),
        })
        .from(gameTag)
        .innerJoin(center, eq(center.id, gameTag.centerId))
        .leftJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
        .where(and(...conditions))
        .groupBy(gameTag.id, center.id)
        .orderBy(desc(count(gameTagAssignment.id)), asc(gameTag.name))
        .limit(limit + 1)
    ).map((r) => ({
      name: r.name.trim(),
      description: r.description,
      center: { slug: r.centerSlug, name: r.centerName },
      games: r.games,
    }));
  }

  const truncated = rows.length > limit;
  const data = rows.slice(0, limit);
  return { data, meta: { what: req.what, row_count: data.length, truncated, warnings } };
}
