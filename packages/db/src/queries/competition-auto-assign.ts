// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Ingest-time auto-assignment of SM5 competition games to match slots. Loads the game and the
 * competition's open matches for the pure decision in lib/match-auto-assign.ts, then assigns
 * through assignGameToMatch so mercenary stamping and match notifications behave exactly as a
 * manual assignment. See docs/Competition_Structure.md, "Auto-assignment".
 */

import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../client";
import {
  competition,
  competitionGameSide,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  competitionTeamPlayer,
  game,
  sm5GameTeam,
  sm5Scorecard,
} from "../schema";
import { hasMatchStructure, teamsPerSide } from "./admin";
import { assignGameToMatch } from "./competition-tournament";
import { enqueueAutoAssignReview } from "./notifications";
import { sideTeamIds } from "../lib/match-points";
import {
  decideAutoAssign,
  type AutoAssignGameSide,
  type AutoAssignMatch,
  type UnrosteredPlayer,
} from "../lib/match-auto-assign";

/** `competition_match_game.assigned_by` for a slot filled by auto-assignment. */
export const AUTO_ASSIGNED_BY = "auto";

export type AutoAssignResult =
  | { status: "assigned"; matchId: string; gameNumber: number; unrostered: UnrosteredPlayer[] }
  | { status: "skipped"; reason: string };

// Postgres unique_violation. Drizzle wraps driver errors, so the code is usually on `cause`.
function isUniqueViolation(err: unknown): boolean {
  for (let e = err, depth = 0; typeof e === "object" && e !== null && depth < 5; depth++) {
    if ("code" in e && e.code === "23505") return true;
    e = "cause" in e ? e.cause : undefined;
  }
  return false;
}

type Loaded =
  | { ok: false; reason: string }
  | {
      ok: true;
      gameStartTime: Date;
      sides: [AutoAssignGameSide, AutoAssignGameSide];
      matches: AutoAssignMatch[];
    };

/**
 * `replay` rebuilds what ingest would have seen for a game that is already assigned, for the
 * eval script: its own assignment and any game that started after it are hidden, and the
 * competition's state is ignored.
 */
