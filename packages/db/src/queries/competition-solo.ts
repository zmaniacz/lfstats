// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import { competition, competitionPlayer, game, player, sm5Scorecard } from "../schema";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { RosterMutationResult } from "./competition-tournament";

// ---------------------------------------------------------------------------
// Solo competitions
//
// A solo competition has no teams, rounds or matches: every non-excluded game
// assigned to it counts. Players are ranked on Total MVP, which is the sum of
// their best games at each position plus a per-player handicap applied once per
// counted game. Only enrolled players (competition_player) appear in standings.
// ---------------------------------------------------------------------------

/** Scout (position 3) is scored over twice as many games as any other position. */
const SCOUT_POSITION = 3;
const SCOUT_GAME_LIMIT = 10;
const DEFAULT_GAME_LIMIT = 5;

/** 4 positions x 5 games + Scout x 10. Documented for the UI; not enforced in SQL. */
export const SOLO_MAX_COUNTED_GAMES = 4 * DEFAULT_GAME_LIMIT + SCOUT_GAME_LIMIT; /* = 30 */

export type SoloStandingsRow = {
  playerId: string;
  iplId: string | null;
  callsign: string;
  /** Whole number, may be negative. Added to each counted game's MVP. */
  handicap: number;
  /** sum(mvp_points over counted games) + handicap * gamesCounted */
  totalMvp: number;
  /** Size of the counted set; at most SOLO_MAX_COUNTED_GAMES for positions 1-5. */
  gamesCounted: number;
  /** Every non-excluded game the player played in the competition. */
  totalGames: number;
  /** Mean over ALL games, handicap-free. Null when the player has no games. */
  avgMvp: number | null;
  /** Mean over ALL games. Null when the player has no games. */
  avgScore: number | null;
};

/**
 * Solo standings, ranked by Total MVP.
 *
 * Note that `avgMvp * gamesCounted` deliberately does not equal `totalMvp`: the averages
 * describe the player's form across every game they played, while Total MVP is a best-N
 * total that also carries the handicap. They answer different questions.
 *
 * Mercenary status is deliberately not filtered here — `sm5_scorecard.is_mercenary` is
 * only ever stamped when a game is assigned to a match, which never happens in a solo
 * competition, so the flag is uniformly false and filtering on it would be a no-op.
 */
export async function getSoloCompetitionStandings(
  competitionId: string,
): Promise<SoloStandingsRow[]> {
  // Rank each player's games within each position they played, best MVP first. The score
  // and id tiebreaks only decide *which* game fills the last counted slot on an exact MVP
  // tie — the total is identical either way — but keep the result deterministic.
  const ranked = db
    .select({
      playerId: sql<string>`${sm5Scorecard.playerId}`.as("player_id"),
      position: sm5Scorecard.position,
      mvpPoints: sm5Scorecard.mvpPoints,
      score: sm5Scorecard.score,
      rn: sql<number>`row_number() over (
        partition by ${sm5Scorecard.playerId}, ${sm5Scorecard.position}
        order by ${sm5Scorecard.mvpPoints} desc, ${sm5Scorecard.score} desc, ${sm5Scorecard.id}
      )`.as("rn"),
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        eq(game.exclude, false),
        // Guests have no player row and can never be enrolled.
        isNotNull(sm5Scorecard.playerId),
      ),
    )
    .as("ranked");

  // The limits are embedded as literals rather than bound parameters: as parameters they
  // arrive untyped, leaving the CASE result untyped and the `<=` against row_number()'s
  // bigint unresolvable (Postgres 42883). They are module constants, never user input.
  const counted = sql`${ranked.rn} <= case when ${ranked.position} = ${sql.raw(String(SCOUT_POSITION))}
    then ${sql.raw(String(SCOUT_GAME_LIMIT))} else ${sql.raw(String(DEFAULT_GAME_LIMIT))} end`;

  const stats = db
    .select({
      // Aliased distinctly from competition_player.player_id: drizzle emits a bare
      // (unqualified) alias for sql``.as() columns, so reusing "player_id" here makes the
      // outer join condition ambiguous and Postgres rejects the query.
      playerId: sql<string>`${ranked.playerId}`.as("stats_player_id"),
      gamesCounted: sql<number>`count(*) filter (where ${counted})::int`.as("games_counted"),
      mvpSum: sql<number>`coalesce(sum(${ranked.mvpPoints}) filter (where ${counted}), 0)`.as(
        "mvp_sum",
      ),
      totalGames: sql<number>`count(*)::int`.as("total_games"),
      avgMvp: sql<number | null>`avg(${ranked.mvpPoints})`.as("avg_mvp"),
      avgScore: sql<number | null>`avg(${ranked.score})`.as("avg_score"),
    })
    .from(ranked)
    .groupBy(ranked.playerId)
    .as("stats");

  // Driven off the enrollment table, so an enrolled player with no games still appears
  // (with null averages, which the UI renders as an em dash rather than zero).
  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      handicap: competitionPlayer.handicap,
      gamesCounted: stats.gamesCounted,
      mvpSum: stats.mvpSum,
      totalGames: stats.totalGames,
      avgMvp: stats.avgMvp,
      avgScore: stats.avgScore,
    })
    .from(competitionPlayer)
    .innerJoin(player, eq(player.id, competitionPlayer.playerId))
    .leftJoin(stats, eq(stats.playerId, player.id))
    .where(eq(competitionPlayer.competitionId, competitionId));

  return rows
    .map((r) => {
      const gamesCounted = r.gamesCounted ?? 0;
      return {
        playerId: r.playerId,
        iplId: r.iplId,
        callsign: r.callsign,
        handicap: r.handicap,
        totalMvp: Number(r.mvpSum ?? 0) + r.handicap * gamesCounted,
        gamesCounted,
        totalGames: r.totalGames ?? 0,
        avgMvp: r.avgMvp !== null && r.avgMvp !== undefined ? Number(r.avgMvp) : null,
        avgScore: r.avgScore !== null && r.avgScore !== undefined ? Number(r.avgScore) : null,
      };
    })
    .sort(
      (a, b) =>
        b.totalMvp - a.totalMvp ||
        (b.avgMvp ?? -Infinity) - (a.avgMvp ?? -Infinity) ||
        a.callsign.localeCompare(b.callsign),
    );
}

export type SoloUnenrolledPlayer = {
  playerId: string;
  iplId: string | null;
  callsign: string;
  gamesPlayed: number;
  avgMvp: number | null;
};

/**
 * Players with games in this competition who have not been enrolled yet. The solo
 * equivalent of the "unassigned games" block on a team competition's standings page.
 */
export async function getSoloCompetitionUnenrolledPlayers(
  competitionId: string,
): Promise<SoloUnenrolledPlayer[]> {
  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      gamesPlayed: sql<number>`count(*)::int`,
      avgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints})`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(game.id, sm5Scorecard.gameId))
    // Inner join drops guest scorecards, which have no player row to enroll.
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        eq(game.exclude, false),
        sql`${sm5Scorecard.playerId} NOT IN (
          SELECT cp.player_id FROM competition_player cp
          WHERE cp.competition_id = ${competitionId}
        )`,
      ),
    )
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(desc(sql`count(*)`), asc(player.currentCallsign));

  return rows.map((r) => ({
    ...r,
    avgMvp: r.avgMvp !== null ? Number(r.avgMvp) : null,
  }));
}

export type SoloEnrollment = {
  id: string;
  playerId: string;
  iplId: string | null;
  callsign: string;
  handicap: number;
  gamesPlayed: number;
};

/** Enrolled players with their handicaps, for the admin management page. */
export async function getSoloCompetitionEnrollments(
  competitionId: string,
): Promise<SoloEnrollment[]> {
  return db
    .select({
      id: competitionPlayer.id,
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      handicap: competitionPlayer.handicap,
      gamesPlayed: sql<number>`(
        SELECT count(*)::int
        FROM sm5_scorecard sc
        JOIN game g ON g.id = sc.game_id
        WHERE sc.player_id = ${player.id}
          AND g.competition_id = ${competitionId}
          AND g.exclude = false
      )`,
    })
    .from(competitionPlayer)
    .innerJoin(player, eq(player.id, competitionPlayer.playerId))
    .where(eq(competitionPlayer.competitionId, competitionId))
    .orderBy(asc(player.currentCallsign));
}

// ---------------------------------------------------------------------------
// Enrollment mutations
//
// Each guards the competition's format, so callers on the public standings page can
// invoke them without re-deriving state. Failures come back as values, never throws —
// Next.js redacts thrown Server Action messages in production builds.
// ---------------------------------------------------------------------------

async function assertSoloCompetition(competitionId: string): Promise<string | null> {
  const [comp] = await db
    .select({ format: competition.format })
    .from(competition)
    .where(eq(competition.id, competitionId));
  if (!comp) return "Competition not found.";
  if (comp.format !== "solo") return "This competition is not a solo competition.";
  return null;
}

export async function enrollPlayerInSoloCompetition(
  competitionId: string,
  playerId: string,
  handicap: number,
): Promise<RosterMutationResult> {
  const error = await assertSoloCompetition(competitionId);
  if (error) return { ok: false, error };

  await db
    .insert(competitionPlayer)
    .values({ competitionId, playerId, handicap })
    .onConflictDoUpdate({
      target: [competitionPlayer.competitionId, competitionPlayer.playerId],
      set: { handicap },
    });
  return { ok: true };
}

export type BulkEnrollResult = { ok: true; count: number } | { ok: false; error: string };

/**
 * Enroll every player who has games in the competition but no enrollment row, all at
 * handicap 0. The landing state for a competition newly flagged as solo.
 */
export async function enrollAllUnenrolledInSoloCompetition(
  competitionId: string,
): Promise<BulkEnrollResult> {
  const error = await assertSoloCompetition(competitionId);
  if (error) return { ok: false, error };

  const pending = await getSoloCompetitionUnenrolledPlayers(competitionId);
  if (pending.length === 0) return { ok: true, count: 0 };

  await db
    .insert(competitionPlayer)
    .values(pending.map((p) => ({ competitionId, playerId: p.playerId, handicap: 0 })))
    .onConflictDoNothing();

  return { ok: true, count: pending.length };
}

export async function setSoloCompetitionHandicap(
  entryId: string,
  handicap: number,
): Promise<RosterMutationResult> {
  await db.update(competitionPlayer).set({ handicap }).where(eq(competitionPlayer.id, entryId));
  return { ok: true };
}

export async function removePlayerFromSoloCompetition(
  entryId: string,
): Promise<RosterMutationResult> {
  await db.delete(competitionPlayer).where(eq(competitionPlayer.id, entryId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type SoloStandingsApiRow = SoloStandingsRow & { rank: number };

/** Solo standings for GET /api/competitions/[slug]/standings. */
export async function getSoloCompetitionStandingsData(
  slug: string,
): Promise<SoloStandingsApiRow[] | null> {
  const [comp] = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (!comp) return null;

  const rows = await getSoloCompetitionStandings(comp.id);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}