async function loadAutoAssignInput(
  gameId: string,
  competitionId: string,
  { replay = false }: { replay?: boolean } = {},
): Promise<Loaded> {
  const [comp] = await db
    .select({
      state: competition.state,
      format: competition.format,
      gameType: competition.gameType,
    })
    .from(competition)
    .where(eq(competition.id, competitionId));
  if (!comp) return { ok: false, reason: "competition not found" };
  if (comp.gameType !== "sm5") return { ok: false, reason: "not an SM5 competition" };
  if (!hasMatchStructure(comp.format)) return { ok: false, reason: "no match structure" };
  // Manual assignment is refused outside an active competition too.
  if (!replay && comp.state !== "active") return { ok: false, reason: "competition not active" };

  const [g] = await db
    .select({ startTime: game.startTime, exclude: game.exclude, competitionId: game.competitionId })
    .from(game)
    .where(eq(game.id, gameId));
  if (!g || g.competitionId !== competitionId) return { ok: false, reason: "not in competition" };
  // An aborted or replayed game would take the slot its replacement belongs in.
  if (g.exclude) return { ok: false, reason: "game excluded" };

  const [already] = await db
    .select({ id: competitionMatchGame.id })
    .from(competitionMatchGame)
    .where(eq(competitionMatchGame.gameId, gameId));
  if (already && !replay) return { ok: false, reason: "already assigned" };

  const teams = await db
    .select({ id: sm5GameTeam.id, colourEnum: sm5GameTeam.colourEnum })
    .from(sm5GameTeam)
    .where(and(eq(sm5GameTeam.gameId, gameId), eq(sm5GameTeam.isNeutral, false)));
  if (teams.length !== 2) return { ok: false, reason: "not a two-team game" };

  const scorecards = await db
    .select({ teamId: sm5Scorecard.teamId, playerId: sm5Scorecard.playerId })
    .from(sm5Scorecard)
    .where(
      and(
        inArray(
          sm5Scorecard.teamId,
          teams.map((t) => t.id),
        ),
        isNotNull(sm5Scorecard.playerId),
      ),
    );
  const sides = teams.map((t): AutoAssignGameSide => ({
    gameTeamId: t.id,
    colourEnum: t.colourEnum,
    playerIds: scorecards.filter((s) => s.teamId === t.id).map((s) => s.playerId!),
  })) as [AutoAssignGameSide, AutoAssignGameSide];

  const perSide = teamsPerSide(comp.format);
  const matchRows = (
    await db
      .select({
        id: competitionMatch.id,
        roundNumber: competitionRound.roundNumber,
        matchNumber: competitionMatch.matchNumber,
        team1Id: competitionMatch.team1Id,
        team1PartnerId: competitionMatch.team1PartnerId,
        team1Partner2Id: competitionMatch.team1Partner2Id,
        team2Id: competitionMatch.team2Id,
        team2PartnerId: competitionMatch.team2PartnerId,
        team2Partner2Id: competitionMatch.team2Partner2Id,
        game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
        game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
      })
      .from(competitionMatch)
      .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
      .where(eq(competitionMatch.competitionId, competitionId))
      .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber))
  )
    .map((m) => ({
      ...m,
      side1: sideTeamIds(m.team1Id, m.team1PartnerId, m.team1Partner2Id).slice(0, perSide),
      side2: sideTeamIds(m.team2Id, m.team2PartnerId, m.team2Partner2Id).slice(0, perSide),
    }))
    // A slot whose team isn't known yet (an unresolved finals slot) can't be matched by roster.
    .filter((m) => m.side1.length === perSide && m.side2.length === perSide);
  if (matchRows.length === 0) return { ok: false, reason: "no matches with both sides set" };

  const matchIds = matchRows.map((m) => m.id);
  const slotted = (
    await db
      .select({
        gameId: competitionMatchGame.gameId,
        matchId: competitionMatchGame.matchId,
        gameNumber: competitionMatchGame.gameNumber,
        startTime: game.startTime,
        side1ColourEnum: competitionGameSide.colourEnum,
      })
      .from(competitionMatchGame)
      .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
      .innerJoin(
        competitionGameSide,
        eq(competitionGameSide.id, competitionMatchGame.team1GameTeamId),
      )
      .where(inArray(competitionMatchGame.matchId, matchIds))
  ).filter(
    (s) => !replay || (s.gameId !== gameId && s.startTime.getTime() < g.startTime.getTime()),
  );

  const teamIds = [...new Set(matchRows.flatMap((m) => [...m.side1, ...m.side2]))];
  const rosterRows = await db
    .select({
      teamId: competitionTeamPlayer.competitionTeamId,
      playerId: competitionTeamPlayer.playerId,
    })
    .from(competitionTeamPlayer)
    .where(inArray(competitionTeamPlayer.competitionTeamId, teamIds));
  const rosterOf = (ids: string[]) =>
    rosterRows.filter((r) => ids.includes(r.teamId)).map((r) => r.playerId);

  const matches = matchRows
    .map((m): AutoAssignMatch => ({
      matchId: m.id,
      roundNumber: m.roundNumber,
      matchNumber: m.matchNumber,
      side1Roster: rosterOf(m.side1),
      side2Roster: rosterOf(m.side2),
      side1TeamIds: m.side1,
      side2TeamIds: m.side2,
      game1ScheduledStartTime: m.game1ScheduledStartTime,
      game2ScheduledStartTime: m.game2ScheduledStartTime,
      slotted: slotted.filter((s) => s.matchId === m.id),
    }))
    .filter((m) => m.slotted.length < 2);

  return { ok: true, gameStartTime: g.startTime, sides, matches };
}

async function attemptAutoAssign(gameId: string, competitionId: string): Promise<AutoAssignResult> {
  const loaded = await loadAutoAssignInput(gameId, competitionId);
  if (!loaded.ok) return { status: "skipped", reason: loaded.reason };

  const decision = decideAutoAssign(loaded);
  if (decision.kind === "skip") return { status: "skipped", reason: decision.reason };

  await assignGameToMatch(
    decision.matchId,
    gameId,
    decision.gameNumber,
    decision.team1GameTeamId,
    decision.team2GameTeamId,
    AUTO_ASSIGNED_BY,
  );
  return {
    status: "assigned",
    matchId: decision.matchId,
    gameNumber: decision.gameNumber,
    unrostered: decision.unrostered,
  };
}

/**
 * Tries to place one competition game in its match slot. Assigns only when exactly one slot
 * fits the rosters; anything less certain is left for an admin. When the assignment carries
 * players on neither roster, admins get an auto_assign_review alert.
 */
export async function autoAssignGame(
  gameId: string,
  competitionId: string,
): Promise<AutoAssignResult> {
  let result: AutoAssignResult;
  try {
    result = await attemptAutoAssign(gameId, competitionId);
  } catch (err) {
    // Another game of the same match took the slot between load and insert: decide again
    // against the slot that is now filled.
    if (!isUniqueViolation(err)) throw err;
    result = await attemptAutoAssign(gameId, competitionId);
  }

  if (result.status === "assigned" && result.unrostered.length > 0) {
    await enqueueAutoAssignReview(gameId, competitionId);
  }
  return result;
}

/** Runs auto-assignment over every unassigned game in a competition, oldest first. */
export async function autoAssignPendingGames(
  competitionId: string,
): Promise<{ assigned: number; skipped: number }> {
  const assignedGameIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .where(eq(competitionMatch.competitionId, competitionId));
  const pending = await db
    .select({ id: game.id })
    .from(game)
    .where(
      and(
        eq(game.competitionId, competitionId),
        eq(game.exclude, false),
        sql`${game.id} NOT IN (${assignedGameIds})`,
      ),
    )
    .orderBy(asc(game.startTime));

  let assigned = 0;
  for (const { id } of pending) {
    const result = await autoAssignGame(id, competitionId);
    if (result.status === "assigned") assigned += 1;
  }
  return { assigned, skipped: pending.length - assigned };
}

export type MatchGameUnrosteredPlayer = {
  gameId: string;
  playerId: string;
  callsign: string;
  side: 1 | 2;
};

/**
 * Players in assigned TDF games who are not on the roster of the side they played for. Derived
 * on read, so the list empties itself as admins roster them. Guests are left out: they have no
 * player to roster.
 */
export async function getMatchGameUnrosteredPlayers(
  gameIds: string[],
): Promise<MatchGameUnrosteredPlayer[]> {
  if (gameIds.length === 0) return [];
  const rows = await db.execute<{
    game_id: string;
    player_id: string;
    callsign: string;
    side: number;
  }>(sql`
    SELECT cmg.game_id, sc.player_id, p.current_callsign AS callsign,
           CASE WHEN sc.team_id = cmg.team1_game_team_id THEN 1 ELSE 2 END AS side
    FROM competition_match_game cmg
    JOIN competition_match cm ON cm.id = cmg.match_id
    JOIN sm5_scorecard sc ON sc.team_id IN (cmg.team1_game_team_id, cmg.team2_game_team_id)
    JOIN player p ON p.id = sc.player_id
    WHERE cmg.game_id IN (${sql.join(
      gameIds.map((id) => sql`${id}`),
      sql`, `,
    )})
      AND NOT EXISTS (
        SELECT 1 FROM competition_team_player ctp
        WHERE ctp.player_id = sc.player_id
          AND CASE WHEN sc.team_id = cmg.team1_game_team_id
                   THEN ctp.competition_team_id IN (cm.team1_id, cm.team1_partner_id, cm.team1_partner2_id)
                   ELSE ctp.competition_team_id IN (cm.team2_id, cm.team2_partner_id, cm.team2_partner2_id)
              END
      )
    ORDER BY side, callsign
  `);
  return rows.map((r) => ({
    gameId: r.game_id,
    playerId: r.player_id,
    callsign: r.callsign,
    side: r.side === 1 ? 1 : 2,
  }));
}

export type AutoAssignReview = {
  gameSlug: string;
  roundName: string;
  matchNumber: number;
  gameNumber: number;
  unrostered: MatchGameUnrosteredPlayer[];
};

/** What the auto_assign_review alert says, read at send time. Null once the game is unassigned. */
export async function getAutoAssignReview(gameId: string): Promise<AutoAssignReview | null> {
  const rows = await db.execute<{
    game_slug: string;
    round_name: string;
    match_number: number;
    game_number: number;
  }>(sql`
    SELECT concat(c.country_code::text, '-', c.site_code::text, '-',
                  to_char(g.start_time, 'YYYYMMDDHH24MISS')) AS game_slug,
           cr.name AS round_name, cm.match_number, cmg.game_number
    FROM competition_match_game cmg
    JOIN competition_match cm ON cm.id = cmg.match_id
    JOIN competition_round cr ON cr.id = cm.round_id
    JOIN game g ON g.id = cmg.game_id
    JOIN center c ON c.id = g.center_id
    WHERE cmg.game_id = ${gameId}
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    gameSlug: row.game_slug,
    roundName: row.round_name,
    matchNumber: row.match_number,
    gameNumber: row.game_number,
    unrostered: await getMatchGameUnrosteredPlayers([gameId]),
  };
}

export type AutoAssignReplay =
  | { status: "skipped"; reason: string }
  | { status: "decided"; matchId: string; gameNumber: number; team1GameTeamId: string };

/**
 * What auto-assignment would decide for an already-assigned game, without writing anything.
 * For eval-auto-assign.ts, which compares it with the real assignment.
 */
export async function replayAutoAssign(
  gameId: string,
  competitionId: string,
): Promise<AutoAssignReplay> {
  const loaded = await loadAutoAssignInput(gameId, competitionId, { replay: true });
  if (!loaded.ok) return { status: "skipped", reason: loaded.reason };
  const decision = decideAutoAssign(loaded);
  if (decision.kind === "skip") return { status: "skipped", reason: decision.reason };
  return {
    status: "decided",
    matchId: decision.matchId,
    gameNumber: decision.gameNumber,
    team1GameTeamId: decision.team1GameTeamId,
  };
}
