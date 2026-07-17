// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  competitionTeam,
  competitionTeamPlayer,
  competitionRound,
  competitionPool,
  competitionRoundTeamPool,
  competitionMatch,
  competitionMatchGame,
  player,
  playerCallsignHistory,
  game,
  sm5GamePenalty,
  sm5GameTeam,
  sm5Scorecard,
  center,
  competition,
} from "../schema";
import { eq, and, ne, asc, desc, ilike, inArray, not, or, sql, type SQL } from "drizzle-orm";
import type { PlayerMedicHitsItem } from "./players";
import type { GameScopeFilter } from "./scope";
import { slugify, resolveUniqueSlug } from "../lib/slug";
import { getTeamLogoUrl } from "../lib/team-logos";
import { getPlayerPictureUrl } from "../lib/player-pictures";

// ---------------------------------------------------------------------------
// Competition lookup
// ---------------------------------------------------------------------------

export async function getCompetitionHostCenterId(competitionId: string): Promise<string | null> {
  const [row] = await db
    .select({ hostCenterId: competition.hostCenterId })
    .from(competition)
    .where(eq(competition.id, competitionId));
  return row?.hostCenterId ?? null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompetitionTeamListItem = {
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
  playerCount: number;
  mercCount: number;
  unassignedCount: number;
};

export type CompetitionTeamRosterEntry = {
  id: string; // competitionTeamPlayer.id — used for removal
  playerId: string;
  iplId: string | null;
  currentCallsign: string;
  isMercenary: boolean;
  hasProfilePicture: boolean;
  pictureVersion: number;
  gamesPlayed: number;
};

export type CompetitionRoundType = "pool" | "finals" | "split-pool" | "wildcard";

export type CompetitionRoundListItem = {
  id: string;
  competitionId: string;
  name: string;
  roundNumber: number;
  type: CompetitionRoundType;
  matchCount: number;
};

export type CompetitionMatchListItem = {
  id: string;
  roundId: string;
  matchNumber: number;
  poolId: string | null;
  poolName: string | null;
  team1Id: string | null;
  team1Name: string;
  team2Id: string | null;
  team2Name: string;
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
  game1StartTime: Date | null;
  game2StartTime: Date | null;
  game1Assigned: boolean;
  game2Assigned: boolean;
};

export type CompetitionMatchDetail = {
  id: string;
  competitionId: string;
  roundId: string;
  team1Id: string | null;
  team1Name: string;
  team2Id: string | null;
  team2Name: string;
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
};

export type MatchGameAssignment = {
  id: string; // competitionMatchGame.id
  gameId: string;
  gameNumber: number;
  gameStartTime: Date;
  gameDescription: string | null;
  team1GameTeamId: string;
  team1ColourEnum: number;
  team2GameTeamId: string;
  team2ColourEnum: number;
};

export type UnassignedCompetitionGame = {
  id: string;
  startTime: Date;
  description: string | null;
  centerName: string;
  teams: {
    id: string; // sm5_game_team.id
    name: string;
    colourEnum: number;
  }[];
};

export type PlayerSearchResult = {
  id: string;
  iplId: string;
  currentCallsign: string;
};

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function getCompetitionTeams(
  competitionId: string,
): Promise<CompetitionTeamListItem[]> {
  const rows = await db
    .select({
      id: competitionTeam.id,
      competitionId: competitionTeam.competitionId,
      name: competitionTeam.name,
      slug: competitionTeam.slug,
      shortName: competitionTeam.shortName,
      hasLogo: competitionTeam.hasLogo,
      logoVersion: competitionTeam.logoVersion,
      playerCount: sql<number>`count(${competitionTeamPlayer.id}) filter (where ${competitionTeamPlayer.isMercenary} = false)::int`,
      mercCount: sql<number>`count(${competitionTeamPlayer.id}) filter (where ${competitionTeamPlayer.isMercenary} = true)::int`,
      unassignedCount: sql<number>`(
        SELECT count(DISTINCT sc.player_id)::int FROM sm5_scorecard sc
        WHERE sc.team_id IN (
          SELECT CASE WHEN cm.team1_id = ${competitionTeam.id} THEN cmg.team1_game_team_id
                      ELSE cmg.team2_game_team_id END
          FROM competition_match cm
          JOIN competition_match_game cmg ON cmg.match_id = cm.id
          WHERE cm.team1_id = ${competitionTeam.id} OR cm.team2_id = ${competitionTeam.id}
        )
        AND sc.player_id NOT IN (
          SELECT player_id FROM competition_team_player
          WHERE competition_team_id = ${competitionTeam.id}
        )
      )`,
    })
    .from(competitionTeam)
    .leftJoin(
      competitionTeamPlayer,
      eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
    )
    .where(eq(competitionTeam.competitionId, competitionId))
    .groupBy(competitionTeam.id)
    .orderBy(asc(competitionTeam.name));

  return rows;
}

export async function getCompetitionTeamById(id: string): Promise<{
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
} | null> {
  const [row] = await db.select().from(competitionTeam).where(eq(competitionTeam.id, id));
  return row ?? null;
}

export async function getCompetitionTeamBySlug(
  competitionId: string,
  slug: string,
): Promise<{
  id: string;
  competitionId: string;
  name: string;
  slug: string;
  shortName: string | null;
  hasLogo: boolean;
  logoVersion: number;
} | null> {
  const [row] = await db
    .select()
    .from(competitionTeam)
    .where(and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.slug, slug)));
  return row ?? null;
}

async function resolveCompetitionTeamSlug(
  competitionId: string,
  baseName: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(baseName);
  return resolveUniqueSlug(base, async (candidate) => {
    const conditions = excludeId
      ? and(
          eq(competitionTeam.competitionId, competitionId),
          eq(competitionTeam.slug, candidate),
          ne(competitionTeam.id, excludeId),
        )
      : and(eq(competitionTeam.competitionId, competitionId), eq(competitionTeam.slug, candidate));
    const [existing] = await db
      .select({ id: competitionTeam.id })
      .from(competitionTeam)
      .where(conditions);
    return !!existing;
  });
}

export async function updateCompetitionTeam(
  id: string,
  data: { competitionId: string; name: string; shortName: string | null },
): Promise<void> {
  const slug = await resolveCompetitionTeamSlug(
    data.competitionId,
    data.shortName ?? data.name,
    id,
  );
  await db
    .update(competitionTeam)
    .set({ name: data.name, shortName: data.shortName, slug })
    .where(eq(competitionTeam.id, id));
}

export async function setCompetitionTeamLogo(id: string, hasLogo: boolean): Promise<void> {
  await db
    .update(competitionTeam)
    .set({ hasLogo, logoVersion: sql`${competitionTeam.logoVersion} + 1` })
    .where(eq(competitionTeam.id, id));
}

export async function setCompetitionTeamPlayerPicture(
  entryId: string,
  hasProfilePicture: boolean,
): Promise<void> {
  await db
    .update(competitionTeamPlayer)
    .set({ hasProfilePicture, pictureVersion: sql`${competitionTeamPlayer.pictureVersion} + 1` })
    .where(eq(competitionTeamPlayer.id, entryId));
}

export async function getCompetitionTeamRoster(
  teamId: string,
): Promise<CompetitionTeamRosterEntry[]> {
  const rows = await db
    .select({
      id: competitionTeamPlayer.id,
      playerId: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      isMercenary: competitionTeamPlayer.isMercenary,
      hasProfilePicture: competitionTeamPlayer.hasProfilePicture,
      pictureVersion: competitionTeamPlayer.pictureVersion,
      gamesPlayed: sql<number>`(
        SELECT count(*)::int FROM sm5_scorecard sc
        WHERE sc.player_id = ${player.id}
          AND sc.team_id IN (
            SELECT CASE WHEN cm.team1_id = ${teamId} THEN cmg.team1_game_team_id
                        ELSE cmg.team2_game_team_id END
            FROM competition_match cm
            JOIN competition_match_game cmg ON cmg.match_id = cm.id
            WHERE cm.team1_id = ${teamId} OR cm.team2_id = ${teamId}
          )
      )`,
    })
    .from(competitionTeamPlayer)
    .innerJoin(player, eq(player.id, competitionTeamPlayer.playerId))
    .where(eq(competitionTeamPlayer.competitionTeamId, teamId))
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export type TeamGameParticipant = {
  playerId: string;
  iplId: string | null;
  currentCallsign: string;
  isMercenary: boolean;
  gamesPlayed: number;
};

export async function getTeamGameParticipants(
  competitionTeamId: string,
): Promise<TeamGameParticipant[]> {
  // Find all players who have a scorecard on this competition team's game-team rows,
  // excluding those already on the official roster.
  // The join path: competition_team -> competition_match (team1_id or team2_id)
  //   -> competition_match_game -> sm5_game_team (the right side) -> sm5_scorecard -> player
  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      isMercenary: sql<boolean>`bool_or(${sm5Scorecard.isMercenary})`,
      gamesPlayed: sql<number>`count(*)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(
      and(
        // scorecard's game team must be one assigned to this competition team
        sql`${sm5Scorecard.teamId} IN (
          SELECT
            CASE
              WHEN cm.team1_id = ${competitionTeamId} THEN cmg.team1_game_team_id
              ELSE cmg.team2_game_team_id
            END
          FROM competition_match cm
          JOIN competition_match_game cmg ON cmg.match_id = cm.id
          WHERE cm.team1_id = ${competitionTeamId} OR cm.team2_id = ${competitionTeamId}
        )`,
        // exclude players already on the official roster
        sql`${sm5Scorecard.playerId} NOT IN (
          SELECT player_id FROM competition_team_player
          WHERE competition_team_id = ${competitionTeamId}
        )`,
      ),
    )
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export type CompetitionTeamPositionStat = {
  playerId: string;
  position: number;
  gamesPlayed: number;
  avgMvp: number;
  avgScore: number;
};

export async function getCompetitionTeamPositionStats(
  teamId: string,
): Promise<CompetitionTeamPositionStat[]> {
  const rows = await db
    .select({
      playerId: sm5Scorecard.playerId,
      position: sm5Scorecard.position,
      gamesPlayed: sql<number>`count(*)::int`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})::float`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .where(
      and(
        sql`${sm5Scorecard.playerId} IS NOT NULL`,
        sql`${sm5Scorecard.teamId} IN (
          SELECT CASE WHEN cm.team1_id = ${teamId} THEN cmg.team1_game_team_id
                      ELSE cmg.team2_game_team_id END
          FROM competition_match cm
          JOIN competition_match_game cmg ON cmg.match_id = cm.id
          WHERE cm.team1_id = ${teamId} OR cm.team2_id = ${teamId}
        )`,
      ),
    )
    .groupBy(sm5Scorecard.playerId, sm5Scorecard.position)
    .orderBy(asc(sm5Scorecard.playerId), asc(sm5Scorecard.position));

  return rows.map((r) => ({
    playerId: r.playerId!,
    position: r.position,
    gamesPlayed: r.gamesPlayed,
    avgMvp: r.avgMvp,
    avgScore: r.avgScore,
  }));
}

export type CompetitionTeamResultItem = {
  colourEnum: number;
  result: "win" | "loss";
  outcome: "score" | "elimination";
  count: number;
};

export async function getCompetitionTeamResultsByColor(
  teamId: string,
): Promise<CompetitionTeamResultItem[]> {
  const rows = await db
    .select({
      colourEnum: sm5GameTeam.colourEnum,
      result: sm5GameTeam.result,
      outcome: game.outcome,
      count: sql<number>`count(*)::int`,
    })
    .from(sm5GameTeam)
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .where(
      sql`${sm5GameTeam.id} IN (
        SELECT CASE WHEN cm.team1_id = ${teamId} THEN cmg.team1_game_team_id
                    ELSE cmg.team2_game_team_id END
        FROM competition_match cm
        JOIN competition_match_game cmg ON cmg.match_id = cm.id
        WHERE cm.team1_id = ${teamId} OR cm.team2_id = ${teamId}
      )`,
    )
    .groupBy(sm5GameTeam.colourEnum, sm5GameTeam.result, game.outcome)
    .orderBy(desc(sm5GameTeam.result), asc(sm5GameTeam.colourEnum), desc(game.outcome));

  return rows
    .filter(
      (r) =>
        (r.result === "win" || r.result === "loss") &&
        (r.outcome === "score" || r.outcome === "elimination"),
    )
    .map((r) => ({
      colourEnum: r.colourEnum,
      result: r.result as "win" | "loss",
      outcome: r.outcome as "score" | "elimination",
      count: r.count,
    }));
}

// A player may only be a non-mercenary roster member of one team per
// competition (mercenary appearances on other teams are unrestricted).
async function findConflictingRosterTeam(
  competitionTeamId: string,
  playerId: string,
): Promise<{ id: string; name: string } | null> {
  const [team] = await db
    .select({ competitionId: competitionTeam.competitionId })
    .from(competitionTeam)
    .where(eq(competitionTeam.id, competitionTeamId));
  if (!team) return null;

  const [conflict] = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeamPlayer)
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionTeamPlayer.competitionTeamId))
    .where(
      and(
        eq(competitionTeam.competitionId, team.competitionId),
        eq(competitionTeamPlayer.playerId, playerId),
        eq(competitionTeamPlayer.isMercenary, false),
        ne(competitionTeamPlayer.competitionTeamId, competitionTeamId),
      ),
    );
  return conflict ?? null;
}

export async function setPlayerMercenary(
  competitionTeamId: string,
  playerId: string,
  isMercenary: boolean,
): Promise<void> {
  if (!isMercenary) {
    const conflict = await findConflictingRosterTeam(competitionTeamId, playerId);
    if (conflict) {
      throw new Error(`Player is already on the roster of "${conflict.name}" for this competition`);
    }
  }
  await db
    .insert(competitionTeamPlayer)
    .values({ competitionTeamId, playerId, isMercenary })
    .onConflictDoUpdate({
      target: [competitionTeamPlayer.competitionTeamId, competitionTeamPlayer.playerId],
      set: { isMercenary },
    });
  // Update all existing scorecards for this player on game-teams belonging to this competition team
  await db
    .update(sm5Scorecard)
    .set({ isMercenary })
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        sql`${sm5Scorecard.teamId} IN (
          SELECT
            CASE
              WHEN cm.team1_id = ${competitionTeamId} THEN cmg.team1_game_team_id
              ELSE cmg.team2_game_team_id
            END
          FROM competition_match cm
          JOIN competition_match_game cmg ON cmg.match_id = cm.id
          WHERE cm.team1_id = ${competitionTeamId} OR cm.team2_id = ${competitionTeamId}
        )`,
      ),
    );
}

export async function createCompetitionTeam(data: {
  competitionId: string;
  name: string;
  shortName?: string | null;
}): Promise<string> {
  const slug = await resolveCompetitionTeamSlug(data.competitionId, data.shortName ?? data.name);
  const [row] = await db
    .insert(competitionTeam)
    .values({ ...data, slug })
    .returning({ id: competitionTeam.id });
  return row.id;
}

export async function deleteCompetitionTeam(id: string): Promise<void> {
  await db.delete(competitionTeam).where(eq(competitionTeam.id, id));
}

export async function addPlayerToCompetitionTeam(
  competitionTeamId: string,
  playerId: string,
): Promise<void> {
  const conflict = await findConflictingRosterTeam(competitionTeamId, playerId);
  if (conflict) {
    throw new Error(`Player is already on the roster of "${conflict.name}" for this competition`);
  }
  await db
    .insert(competitionTeamPlayer)
    .values({ competitionTeamId, playerId })
    .onConflictDoNothing();
}

export async function removePlayerFromCompetitionTeam(entryId: string): Promise<void> {
  await db.delete(competitionTeamPlayer).where(eq(competitionTeamPlayer.id, entryId));
}

// ---------------------------------------------------------------------------
// Player search
// ---------------------------------------------------------------------------

export async function searchPlayersForRoster(
  query: string,
  limit = 10,
): Promise<PlayerSearchResult[]> {
  return db
    .selectDistinct({
      id: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
    })
    .from(player)
    .leftJoin(playerCallsignHistory, eq(playerCallsignHistory.playerId, player.id))
    .where(
      or(
        ilike(player.currentCallsign, `%${query}%`),
        ilike(playerCallsignHistory.callsign, `%${query}%`),
      ),
    )
    .orderBy(asc(player.currentCallsign))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export async function getCompetitionRounds(
  competitionId: string,
): Promise<CompetitionRoundListItem[]> {
  const rows = await db
    .select({
      id: competitionRound.id,
      competitionId: competitionRound.competitionId,
      name: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      type: competitionRound.type,
      matchCount: sql<number>`count(${competitionMatch.id})::int`,
    })
    .from(competitionRound)
    .leftJoin(competitionMatch, eq(competitionMatch.roundId, competitionRound.id))
    .where(eq(competitionRound.competitionId, competitionId))
    .groupBy(competitionRound.id)
    .orderBy(asc(competitionRound.roundNumber));

  return rows;
}

export async function getCompetitionRoundById(
  id: string,
): Promise<CompetitionRoundListItem | null> {
  const [row] = await db
    .select({
      id: competitionRound.id,
      competitionId: competitionRound.competitionId,
      name: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      type: competitionRound.type,
      matchCount: sql<number>`count(${competitionMatch.id})::int`,
    })
    .from(competitionRound)
    .leftJoin(competitionMatch, eq(competitionMatch.roundId, competitionRound.id))
    .where(eq(competitionRound.id, id))
    .groupBy(competitionRound.id);

  return row ?? null;
}

// A wildcard round plays its matches within a single auto-created "Wildcard"
// pool, reusing the split-pool team-assignment and standings machinery.
async function ensureWildcardPool(roundId: string): Promise<void> {
  const existing = await db
    .select({ id: competitionPool.id })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, roundId))
    .limit(1);
  if (existing.length === 0) {
    await createCompetitionPool({ roundId, name: "Wildcard" });
  }
}

export async function createCompetitionRound(data: {
  competitionId: string;
  name: string;
  roundNumber: number;
  type: CompetitionRoundType;
}): Promise<string> {
  const [row] = await db
    .insert(competitionRound)
    .values(data)
    .returning({ id: competitionRound.id });
  if (data.type === "wildcard") await ensureWildcardPool(row.id);
  return row.id;
}

export async function updateCompetitionRound(
  id: string,
  data: { name: string; roundNumber: number; type: CompetitionRoundType },
): Promise<void> {
  await db.update(competitionRound).set(data).where(eq(competitionRound.id, id));
  if (data.type === "wildcard") await ensureWildcardPool(id);
}

export async function deleteCompetitionRound(id: string): Promise<void> {
  await db.delete(competitionRound).where(eq(competitionRound.id, id));
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

export async function getCompetitionMatchesByRound(
  roundId: string,
): Promise<CompetitionMatchListItem[]> {
  const matchRows = await db
    .select({
      id: competitionMatch.id,
      roundId: competitionMatch.roundId,
      matchNumber: competitionMatch.matchNumber,
      poolId: competitionMatch.poolId,
      poolName: competitionPool.name,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
    })
    .from(competitionMatch)
    .leftJoin(competitionPool, eq(competitionPool.id, competitionMatch.poolId))
    .where(eq(competitionMatch.roundId, roundId))
    .orderBy(asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  const teamIds = [
    ...new Set(
      [...matchRows.map((m) => m.team1Id), ...matchRows.map((m) => m.team2Id)].filter(
        (id): id is string => id !== null,
      ),
    ),
  ];

  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: competitionTeam.id, name: competitionTeam.name })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];

  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  const matchIds = matchRows.map((m) => m.id);
  const gameAssignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
      startTime: game.startTime,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .where(inArray(competitionMatchGame.matchId, matchIds));

  const assignedMap = new Map<string, { numbers: Set<number>; startTimes: Map<number, Date> }>();
  for (const a of gameAssignments) {
    if (!assignedMap.has(a.matchId)) {
      assignedMap.set(a.matchId, { numbers: new Set(), startTimes: new Map() });
    }
    const entry = assignedMap.get(a.matchId)!;
    entry.numbers.add(a.gameNumber);
    entry.startTimes.set(a.gameNumber, a.startTime);
  }

  return matchRows.map((m) => {
    const entry = assignedMap.get(m.id);
    return {
      id: m.id,
      roundId: m.roundId,
      matchNumber: m.matchNumber,
      poolId: m.poolId,
      poolName: m.poolName,
      team1Id: m.team1Id,
      team1Name: m.team1Id ? (teamMap.get(m.team1Id) ?? "Unknown") : "TBD",
      team2Id: m.team2Id,
      team2Name: m.team2Id ? (teamMap.get(m.team2Id) ?? "Unknown") : "TBD",
      game1ScheduledStartTime: m.game1ScheduledStartTime,
      game2ScheduledStartTime: m.game2ScheduledStartTime,
      game1StartTime: entry?.startTimes.get(1) ?? null,
      game2StartTime: entry?.startTimes.get(2) ?? null,
      game1Assigned: entry?.numbers.has(1) ?? false,
      game2Assigned: entry?.numbers.has(2) ?? false,
    };
  });
}

export async function getCompetitionMatchById(id: string): Promise<CompetitionMatchDetail | null> {
  const [match] = await db.select().from(competitionMatch).where(eq(competitionMatch.id, id));

  if (!match) return null;

  const teamIds = [match.team1Id, match.team2Id].filter((id): id is string => id !== null);

  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: competitionTeam.id, name: competitionTeam.name })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];

  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return {
    id: match.id,
    competitionId: match.competitionId,
    roundId: match.roundId,
    team1Id: match.team1Id,
    team1Name: match.team1Id ? (teamMap.get(match.team1Id) ?? "Unknown") : "TBD",
    team2Id: match.team2Id,
    team2Name: match.team2Id ? (teamMap.get(match.team2Id) ?? "Unknown") : "TBD",
    game1ScheduledStartTime: match.game1ScheduledStartTime,
    game2ScheduledStartTime: match.game2ScheduledStartTime,
  };
}

export async function reorderCompetitionMatches(
  reorders: { id: string; matchNumber: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    // First pass: set temporary negative values to sidestep the unique constraint
    for (const { id, matchNumber } of reorders) {
      await tx
        .update(competitionMatch)
        .set({ matchNumber: -matchNumber })
        .where(eq(competitionMatch.id, id));
    }
    // Second pass: set the final values
    for (const { id, matchNumber } of reorders) {
      await tx.update(competitionMatch).set({ matchNumber }).where(eq(competitionMatch.id, id));
    }
  });
}

export async function createCompetitionMatch(data: {
  competitionId: string;
  roundId: string;
  poolId?: string | null;
  matchNumber: number;
  team1Id: string | null;
  team2Id: string | null;
}): Promise<string> {
  const [row] = await db
    .insert(competitionMatch)
    .values(data)
    .returning({ id: competitionMatch.id });
  return row.id;
}

export async function deleteCompetitionMatch(id: string): Promise<void> {
  await db.delete(competitionMatch).where(eq(competitionMatch.id, id));
}

export async function updateCompetitionMatchTeams(
  id: string,
  data: { team1Id: string | null; team2Id: string | null; poolId?: string | null },
): Promise<void> {
  await db.update(competitionMatch).set(data).where(eq(competitionMatch.id, id));
}

export async function updateCompetitionMatchSchedule(
  id: string,
  data: { game1ScheduledStartTime: Date | null; game2ScheduledStartTime: Date | null },
): Promise<void> {
  await db.update(competitionMatch).set(data).where(eq(competitionMatch.id, id));
}

// ---------------------------------------------------------------------------
// Pools (split-pool rounds)
// ---------------------------------------------------------------------------

export type CompetitionPoolListItem = {
  id: string;
  roundId: string;
  name: string;
  sortOrder: number;
  teamCount: number;
};

export async function getCompetitionPoolsByRound(
  roundId: string,
): Promise<CompetitionPoolListItem[]> {
  return db
    .select({
      id: competitionPool.id,
      roundId: competitionPool.roundId,
      name: competitionPool.name,
      sortOrder: competitionPool.sortOrder,
      teamCount: sql<number>`count(${competitionRoundTeamPool.id})::int`,
    })
    .from(competitionPool)
    .leftJoin(competitionRoundTeamPool, eq(competitionRoundTeamPool.poolId, competitionPool.id))
    .where(eq(competitionPool.roundId, roundId))
    .groupBy(competitionPool.id)
    .orderBy(asc(competitionPool.sortOrder));
}

export type CompetitionPoolOption = { id: string; name: string };

export async function getCompetitionPoolsForStandings(
  roundId: string,
): Promise<CompetitionPoolOption[]> {
  return db
    .select({ id: competitionPool.id, name: competitionPool.name })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, roundId))
    .orderBy(asc(competitionPool.sortOrder));
}

export async function createCompetitionPool(data: {
  roundId: string;
  name: string;
}): Promise<string> {
  const [{ maxSort }] = await db
    .select({ maxSort: sql<number>`coalesce(max(${competitionPool.sortOrder}), -1)::int` })
    .from(competitionPool)
    .where(eq(competitionPool.roundId, data.roundId));

  const [row] = await db
    .insert(competitionPool)
    .values({ roundId: data.roundId, name: data.name, sortOrder: maxSort + 1 })
    .returning({ id: competitionPool.id });
  return row.id;
}

export async function renameCompetitionPool(id: string, name: string): Promise<void> {
  await db.update(competitionPool).set({ name }).where(eq(competitionPool.id, id));
}

export async function deleteCompetitionPool(id: string): Promise<void> {
  await db.delete(competitionPool).where(eq(competitionPool.id, id));
}

export async function reorderCompetitionPools(
  reorders: { id: string; sortOrder: number }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of reorders) {
      await tx.update(competitionPool).set({ sortOrder }).where(eq(competitionPool.id, id));
    }
  });
}

// ---------------------------------------------------------------------------
// Team <-> pool assignment (split-pool rounds)
// ---------------------------------------------------------------------------

export type CompetitionPoolTeamAssignment = {
  teamId: string;
  teamName: string;
  poolId: string | null;
};

export async function getCompetitionRoundTeamPoolAssignments(
  competitionId: string,
  roundId: string,
): Promise<CompetitionPoolTeamAssignment[]> {
  return db
    .select({
      teamId: competitionTeam.id,
      teamName: competitionTeam.name,
      poolId: competitionRoundTeamPool.poolId,
    })
    .from(competitionTeam)
    .leftJoin(
      competitionRoundTeamPool,
      and(
        eq(competitionRoundTeamPool.teamId, competitionTeam.id),
        eq(competitionRoundTeamPool.roundId, roundId),
      ),
    )
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.name));
}

export async function assignTeamToPool(
  roundId: string,
  teamId: string,
  poolId: string,
): Promise<void> {
  await db
    .insert(competitionRoundTeamPool)
    .values({ roundId, teamId, poolId })
    .onConflictDoUpdate({
      target: [competitionRoundTeamPool.roundId, competitionRoundTeamPool.teamId],
      set: { poolId },
    });
}

export async function unassignTeamFromPool(roundId: string, teamId: string): Promise<void> {
  await db
    .delete(competitionRoundTeamPool)
    .where(
      and(
        eq(competitionRoundTeamPool.roundId, roundId),
        eq(competitionRoundTeamPool.teamId, teamId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Pool-scoped match generation (split-pool rounds)
// ---------------------------------------------------------------------------

export type PoolTeamItem = { id: string; name: string };

export async function getTeamsGroupedByPool(
  roundId: string,
): Promise<Map<string, { poolName: string; teams: PoolTeamItem[] }>> {
  const rows = await db
    .select({
      poolId: competitionPool.id,
      poolName: competitionPool.name,
      poolSortOrder: competitionPool.sortOrder,
      teamId: competitionTeam.id,
      teamName: competitionTeam.name,
    })
    .from(competitionRoundTeamPool)
    .innerJoin(competitionPool, eq(competitionPool.id, competitionRoundTeamPool.poolId))
    .innerJoin(competitionTeam, eq(competitionTeam.id, competitionRoundTeamPool.teamId))
    .where(eq(competitionRoundTeamPool.roundId, roundId))
    .orderBy(asc(competitionPool.sortOrder), asc(competitionTeam.name));

  const result = new Map<string, { poolName: string; teams: PoolTeamItem[] }>();
  for (const row of rows) {
    if (!result.has(row.poolId)) {
      result.set(row.poolId, { poolName: row.poolName, teams: [] });
    }
    result.get(row.poolId)!.teams.push({ id: row.teamId, name: row.teamName });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Match game assignments
// ---------------------------------------------------------------------------

export async function getMatchGameAssignments(matchId: string): Promise<MatchGameAssignment[]> {
  const rows = await db
    .select({
      id: competitionMatchGame.id,
      gameId: competitionMatchGame.gameId,
      gameNumber: competitionMatchGame.gameNumber,
      gameStartTime: game.startTime,
      gameDescription: game.description,
      team1GameTeamId: competitionMatchGame.team1GameTeamId,
      team2GameTeamId: competitionMatchGame.team2GameTeamId,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .where(eq(competitionMatchGame.matchId, matchId))
    .orderBy(asc(competitionMatchGame.gameNumber));

  if (rows.length === 0) return [];

  const teamIds = [
    ...new Set([...rows.map((r) => r.team1GameTeamId), ...rows.map((r) => r.team2GameTeamId)]),
  ];

  const gameTeams = await db
    .select({ id: sm5GameTeam.id, colourEnum: sm5GameTeam.colourEnum })
    .from(sm5GameTeam)
    .where(inArray(sm5GameTeam.id, teamIds));

  const colorMap = new Map(gameTeams.map((t) => [t.id, t.colourEnum]));

  return rows.map((r) => ({
    id: r.id,
    gameId: r.gameId,
    gameNumber: r.gameNumber,
    gameStartTime: r.gameStartTime,
    gameDescription: r.gameDescription,
    team1GameTeamId: r.team1GameTeamId,
    team1ColourEnum: colorMap.get(r.team1GameTeamId) ?? 0,
    team2GameTeamId: r.team2GameTeamId,
    team2ColourEnum: colorMap.get(r.team2GameTeamId) ?? 0,
  }));
}

export async function assignGameToMatch(
  matchId: string,
  gameId: string,
  gameNumber: number,
  team1GameTeamId: string,
  team2GameTeamId: string,
): Promise<void> {
  await db.insert(competitionMatchGame).values({
    matchId,
    gameId,
    gameNumber,
    team1GameTeamId,
    team2GameTeamId,
  });

  // Apply mercenary flags from competition_team_player to the newly assigned game's scorecards.
  // For each side, find players with is_mercenary=true on the roster and mark their scorecards.
  for (const [gameTeamId, side] of [
    [team1GameTeamId, "team1_id"],
    [team2GameTeamId, "team2_id"],
  ] as const) {
    await db
      .update(sm5Scorecard)
      .set({ isMercenary: true })
      .where(
        and(
          eq(sm5Scorecard.teamId, gameTeamId),
          sql`${sm5Scorecard.playerId} IN (
            SELECT ctp.player_id
            FROM competition_team_player ctp
            JOIN competition_match cm ON cm.${sql.raw(side)} = ctp.competition_team_id
            WHERE cm.id = ${matchId}
              AND ctp.is_mercenary = true
          )`,
        ),
      );
  }
}

export async function removeGameFromMatch(matchGameId: string): Promise<void> {
  await db.delete(competitionMatchGame).where(eq(competitionMatchGame.id, matchGameId));
}

export async function getUnassignedCompetitionGames(
  competitionId: string,
): Promise<UnassignedCompetitionGame[]> {
  const assignedGameIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .where(eq(competitionMatch.competitionId, competitionId));

  const gameRows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      description: game.description,
      centerName: center.name,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(and(eq(game.competitionId, competitionId), not(inArray(game.id, assignedGameIds))))
    .orderBy(asc(game.startTime));

  if (gameRows.length === 0) return [];

  const gameIds = gameRows.map((g) => g.id);
  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      id: sm5GameTeam.id,
      name: sm5GameTeam.name,
      colourEnum: sm5GameTeam.colourEnum,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)));

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    if (!teamsByGame.has(t.gameId)) teamsByGame.set(t.gameId, []);
    teamsByGame.get(t.gameId)!.push(t);
  }

  return gameRows.map((g) => ({
    id: g.id,
    startTime: g.startTime,
    description: g.description,
    centerName: g.centerName,
    teams: (teamsByGame.get(g.id) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      colourEnum: t.colourEnum,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Game-page competition management
// ---------------------------------------------------------------------------

export type AvailableMatch = {
  id: string;
  matchNumber: number;
  roundName: string;
  team1Name: string;
  team2Name: string;
  availableGameNumbers: number[];
};

export type GameMatchAssignment = {
  matchGameId: string;
  matchId: string;
  matchNumber: number;
  gameNumber: number;
  roundName: string;
  team1GameTeamId: string;
  team1Name: string;
  team2GameTeamId: string;
  team2Name: string;
};

export async function getAvailableMatchesForGame(competitionId: string): Promise<AvailableMatch[]> {
  const matchRows = await db
    .select({
      id: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundName: competitionRound.name,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  const teamIds = [
    ...new Set(
      [...matchRows.map((m) => m.team1Id), ...matchRows.map((m) => m.team2Id)].filter(
        (id): id is string => id !== null,
      ),
    ),
  ];
  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: competitionTeam.id, name: competitionTeam.name })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  const matchIds = matchRows.map((m) => m.id);
  const assignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
    })
    .from(competitionMatchGame)
    .where(inArray(competitionMatchGame.matchId, matchIds));

  const takenMap = new Map<string, Set<number>>();
  for (const a of assignments) {
    if (!takenMap.has(a.matchId)) takenMap.set(a.matchId, new Set());
    takenMap.get(a.matchId)!.add(a.gameNumber);
  }

  return matchRows
    .map((m) => {
      const taken = takenMap.get(m.id) ?? new Set();
      const availableGameNumbers = [1, 2].filter((n) => !taken.has(n));
      return {
        id: m.id,
        matchNumber: m.matchNumber,
        roundName: m.roundName,
        team1Name: m.team1Id ? (teamMap.get(m.team1Id) ?? "Unknown") : "TBD",
        team2Name: m.team2Id ? (teamMap.get(m.team2Id) ?? "Unknown") : "TBD",
        availableGameNumbers,
      };
    })
    .filter((m) => m.availableGameNumbers.length > 0);
}

// ---------------------------------------------------------------------------
// Competition admin game tables
// ---------------------------------------------------------------------------

export type CompetitionUnassignedGame = {
  id: string;
  slug: string;
  startTime: Date;
  description: string | null;
  centerName: string;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
};

export type CompetitionAssignedGame = {
  id: string;
  slug: string;
  matchGameId: string;
  roundName: string;
  matchNumber: number;
  gameNumber: number;
  team1Name: string;
  team1ColourEnum: number;
  team2Name: string;
  team2ColourEnum: number;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
};

export async function getCompetitionUnassignedGamesForAdmin(
  competitionId: string,
): Promise<CompetitionUnassignedGame[]> {
  const assignedIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .where(eq(competitionMatch.competitionId, competitionId));

  return db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      startTime: game.startTime,
      description: game.description,
      centerName: center.name,
      outcome: game.outcome,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(
      and(
        eq(game.competitionId, competitionId),
        not(inArray(game.id, assignedIds)),
        eq(game.exclude, false),
      ),
    )
    .orderBy(asc(game.startTime));
}

export async function getCompetitionAssignedGamesForAdmin(
  competitionId: string,
): Promise<CompetitionAssignedGame[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      matchGameId: competitionMatchGame.id,
      roundName: competitionRound.name,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      team1ColourEnum: sql<number>`t1.colour_enum`,
      team2ColourEnum: sql<number>`t2.colour_enum`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (rows.length === 0) return [];

  const teamIds = [
    ...new Set(
      [...rows.map((r) => r.team1Id), ...rows.map((r) => r.team2Id)].filter(
        (id): id is string => id !== null,
      ),
    ),
  ];
  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: competitionTeam.id, name: competitionTeam.name })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    matchGameId: r.matchGameId,
    roundName: r.roundName,
    matchNumber: r.matchNumber,
    gameNumber: r.gameNumber,
    team1Name: r.team1Id ? (teamMap.get(r.team1Id) ?? "Unknown") : "TBD",
    team1ColourEnum: r.team1ColourEnum,
    team2Name: r.team2Id ? (teamMap.get(r.team2Id) ?? "Unknown") : "TBD",
    team2ColourEnum: r.team2ColourEnum,
    startTime: r.startTime,
    outcome: r.outcome,
    centerName: r.centerName,
  }));
}

export type CompetitionGameNav = {
  prevSlug: string | null;
  nextSlug: string | null;
  position: number;
  total: number;
};

export async function getCompetitionGameNavigation(
  competitionId: string,
  currentGameId: string,
): Promise<CompetitionGameNav | null> {
  const rows = await db
    .select({
      gameId: competitionMatchGame.gameId,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  const idx = rows.findIndex((r) => r.gameId === currentGameId);
  if (idx === -1) return null;

  return {
    prevSlug: idx > 0 ? rows[idx - 1].slug : null,
    nextSlug: idx < rows.length - 1 ? rows[idx + 1].slug : null,
    position: idx + 1,
    total: rows.length,
  };
}

// ---------------------------------------------------------------------------
// Competitive competition list (public-facing pages)
// ---------------------------------------------------------------------------

export type CompetitiveCompetitionSummary = {
  id: string;
  name: string;
  slug: string;
  state: "preshow" | "upcoming" | "active" | "completed";
  startDate: string;
  endDate: string | null;
  challongeLink: string | null;
  challongeBracketHeight: number | null;
};

export async function getCompetitiveCompetitions(): Promise<CompetitiveCompetitionSummary[]> {
  return db
    .select({
      id: competition.id,
      name: competition.name,
      slug: competition.slug,
      state: competition.state,
      startDate: competition.startDate,
      endDate: competition.endDate,
      challongeLink: competition.challongeLink,
      challongeBracketHeight: competition.challongeBracketHeight,
    })
    .from(competition)
    .where(and(eq(competition.type, "competitive"), ne(competition.state, "preshow")))
    .orderBy(desc(competition.startDate));
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type CompetitionStandingsRow = {
  teamId: string;
  teamName: string;
  teamSlug: string;
  teamShortName: string | null;
  teamHasLogo: boolean;
  teamLogoVersion: number;
  teamLogoUrl: string | null;
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  teamEliminations: number; // # of games where the opposing team was fully eliminated
  scoreFor: number;
  scoreAgainst: number;
};

type StandingsGameRow = {
  matchId: string;
  gameNumber: number;
  team1Id: string | null;
  team1Score: number;
  team1Result: string;
  team1EliminatedOpponent: boolean;
  team2Id: string | null;
  team2Score: number;
  team2Result: string;
  team2EliminatedOpponent: boolean;
};

type TeamStatsAccumulator = {
  matchPoints: number;
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  gameWins: number;
  gameLosses: number;
  gameDraws: number;
  teamEliminations: number;
  scoreFor: number;
  scoreAgainst: number;
};

// Accumulates per-team match/game stats from a set of match-game rows.
// Shared by the overall round standings and per-pool standings (split-pool rounds).
function computeTeamStats(gameRows: StandingsGameRow[]): Map<string, TeamStatsAccumulator> {
  // Group games by match (matches always have both teams assigned once games are linked)
  const matchMap = new Map<
    string,
    { team1Id: string; team2Id: string; games: StandingsGameRow[] }
  >();
  for (const row of gameRows) {
    if (row.team1Id === null || row.team2Id === null) continue;
    if (!matchMap.has(row.matchId)) {
      matchMap.set(row.matchId, { team1Id: row.team1Id, team2Id: row.team2Id, games: [] });
    }
    matchMap.get(row.matchId)!.games.push(row);
  }

  const stats = new Map<string, TeamStatsAccumulator>();

  function ensureTeam(id: string) {
    if (!stats.has(id)) {
      stats.set(id, {
        matchPoints: 0,
        matchWins: 0,
        matchLosses: 0,
        matchDraws: 0,
        gameWins: 0,
        gameLosses: 0,
        gameDraws: 0,
        teamEliminations: 0,
        scoreFor: 0,
        scoreAgainst: 0,
      });
    }
    return stats.get(id)!;
  }

  for (const [, { team1Id, team2Id, games }] of matchMap) {
    const t1 = ensureTeam(team1Id);
    const t2 = ensureTeam(team2Id);

    let t1TotalScore = 0;
    let t2TotalScore = 0;

    for (const g of games) {
      const t1s = Number(g.team1Score ?? 0);
      const t2s = Number(g.team2Score ?? 0);
      t1TotalScore += t1s;
      t2TotalScore += t2s;

      t1.scoreFor += t1s;
      t1.scoreAgainst += t2s;
      t2.scoreFor += t2s;
      t2.scoreAgainst += t1s;

      if (g.team1EliminatedOpponent) t1.teamEliminations += 1;
      if (g.team2EliminatedOpponent) t2.teamEliminations += 1;

      const r1 = g.team1Result;
      const r2 = g.team2Result;
      if (r1 === "win") {
        t1.gameWins += 1;
        t2.gameLosses += 1;
      } else if (r2 === "win") {
        t2.gameWins += 1;
        t1.gameLosses += 1;
      } else {
        t1.gameDraws += 1;
        t2.gameDraws += 1;
      }
    }

    // Match bonus: compare combined scores. Only awarded once the match is complete
    // (both games reported) — an in-progress match shouldn't grant the win/draw bonus yet.
    if (games.length >= 2) {
      if (t1TotalScore > t2TotalScore) {
        t1.matchPoints += 2;
        t1.matchWins += 1;
        t2.matchLosses += 1;
      } else if (t2TotalScore > t1TotalScore) {
        t2.matchPoints += 2;
        t2.matchWins += 1;
        t1.matchLosses += 1;
      } else {
        t1.matchPoints += 1;
        t1.matchDraws += 1;
        t2.matchPoints += 1;
        t2.matchDraws += 1;
      }
    }
  }

  // Also add game points into matchPoints (2 per game win, 1 per draw)
  for (const s of stats.values()) {
    s.matchPoints += s.gameWins * 2 + s.gameDraws;
  }

  return stats;
}

export async function getCompetitionStandings(
  competitionId: string,
  roundId?: string,
  poolId?: string,
): Promise<CompetitionStandingsRow[]> {
  // Pull every assigned match-game with both teams' scores and results.
  // We need:
  //   - match-level W/L/D (compare combined score+elim_bonus across both games)
  //   - game-level W/L/D (sm5_game_team.result per game)
  //   - full-team eliminations (opposing sm5_game_team.eliminated = true)
  //   - score totals for ratio
  //
  // Standings are computed from 'pool' and 'split-pool' rounds; optionally narrowed to a
  // single round and/or a single pool (for split-pool rounds).

  const gameRows: StandingsGameRow[] = await db
    .select({
      matchId: competitionMatch.id,
      gameNumber: competitionMatchGame.gameNumber,
      // team1 perspective
      team1Id: competitionMatch.team1Id,
      team1Score: sql<number>`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team1Result: sql<string>`t1.result`,
      team1EliminatedOpponent: sql<boolean>`t2.eliminated`,
      // team2 perspective
      team2Id: competitionMatch.team2Id,
      team2Score: sql<number>`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
      team2Result: sql<string>`t2.result`,
      team2EliminatedOpponent: sql<boolean>`t1.eliminated`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        roundId ? eq(competitionMatch.roundId, roundId) : ne(competitionRound.type, "finals"),
        poolId ? eq(competitionMatch.poolId, poolId) : undefined,
      ),
    );

  const stats = computeTeamStats(gameRows);

  // Fetch team names (including 0-game teams). For a specific pool, only include teams
  // assigned to that pool; otherwise all teams in the competition.
  const allTeams = poolId
    ? await db
        .select({
          id: competitionTeam.id,
          name: competitionTeam.name,
          slug: competitionTeam.slug,
          shortName: competitionTeam.shortName,
          hasLogo: competitionTeam.hasLogo,
          logoVersion: competitionTeam.logoVersion,
        })
        .from(competitionTeam)
        .innerJoin(
          competitionRoundTeamPool,
          eq(competitionRoundTeamPool.teamId, competitionTeam.id),
        )
        .where(
          and(
            eq(competitionTeam.competitionId, competitionId),
            eq(competitionRoundTeamPool.poolId, poolId),
          ),
        )
        .orderBy(asc(competitionTeam.name))
    : await db
        .select({
          id: competitionTeam.id,
          name: competitionTeam.name,
          slug: competitionTeam.slug,
          shortName: competitionTeam.shortName,
          hasLogo: competitionTeam.hasLogo,
          logoVersion: competitionTeam.logoVersion,
        })
        .from(competitionTeam)
        .where(eq(competitionTeam.competitionId, competitionId))
        .orderBy(asc(competitionTeam.name));

  return allTeams
    .map((team) => {
      const s = stats.get(team.id) ?? {
        matchPoints: 0,
        matchWins: 0,
        matchLosses: 0,
        matchDraws: 0,
        gameWins: 0,
        gameLosses: 0,
        gameDraws: 0,
        teamEliminations: 0,
        scoreFor: 0,
        scoreAgainst: 0,
      };
      return {
        teamId: team.id,
        teamName: team.name,
        teamSlug: team.slug,
        teamShortName: team.shortName,
        teamHasLogo: team.hasLogo,
        teamLogoVersion: team.logoVersion,
        teamLogoUrl: team.hasLogo ? getTeamLogoUrl(team.id, team.logoVersion) : null,
        ...s,
      };
    })
    .sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;

      const ratioA =
        a.scoreAgainst === 0 ? (a.scoreFor === 0 ? 0 : Infinity) : a.scoreFor / a.scoreAgainst;
      const ratioB =
        b.scoreAgainst === 0 ? (b.scoreFor === 0 ? 0 : Infinity) : b.scoreFor / b.scoreAgainst;
      if (ratioB !== ratioA) return ratioB - ratioA;

      return b.gameWins - a.gameWins;
    });
}

// ---------------------------------------------------------------------------
// Match results (standings page)
// ---------------------------------------------------------------------------

export type CompetitionMatchResult = {
  matchId: string;
  matchNumber: number;
  roundId: string;
  roundName: string;
  roundNumber: number;
  team1Id: string | null;
  team1Name: string;
  team1Slug: string | null;
  team1ShortName: string | null;
  team1HasLogo: boolean;
  team1LogoVersion: number;
  team2Id: string | null;
  team2Name: string;
  team2Slug: string | null;
  team2ShortName: string | null;
  team2HasLogo: boolean;
  team2LogoVersion: number;
  games: {
    gameNumber: number;
    gameId: string;
    gameSlug: string;
    startTime: Date;
    team1Score: number | null;
    team2Score: number | null;
    team1Result: string | null;
    team2Result: string | null;
    team1ColourEnum: number;
    team2ColourEnum: number;
  }[];
  game1ScheduledStartTime: Date | null;
  game2ScheduledStartTime: Date | null;
  // match-level outcome (compare combined scores across both games)
  matchWinner: "team1" | "team2" | "draw" | "incomplete";
  team1MatchPoints: number; // match bonus only (2/1/0)
  team2MatchPoints: number;
  team1TotalPoints: number; // game points + match bonus
  team2TotalPoints: number;
};

export async function getCompetitionMatchResults(
  competitionId: string,
  roundId?: string,
  // Defaults to every non-finals round type (finals are shown separately via FinalsContent).
  roundTypes?: CompetitionRoundType | CompetitionRoundType[],
  poolId?: string,
): Promise<CompetitionMatchResult[]> {
  const roundTypeCondition =
    roundTypes === undefined
      ? ne(competitionRound.type, "finals")
      : inArray(competitionRound.type, Array.isArray(roundTypes) ? roundTypes : [roundTypes]);
  const gameRows = await db
    .select({
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundId: competitionRound.id,
      roundName: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
      gameNumber: competitionMatchGame.gameNumber,
      gameId: game.id,
      gameStartTime: game.startTime,
      gameSlug: sql<
        string | null
      >`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      team1Score: sql<
        number | null
      >`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team2Score: sql<
        number | null
      >`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
      team1Result: sql<string | null>`t1.result`,
      team2Result: sql<string | null>`t2.result`,
      team1ColourEnum: sql<number | null>`t1.colour_enum`,
      team2ColourEnum: sql<number | null>`t2.colour_enum`,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.matchId, competitionMatch.id))
    .leftJoin(game, eq(game.id, competitionMatchGame.gameId))
    .leftJoin(center, eq(center.id, game.centerId))
    .leftJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .leftJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(
      and(
        eq(competitionMatch.competitionId, competitionId),
        roundTypeCondition,
        roundId ? eq(competitionMatch.roundId, roundId) : undefined,
        poolId ? eq(competitionMatch.poolId, poolId) : undefined,
      ),
    )
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (gameRows.length === 0) return [];

  // Fetch team names and short names
  const teamIds = [
    ...new Set(
      gameRows.flatMap((r) => [r.team1Id, r.team2Id]).filter((id): id is string => id !== null),
    ),
  ];
  const teams =
    teamIds.length > 0
      ? await db
          .select({
            id: competitionTeam.id,
            name: competitionTeam.name,
            slug: competitionTeam.slug,
            shortName: competitionTeam.shortName,
            hasLogo: competitionTeam.hasLogo,
            logoVersion: competitionTeam.logoVersion,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Group into matches
  const matchOrder: string[] = [];
  const matchMap = new Map<
    string,
    Omit<
      CompetitionMatchResult,
      | "matchWinner"
      | "team1MatchPoints"
      | "team2MatchPoints"
      | "team1TotalPoints"
      | "team2TotalPoints"
    > & { games: CompetitionMatchResult["games"] }
  >();

  for (const row of gameRows) {
    if (!matchMap.has(row.matchId)) {
      matchOrder.push(row.matchId);
      const t1 = row.team1Id ? teamMap.get(row.team1Id) : undefined;
      const t2 = row.team2Id ? teamMap.get(row.team2Id) : undefined;
      matchMap.set(row.matchId, {
        matchId: row.matchId,
        matchNumber: row.matchNumber,
        roundId: row.roundId,
        roundName: row.roundName,
        roundNumber: row.roundNumber,
        team1Id: row.team1Id,
        team1Name: row.team1Id ? (t1?.name ?? "Unknown") : "TBD",
        team1Slug: t1?.slug ?? null,
        team1ShortName: t1?.shortName ?? null,
        team1HasLogo: t1?.hasLogo ?? false,
        team1LogoVersion: t1?.logoVersion ?? 0,
        team2Id: row.team2Id,
        team2Name: row.team2Id ? (t2?.name ?? "Unknown") : "TBD",
        team2Slug: t2?.slug ?? null,
        team2ShortName: t2?.shortName ?? null,
        team2HasLogo: t2?.hasLogo ?? false,
        team2LogoVersion: t2?.logoVersion ?? 0,
        games: [],
        game1ScheduledStartTime: row.game1ScheduledStartTime,
        game2ScheduledStartTime: row.game2ScheduledStartTime,
      });
    }
    if (row.gameId === null || row.gameNumber === null) continue;
    matchMap.get(row.matchId)!.games.push({
      gameNumber: row.gameNumber,
      gameId: row.gameId,
      gameSlug: row.gameSlug!,
      startTime: row.gameStartTime!,
      team1Score: row.team1Score,
      team2Score: row.team2Score,
      team1Result: row.team1Result,
      team2Result: row.team2Result,
      team1ColourEnum: row.team1ColourEnum!,
      team2ColourEnum: row.team2ColourEnum!,
    });
  }

  return matchOrder.map((id) => {
    const m = matchMap.get(id)!;

    // Game points: 2 per win, 1 per draw — always reflect what's been reported so far.
    let t1GamePoints = 0;
    let t2GamePoints = 0;
    for (const g of m.games) {
      if (g.team1Result === "win") {
        t1GamePoints += 2;
      } else if (g.team2Result === "win") {
        t2GamePoints += 2;
      } else {
        t1GamePoints += 1;
        t2GamePoints += 1;
      }
    }

    if (m.games.length < 2) {
      return {
        ...m,
        matchWinner: "incomplete" as const,
        team1MatchPoints: 0,
        team2MatchPoints: 0,
        team1TotalPoints: t1GamePoints,
        team2TotalPoints: t2GamePoints,
      };
    }

    const t1Total = m.games.reduce((s, g) => s + (g.team1Score ?? 0), 0);
    const t2Total = m.games.reduce((s, g) => s + (g.team2Score ?? 0), 0);
    let matchWinner: CompetitionMatchResult["matchWinner"];
    let team1MatchPoints: number;
    let team2MatchPoints: number;
    if (t1Total > t2Total) {
      matchWinner = "team1";
      team1MatchPoints = 2;
      team2MatchPoints = 0;
    } else if (t2Total > t1Total) {
      matchWinner = "team2";
      team1MatchPoints = 0;
      team2MatchPoints = 2;
    } else {
      matchWinner = "draw";
      team1MatchPoints = 1;
      team2MatchPoints = 1;
    }

    return {
      ...m,
      matchWinner,
      team1MatchPoints,
      team2MatchPoints,
      team1TotalPoints: t1GamePoints + team1MatchPoints,
      team2TotalPoints: t2GamePoints + team2MatchPoints,
    };
  });
}

export async function getGameMatchAssignment(gameId: string): Promise<GameMatchAssignment | null> {
  const [row] = await db
    .select({
      matchGameId: competitionMatchGame.id,
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      roundName: competitionRound.name,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      team1GameTeamId: competitionMatchGame.team1GameTeamId,
      team2GameTeamId: competitionMatchGame.team2GameTeamId,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatchGame.gameId, gameId));

  if (!row) return null;

  const teamIds = [row.team1Id, row.team2Id].filter((id): id is string => id !== null);
  const teams =
    teamIds.length > 0
      ? await db
          .select({ id: competitionTeam.id, name: competitionTeam.name })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return {
    matchGameId: row.matchGameId,
    matchId: row.matchId,
    matchNumber: row.matchNumber,
    gameNumber: row.gameNumber,
    roundName: row.roundName,
    team1GameTeamId: row.team1GameTeamId,
    team1Name: row.team1Id ? (teamMap.get(row.team1Id) ?? "Unknown") : "TBD",
    team2GameTeamId: row.team2GameTeamId,
    team2Name: row.team2Id ? (teamMap.get(row.team2Id) ?? "Unknown") : "TBD",
  };
}

// ---------------------------------------------------------------------------
// Forfeit
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Top Players
// ---------------------------------------------------------------------------

export type PositionStats = {
  avgMvp: number | null;
  avgAccuracy: number | null;
  wins: number;
  totalGames: number;
};

export type CompetitionTopPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  avgMvp: number;
  mvpPerMinute: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  wins: number;
  totalGames: number;
  byPosition: Partial<Record<number, PositionStats>>;
};

export type CompetitionTopPlayersOptions = {
  showPool?: boolean;
  showFinals?: boolean;
  showMercs?: boolean;
};

// "Rounds" (showPool) means every non-finals round type, whatever those turn out to be —
// this must stay a "not finals" check rather than an enumerated list so newly added
// round types (beyond pool/split-pool/wildcard) are included automatically.
function roundTypeSqlCondition(showPool: boolean, showFinals: boolean): SQL | null {
  if (showPool && showFinals) return sql`true`;
  if (showPool) return sql`cr.type <> 'finals'`;
  if (showFinals) return sql`cr.type = 'finals'`;
  return null;
}

export async function getCompetitionTopPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTopPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      totalTimeInGameSec: sql<number>`sum(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}) / 1000.0`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      // Per-position stats (positions 1–5)
      p1AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
      p1Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1 and ${sm5GameTeam.result} = 'win')::int`,
      p1Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1)::int`,
      p2AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
      p2Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2 and ${sm5GameTeam.result} = 'win')::int`,
      p2Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2)::int`,
      p3AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
      p3Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3 and ${sm5GameTeam.result} = 'win')::int`,
      p3Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3)::int`,
      p4AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
      p4Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4 and ${sm5GameTeam.result} = 'win')::int`,
      p4Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4)::int`,
      p5AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
      p5Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5 and ${sm5GameTeam.result} = 'win')::int`,
      p5Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  function posStats(
    avgMvp: number | null,
    avgAccuracy: number | null,
    wins: number,
    games: number,
  ): PositionStats | undefined {
    if (Number(games) === 0) return undefined;
    return {
      avgMvp: avgMvp !== null ? Number(avgMvp) : null,
      avgAccuracy: avgAccuracy !== null ? Number(avgAccuracy) : null,
      wins: Number(wins),
      totalGames: Number(games),
    };
  }

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    mvpPerMinute:
      r.totalTimeInGameSec > 0 ? Number(r.totalMvp) / (Number(r.totalTimeInGameSec) / 60) : 0,
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    byPosition: {
      1: posStats(r.p1AvgMvp, r.p1AvgAccuracy, r.p1Wins, r.p1Games),
      2: posStats(r.p2AvgMvp, r.p2AvgAccuracy, r.p2Wins, r.p2Games),
      3: posStats(r.p3AvgMvp, r.p3AvgAccuracy, r.p3Wins, r.p3Games),
      4: posStats(r.p4AvgMvp, r.p4AvgAccuracy, r.p4Wins, r.p4Games),
      5: posStats(r.p5AvgMvp, r.p5AvgAccuracy, r.p5Wins, r.p5Games),
    },
  }));
}

export type CompetitionCommanderPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgMissilesHitOpponent: number;
  nukeSuccessRatio: number | null;
  avgNukeLength: number | null;
  avgNukeEfficiency: number | null;
};

export async function getCompetitionCommanderPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionCommanderPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 1),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgMissilesHitOpponent: sql<number>`avg(${sm5Scorecard.missilesHitOpponent})`,
      nukeSuccessRatio: sql<
        number | null
      >`sum(${sm5Scorecard.nukesDetonated})::float / nullif(sum(${sm5Scorecard.nukesActivated}), 0)`,
      avgNukeLength: sql<number | null>`avg(${sm5Scorecard.averageNukeActivationTime})`,
      avgNukeEfficiency: sql<number | null>`avg(${sm5Scorecard.livesRemovedByNuke})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgMissilesHitOpponent: Number(r.avgMissilesHitOpponent),
    nukeSuccessRatio: r.nukeSuccessRatio !== null ? Number(r.nukeSuccessRatio) : null,
    avgNukeLength: r.avgNukeLength !== null ? Number(r.avgNukeLength) : null,
    avgNukeEfficiency: r.avgNukeEfficiency !== null ? Number(r.avgNukeEfficiency) : null,
  }));
}

export type CompetitionPositionPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
};

export async function getCompetitionTopPlayersByPosition(
  competitionId: string,
  position: number,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionPositionPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypeCondition = roundTypeSqlCondition(showPool, showFinals);
  if (!roundTypeCondition) return [];

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      JOIN game g ON g.id = cmg.game_id
      WHERE cm.competition_id = ${competitionId}
        AND ${roundTypeCondition}
        AND g.exclude = false
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, position),
  ];

  if (!showMercs) {
    conditions.push(eq(sm5Scorecard.isMercenary, false));
  }

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
  }));
}

export type CompetitionHeavyPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgMissilesHitOpponent: number;
};

export async function getCompetitionHeavyPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionHeavyPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 2),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgMissilesHitOpponent: sql<number>`avg(${sm5Scorecard.missilesHitOpponent})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgMissilesHitOpponent: Number(r.avgMissilesHitOpponent),
  }));
}

export type CompetitionScoutPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgShotsHitOpponent3hit: number;
  avgAssists: number;
  avgRapidFire: number | null;
  avgRapidFireDuration: number | null;
};

export async function getCompetitionScoutPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionScoutPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 3),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgShotsHitOpponent3hit: sql<number>`avg(${sm5Scorecard.shotsHitOpponent3hit})`,
      avgAssists: sql<number>`avg(${sm5Scorecard.assists})`,
      avgRapidFire: sql<number | null>`avg(${sm5Scorecard.rapidFire})`,
      avgRapidFireDuration: sql<number | null>`avg(${sm5Scorecard.averageRapidTime})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgShotsHitOpponent3hit: Number(r.avgShotsHitOpponent3hit),
    avgAssists: Number(r.avgAssists),
    avgRapidFire: r.avgRapidFire !== null ? Number(r.avgRapidFire) : null,
    avgRapidFireDuration: r.avgRapidFireDuration !== null ? Number(r.avgRapidFireDuration) : null,
  }));
}

export type CompetitionAmmoPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgAmmoBoost: number | null;
  avgResuppliesGiven: number | null;
  avgDoubleResuppliesGiven: number | null;
};

export async function getCompetitionAmmoPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionAmmoPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 4),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgAmmoBoost: sql<number | null>`avg(${sm5Scorecard.ammoBoost})`,
      avgResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.resuppliesGiven})`,
      avgDoubleResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.doubleResuppliesGiven})`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgAmmoBoost: r.avgAmmoBoost !== null ? Number(r.avgAmmoBoost) : null,
    avgResuppliesGiven: r.avgResuppliesGiven !== null ? Number(r.avgResuppliesGiven) : null,
    avgDoubleResuppliesGiven:
      r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
  }));
}

export type CompetitionMedicPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  wins: number;
  totalGames: number;
  avgScore: number;
  totalScore: number;
  avgMvp: number;
  totalMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgUptime: number;
  avgMedicHits: number;
  avgLifeBoost: number | null;
  avgResuppliesGiven: number | null;
  avgDoubleResuppliesGiven: number | null;
  survivalRate: number;
};

export async function getCompetitionMedicPlayers(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMedicPlayer[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, 5),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})`,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      avgUptime: sql<number>`avg(${sm5Scorecard.uptime}::float / nullif(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}, 0))`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})`,
      avgLifeBoost: sql<number | null>`avg(${sm5Scorecard.lifeBoost})`,
      avgResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.resuppliesGiven})`,
      avgDoubleResuppliesGiven: sql<number | null>`avg(${sm5Scorecard.doubleResuppliesGiven})`,
      survived: sql<number>`count(*) filter (where ${sm5Scorecard.eliminated} = false)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    wins: Number(r.wins),
    totalGames: Number(r.totalGames),
    avgScore: Number(r.avgScore),
    totalScore: Number(r.totalScore),
    avgMvp: Number(r.avgMvp),
    totalMvp: Number(r.totalMvp),
    avgAccuracy: Number(r.avgAccuracy),
    avgHitDiff: Number(r.avgHitDiff),
    avgUptime: Number(r.avgUptime),
    avgMedicHits: Number(r.avgMedicHits),
    avgLifeBoost: r.avgLifeBoost !== null ? Number(r.avgLifeBoost) : null,
    avgResuppliesGiven: r.avgResuppliesGiven !== null ? Number(r.avgResuppliesGiven) : null,
    avgDoubleResuppliesGiven:
      r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
    survivalRate: Number(r.totalGames) > 0 ? Number(r.survived) / Number(r.totalGames) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Scope-aware leaderboard game selection
// ---------------------------------------------------------------------------

/** Raw `g.start_time` range fragments for the aliased subquery (social/all scope only). */
function dateRangeSqlForAlias(filter: { dateFrom?: string; dateTo?: string }): SQL[] {
  const parts: SQL[] = [];
  if (filter.dateFrom) parts.push(sql`g.start_time >= ${filter.dateFrom}::date`);
  if (filter.dateTo) parts.push(sql`g.start_time < (${filter.dateTo}::date + interval '1 day')`);
  return parts;
}

/** Selects games for an aliased `g` game row matching the scope. */
function scopeWhereForAlias(scopeFilter: GameScopeFilter): SQL {
  switch (scopeFilter.scope) {
    case "social": {
      const parts: SQL[] = [sql`g.competition_id IS NULL`];
      if (scopeFilter.centerId) parts.push(sql`g.center_id = ${scopeFilter.centerId}`);
      parts.push(...dateRangeSqlForAlias(scopeFilter));
      return sql.join(parts, sql` AND `);
    }
    case "competition":
      return scopeFilter.competitionId
        ? sql`g.competition_id = ${scopeFilter.competitionId}`
        : sql`g.competition_id IS NOT NULL`;
    case "all": {
      const parts: SQL[] = [];
      if (scopeFilter.centerId) parts.push(sql`g.center_id = ${scopeFilter.centerId}`);
      parts.push(...dateRangeSqlForAlias(scopeFilter));
      return parts.length ? sql.join(parts, sql` AND `) : sql`TRUE`;
    }
  }
}

/**
 * WHERE conditions selecting player scorecards for a leaderboard, across any
 * scope (social / competition / all). For a *specific* competition the games are
 * selected via the match/round structure so the pool/finals toggles apply; for
 * every other scope they are selected straight from the game table by scope.
 * Mercenaries are excluded unless `showMercs`. Returns null when a specific
 * competition's round selection is empty (caller should return no rows).
 */
function leaderboardScopeConditions(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions,
  extra: SQL[] = [],
): SQL[] | null {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  let gameSelect: SQL;
  if (scopeFilter.scope === "competition" && scopeFilter.competitionId) {
    const roundTypeCondition = roundTypeSqlCondition(showPool, showFinals);
    if (!roundTypeCondition) return null;
    gameSelect = sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      JOIN game g ON g.id = cmg.game_id
      WHERE cm.competition_id = ${scopeFilter.competitionId}
        AND ${roundTypeCondition}
        AND g.exclude = false
    )`;
  } else {
    gameSelect = sql`${sm5GameTeam.gameId} IN (
      SELECT g.id FROM game g WHERE g.exclude = false AND (${scopeWhereForAlias(scopeFilter)})
    )`;
  }

  const conditions: SQL[] = [gameSelect, sql`${sm5Scorecard.playerId} IS NOT NULL`, ...extra];
  if (!showMercs) conditions.push(eq(sm5Scorecard.isMercenary, false));
  return conditions;
}

// ---------------------------------------------------------------------------
// Per-position scorecard leaderboards (individual game scorecards, not averages)
// ---------------------------------------------------------------------------

export type CompetitionPositionScorecard = {
  scorecardId: string;
  gameSlug: string;
  playerId: string;
  iplId: string;
  callsign: string;
  score: number;
  mvpPoints: number;
};

export async function getCompetitionPositionScorecards(
  scopeFilter: GameScopeFilter,
  position: number,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionPositionScorecard[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5Scorecard.position, position),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      scorecardId: sm5Scorecard.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      score: sm5Scorecard.score,
      mvpPoints: sm5Scorecard.mvpPoints,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .orderBy(desc(sm5Scorecard.mvpPoints))
    .limit(100);

  return rows.map((r) => ({
    scorecardId: r.scorecardId,
    gameSlug: r.gameSlug,
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    score: Number(r.score),
    mvpPoints: Number(r.mvpPoints),
  }));
}

// ---------------------------------------------------------------------------
// Games and points leaderboards (all positions combined)
// ---------------------------------------------------------------------------

export type CompetitionGamesPlayedItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalGames: number;
};

export type CompetitionTotalScoreItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalScore: number;
};

export type CompetitionTotalTimeItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalTimeMs: number;
};

async function getCompetitionAllPositionRows(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions,
) {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  return db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalGames: sql<number>`count(*)::int`,
      totalScore: sql<number>`sum(${sm5Scorecard.score})::int`,
      totalTimeMs: sql<number>`sum(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime})::bigint`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);
}

export async function getCompetitionGamesPlayed(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionGamesPlayedItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalGames: Number(r.totalGames),
    }))
    .sort((a, b) => b.totalGames - a.totalGames)
    .slice(0, 100);
}

export async function getCompetitionTotalScore(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTotalScoreItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalScore: Number(r.totalScore),
    }))
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 100);
}

export async function getCompetitionTotalTime(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTotalTimeItem[]> {
  const rows = await getCompetitionAllPositionRows(scopeFilter, options);
  return rows
    .map((r) => ({
      playerId: r.playerId,
      iplId: r.iplId,
      callsign: r.callsign,
      totalTimeMs: Number(r.totalTimeMs),
    }))
    .sort((a, b) => b.totalTimeMs - a.totalTimeMs)
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// Miscellaneous Mischief leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMiscMischiefItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalShotsFired: number;
  totalAssists: number;
  totalPenalties: number;
  totalEliminations: number;
  totalResets: number;
  totalTeamResets: number;
  totalTimesReset: number;
  unusedSp: number | null;
  totalResupplyDowntimeMs: number;
  totalDoubleResuppliesGiven: number | null;
};

export async function getCompetitionMiscMischief(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMiscMischiefItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalShotsFired: sql<number>`sum(${sm5Scorecard.shotsFired})::int`,
      totalAssists: sql<number>`sum(${sm5Scorecard.assists})::int`,
      totalPenalties: sql<number>`sum((select count(*) from ${sm5GamePenalty} where ${sm5GamePenalty.scorecardId} = ${sm5Scorecard.id} and ${sm5GamePenalty.rescinded} = false))::int`,
      totalEliminations: sql<number>`sum(${sm5Scorecard.eliminatedOpponent})::int`,
      totalResets: sql<number>`sum(${sm5Scorecard.resetOpponent} + ${sm5Scorecard.missileResetOpponent})::int`,
      totalTeamResets: sql<number>`sum(${sm5Scorecard.resetTeam} + ${sm5Scorecard.missileResetTeam})::int`,
      totalTimesReset: sql<number>`sum(${sm5Scorecard.timesReset} + ${sm5Scorecard.timesResetByMissile})::int`,
      unusedSp: sql<
        number | null
      >`sum(${sm5Scorecard.spEarned} - ${sm5Scorecard.spSpent}) filter (where ${sm5Scorecard.spEarned} is not null and ${sm5Scorecard.spSpent} is not null)`,
      totalResupplyDowntimeMs: sql<number>`sum(${sm5Scorecard.resupplyDowntime})::bigint`,
      totalDoubleResuppliesGiven: sql<
        number | null
      >`sum(${sm5Scorecard.doubleResuppliesGiven}) filter (where ${sm5Scorecard.doubleResuppliesGiven} is not null)`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalShotsFired: Number(r.totalShotsFired),
    totalAssists: Number(r.totalAssists),
    totalPenalties: Number(r.totalPenalties),
    totalEliminations: Number(r.totalEliminations),
    totalResets: Number(r.totalResets),
    totalTeamResets: Number(r.totalTeamResets),
    totalTimesReset: Number(r.totalTimesReset),
    unusedSp: r.unusedSp !== null ? Number(r.unusedSp) : null,
    totalResupplyDowntimeMs: Number(r.totalResupplyDowntimeMs),
    totalDoubleResuppliesGiven:
      r.totalDoubleResuppliesGiven !== null ? Number(r.totalDoubleResuppliesGiven) : null,
  }));
}

// ---------------------------------------------------------------------------
// Nuke Nonsense leaderboards
// ---------------------------------------------------------------------------

export type CompetitionNukeNonsenseItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  nukesDetonated: number;
  nukesCanceled: number;
  teamNukesCanceled: number;
  avgNukeActivationTime: number | null;
  livesRemovedByNuke: number;
};

export async function getCompetitionNukeNonsense(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionNukeNonsenseItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      nukesDetonated: sql<number>`coalesce(sum(${sm5Scorecard.nukesDetonated}), 0)::int`,
      nukesCanceled: sql<number>`sum(${sm5Scorecard.nukesCanceled})::int`,
      teamNukesCanceled: sql<number>`sum(${sm5Scorecard.teamNukesCanceled})::int`,
      avgNukeActivationTime: sql<
        number | null
      >`avg(${sm5Scorecard.averageNukeActivationTime}) filter (where ${sm5Scorecard.averageNukeActivationTime} is not null)`,
      livesRemovedByNuke: sql<number>`coalesce(sum(${sm5Scorecard.livesRemovedByNuke}), 0)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    nukesDetonated: Number(r.nukesDetonated),
    nukesCanceled: Number(r.nukesCanceled),
    teamNukesCanceled: Number(r.teamNukesCanceled),
    avgNukeActivationTime:
      r.avgNukeActivationTime !== null ? Number(r.avgNukeActivationTime) : null,
    livesRemovedByNuke: Number(r.livesRemovedByNuke),
  }));
}

// ---------------------------------------------------------------------------
// Missile Malarkey leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMissileMalarkeyItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalMissiles: number;
  avgMissiles: number;
  timesHitByMissile: number;
  teamMissiles: number;
};

export async function getCompetitionMissileMalarkey(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMissileMalarkeyItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent} + ${sm5Scorecard.missilesHitTeam})::int`,
      avgMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent} + ${sm5Scorecard.missilesHitTeam})::float / nullif(count(*) filter (where ${sm5Scorecard.position} in (1, 2)), 0)`,
      timesHitByMissile: sql<number>`sum(${sm5Scorecard.timesHitByMissile})::int`,
      teamMissiles: sql<number>`sum(${sm5Scorecard.missilesHitTeam})::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalMissiles: Number(r.totalMissiles),
    avgMissiles: Number(r.avgMissiles),
    timesHitByMissile: Number(r.timesHitByMissile),
    teamMissiles: Number(r.teamMissiles),
  }));
}

// ---------------------------------------------------------------------------
// Medic Tomfoolery leaderboards
// ---------------------------------------------------------------------------

export type CompetitionMedicTomfooleryItem = {
  playerId: string;
  iplId: string;
  callsign: string;
  totalMedicHits: number;
  ownMedicHits: number;
  medicOnMedicHits: number;
  medicKills: number;
};

export async function getCompetitionMedicTomfoolery(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMedicTomfooleryItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options);
  if (!conditions) return [];

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
      ownMedicHits: sql<number>`sum(${sm5Scorecard.teamMedicHits})::int`,
      medicOnMedicHits: sql<number>`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)::int`,
      medicKills: sql<number>`sum(${sm5Scorecard.eliminatedOpponentMedic})::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  return rows.map((r) => ({
    playerId: r.playerId,
    iplId: r.iplId,
    callsign: r.callsign,
    totalMedicHits: Number(r.totalMedicHits),
    ownMedicHits: Number(r.ownMedicHits),
    medicOnMedicHits: r.medicOnMedicHits !== null ? Number(r.medicOnMedicHits) : 0,
    medicKills: Number(r.medicKills),
  }));
}

export async function getCompetitionMedicHitsLeaderboard(
  scopeFilter: GameScopeFilter,
  options: CompetitionTopPlayersOptions = {},
): Promise<PlayerMedicHitsItem[]> {
  const conditions = leaderboardScopeConditions(scopeFilter, options, [
    eq(sm5GameTeam.isNeutral, false),
  ]);
  if (!conditions) return [];

  const rows = await db
    .select({
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
      avgMedicHits: sql<number>`avg(${sm5Scorecard.medicHits})::float`,
      gamesPlayed: sql<number>`count(*)::int`,
      totalMedicHitsNonResup: sql<
        number | null
      >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (1, 2, 3))::int`,
      avgMedicHitsNonResup: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} in (1, 2, 3))::float`,
      gamesPlayedNonResup: sql<number>`count(*) filter (where ${sm5Scorecard.position} in (1, 2, 3))::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(player, eq(sm5Scorecard.playerId, player.id))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`sum(${sm5Scorecard.medicHits}) desc`);

  return rows.map((r) => ({
    iplId: r.iplId,
    callsign: r.callsign,
    totalMedicHits: Number(r.totalMedicHits),
    avgMedicHits: Number(r.avgMedicHits),
    gamesPlayed: Number(r.gamesPlayed),
    totalMedicHitsNonResup:
      r.totalMedicHitsNonResup !== null ? Number(r.totalMedicHitsNonResup) : null,
    avgMedicHitsNonResup: r.avgMedicHitsNonResup !== null ? Number(r.avgMedicHitsNonResup) : null,
    gamesPlayedNonResup: Number(r.gamesPlayedNonResup),
  }));
}

export async function createForfeitGame(data: {
  matchId: string;
  competitionId: string;
  centerId: string;
  gameNumber: number;
  team1Id: string;
  team2Id: string;
  forfeitingTeam: "team1" | "team2";
}): Promise<void> {
  await db.transaction(async (tx) => {
    const teams = await tx
      .select({ id: competitionTeam.id, name: competitionTeam.name })
      .from(competitionTeam)
      .where(inArray(competitionTeam.id, [data.team1Id, data.team2Id]));
    const teamMap = new Map(teams.map((t) => [t.id, t.name]));
    const team1Name = teamMap.get(data.team1Id) ?? "Team 1";
    const team2Name = teamMap.get(data.team2Id) ?? "Team 2";

    const winnerName = data.forfeitingTeam === "team1" ? team2Name : team1Name;
    const loserName = data.forfeitingTeam === "team1" ? team1Name : team2Name;

    const [gameRow] = await tx
      .insert(game)
      .values({
        centerId: data.centerId,
        competitionId: data.competitionId,
        startTime: new Date(),
        tdfFilename: "",
        outcome: "forfeit",
        scheduledDuration: 900,
        actualDuration: 0,
        type: "SM5",
        description: "Forfeit",
      })
      .returning({ id: game.id });

    const [winnerTeam] = await tx
      .insert(sm5GameTeam)
      .values({
        gameId: gameRow.id,
        tdfTeamIndex: 0,
        isNeutral: false,
        name: winnerName,
        colourEnum: 0,
        score: 0,
        eliminationBonus: 10000,
        result: "win",
        eliminated: false,
      })
      .returning({ id: sm5GameTeam.id });

    const [loserTeam] = await tx
      .insert(sm5GameTeam)
      .values({
        gameId: gameRow.id,
        tdfTeamIndex: 1,
        isNeutral: false,
        name: loserName,
        colourEnum: 1,
        score: 0,
        eliminationBonus: 0,
        result: "loss",
        eliminated: true,
      })
      .returning({ id: sm5GameTeam.id });

    await tx.insert(sm5GameTeam).values({
      gameId: gameRow.id,
      tdfTeamIndex: 2,
      isNeutral: true,
      name: "Neutral",
      colourEnum: 2,
      score: null,
      eliminationBonus: null,
      result: null,
      eliminated: null,
    });

    // Map team1/team2 game team IDs preserving match team identity
    const team1GameTeamId = data.forfeitingTeam === "team1" ? loserTeam.id : winnerTeam.id;
    const team2GameTeamId = data.forfeitingTeam === "team2" ? loserTeam.id : winnerTeam.id;

    await tx.insert(competitionMatchGame).values({
      matchId: data.matchId,
      gameId: gameRow.id,
      gameNumber: data.gameNumber,
      team1GameTeamId,
      team2GameTeamId,
    });
  });
}

// ---------------------------------------------------------------------------
// All-Star Rankings
// ---------------------------------------------------------------------------

export type AllStarPlayer = {
  playerId: string;
  iplId: string;
  callsign: string;
  positionGames: number;
  totalGames: number;
  avgMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  avgMedicHits: number;
};

export type AllStarRankings = {
  1: AllStarPlayer[];
  2: AllStarPlayer[];
  3: AllStarPlayer[];
  4: AllStarPlayer[];
  5: AllStarPlayer[];
};

export async function getCompetitionAllStarRankings(
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<AllStarRankings> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypeCondition = roundTypeSqlCondition(showPool, showFinals);
  if (!roundTypeCondition) return { 1: [], 2: [], 3: [], 4: [], 5: [] };

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      JOIN game g ON g.id = cmg.game_id
      WHERE cm.competition_id = ${competitionId}
        AND ${roundTypeCondition}
        AND g.exclude = false
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
  ];

  if (!showMercs) {
    conditions.push(eq(sm5Scorecard.isMercenary, false));
  }

  const rows = await db
    .select({
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      totalGames: sql<number>`count(*)::int`,
      p1Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1)::int`,
      p1AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
      p2Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2)::int`,
      p2AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
      p3Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3)::int`,
      p3AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
      p4Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4)::int`,
      p4AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
      p5Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5)::int`,
      p5AvgMvp: sql<
        number | null
      >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgAccuracy: sql<
        number | null
      >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgHitDiff: sql<
        number | null
      >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgMedicHits: sql<
        number | null
      >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  const result: AllStarRankings = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  for (const r of rows) {
    const total = Number(r.totalGames);
    // accuracy/hitDiff/medicHits are NOT NULL columns, so once posGames > 0 (guaranteed
    // by the posGames > total / 2 check below) their averages can never be null.
    const posData: [keyof AllStarRankings, number, number | null, number, number, number][] = [
      [
        1,
        Number(r.p1Games),
        r.p1AvgMvp !== null ? Number(r.p1AvgMvp) : null,
        Number(r.p1AvgAccuracy),
        Number(r.p1AvgHitDiff),
        Number(r.p1AvgMedicHits),
      ],
      [
        2,
        Number(r.p2Games),
        r.p2AvgMvp !== null ? Number(r.p2AvgMvp) : null,
        Number(r.p2AvgAccuracy),
        Number(r.p2AvgHitDiff),
        Number(r.p2AvgMedicHits),
      ],
      [
        3,
        Number(r.p3Games),
        r.p3AvgMvp !== null ? Number(r.p3AvgMvp) : null,
        Number(r.p3AvgAccuracy),
        Number(r.p3AvgHitDiff),
        Number(r.p3AvgMedicHits),
      ],
      [
        4,
        Number(r.p4Games),
        r.p4AvgMvp !== null ? Number(r.p4AvgMvp) : null,
        Number(r.p4AvgAccuracy),
        Number(r.p4AvgHitDiff),
        Number(r.p4AvgMedicHits),
      ],
      [
        5,
        Number(r.p5Games),
        r.p5AvgMvp !== null ? Number(r.p5AvgMvp) : null,
        Number(r.p5AvgAccuracy),
        Number(r.p5AvgHitDiff),
        Number(r.p5AvgMedicHits),
      ],
    ];
    for (const [pos, posGames, avgMvp, avgAccuracy, avgHitDiff, avgMedicHits] of posData) {
      if (posGames > total / 2 && avgMvp !== null) {
        result[pos].push({
          playerId: r.playerId,
          iplId: r.iplId,
          callsign: r.callsign,
          positionGames: posGames,
          totalGames: total,
          avgMvp,
          avgAccuracy,
          avgHitDiff,
          avgMedicHits,
        });
      }
    }
  }

  for (const pos of [1, 2, 3, 4, 5] as const) {
    result[pos].sort((a, b) => b.avgMvp - a.avgMvp);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Competition games list (paginated, with computed label)
// ---------------------------------------------------------------------------

export type CompetitionGameListItem = {
  id: string;
  slug: string;
  centerSlug: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit" | "replay";
  centerName: string;
  description: string | null;
  actualDuration: number;
  prefix: string | null; // e.g. "R1 M1 G1"; null when the game has no match assignment
  team1Label: string;
  team1ColourEnum: number;
  team1Result: "win" | "loss" | "draw" | null;
  team2Label: string;
  team2ColourEnum: number;
  team2Result: "win" | "loss" | "draw" | null;
  teams: {
    colourEnum: number;
    score: number | null;
    eliminationBonus: number | null;
    penaltyScore: number;
    result: "win" | "loss" | "draw" | null;
  }[];
};

async function queryCompetitionGames(
  competitionId: string,
  options: { excluded: boolean },
): Promise<CompetitionGameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      actualDuration: game.actualDuration,
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      team1ColourEnum: sql<number>`t1.colour_enum`,
      team1Result: sql<"win" | "loss" | "draw" | null>`t1.result`,
      team2ColourEnum: sql<number>`t2.colour_enum`,
      team2Result: sql<"win" | "loss" | "draw" | null>`t2.result`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(
      and(eq(competitionMatch.competitionId, competitionId), eq(game.exclude, options.excluded)),
    )
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (rows.length === 0) return [];

  const teamIds = [
    ...new Set(
      rows.flatMap((r) => [r.team1Id, r.team2Id]).filter((id): id is string => id !== null),
    ),
  ];
  const teams =
    teamIds.length > 0
      ? await db
          .select({
            id: competitionTeam.id,
            shortName: competitionTeam.shortName,
            name: competitionTeam.name,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      penaltyScore: sm5GameTeam.penaltyScore,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push(t);
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => {
    const t1 = row.team1Id ? teamMap.get(row.team1Id) : undefined;
    const t2 = row.team2Id ? teamMap.get(row.team2Id) : undefined;
    return {
      id: row.id,
      slug: row.slug,
      centerSlug: row.centerSlug,
      startTime: row.startTime,
      outcome: row.outcome,
      centerName: row.centerName,
      description: row.description,
      actualDuration: row.actualDuration,
      prefix: `R${row.roundNumber} M${row.matchNumber} G${row.gameNumber}`,
      team1Label: t1?.shortName ?? t1?.name ?? "?",
      team1ColourEnum: row.team1ColourEnum,
      team1Result: row.team1Result,
      team2Label: t2?.shortName ?? t2?.name ?? "?",
      team2ColourEnum: row.team2ColourEnum,
      team2Result: row.team2Result,
      teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
        colourEnum: t.colourEnum,
        score: t.score,
        eliminationBonus: t.eliminationBonus,
        penaltyScore: t.penaltyScore ?? 0,
        result: t.result,
      })),
    };
  });
}

export async function getCompetitionGamesList(
  competitionId: string,
): Promise<CompetitionGameListItem[]> {
  return queryCompetitionGames(competitionId, { excluded: false });
}

// Excluded games are not assigned to a competition match (they were aborted,
// replays, etc.), so they're attached to the competition via `game.competitionId`
// directly rather than through `competition_match_game`. Team names come from the
// in-game teams (sm5_game_team) since there's no competition team mapping.
export async function getExcludedCompetitionGames(
  competitionId: string,
): Promise<CompetitionGameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
      actualDuration: game.actualDuration,
    })
    .from(game)
    .innerJoin(center, eq(center.id, game.centerId))
    .where(and(eq(game.competitionId, competitionId), eq(game.exclude, true)))
    .orderBy(desc(game.startTime));

  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);
  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      name: sm5GameTeam.name,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      penaltyScore: sm5GameTeam.penaltyScore,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const t of teamRows) {
    const list = teamsByGame.get(t.gameId) ?? [];
    list.push(t);
    teamsByGame.set(t.gameId, list);
  }

  return rows.map((row) => {
    const [t1, t2] = teamsByGame.get(row.id) ?? [];
    return {
      id: row.id,
      slug: row.slug,
      centerSlug: row.centerSlug,
      startTime: row.startTime,
      outcome: row.outcome,
      centerName: row.centerName,
      description: row.description,
      actualDuration: row.actualDuration,
      prefix: null,
      team1Label: t1?.name ?? "?",
      team1ColourEnum: t1?.colourEnum ?? 0,
      team1Result: t1?.result ?? null,
      team2Label: t2?.name ?? "?",
      team2ColourEnum: t2?.colourEnum ?? 0,
      team2Result: t2?.result ?? null,
      teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
        colourEnum: t.colourEnum,
        score: t.score,
        eliminationBonus: t.eliminationBonus,
        penaltyScore: t.penaltyScore ?? 0,
        result: t.result,
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// Competition Player Stats (API)
// ---------------------------------------------------------------------------

export type CompetitionPlayerStatRow = {
  ipl_id: string | null;
  player_name: string;
  player_picture_url: string | null;
  team_name: string;
  team_logo_url: string | null;
  games_played: number;
  wins: number | null;
  losses: number | null;
  avg_score: number | null;
  avg_mvp: number | null;
  avg_accuracy: number | null;
  total_mvp: number | null;
  overall_hit_diff: number | null;
  total_medic_hits: number | null;
  total_missiles: number | null;
  total_nukes_canceled: number | null;
  total_nukes_detonated: number | null;
  total_rapid_fires: number | null;
  total_ammo_boosts: number | null;
  total_life_boosts: number | null;
  commander_total_games_played: number | null;
  commander_avg_mvp: number | null;
  commander_avg_score: number | null;
  commander_avg_accuracy: number | null;
  commander_avg_hit_diff: number | null;
  commander_avg_medic_hits: number | null;
  commander_total_medic_hits: number | null;
  commander_avg_missiled_opponent: number | null;
  commander_total_missiled_opponent: number | null;
  commander_total_nuke_cancels: number | null;
  heavy_total_games_played: number | null;
  heavy_avg_mvp: number | null;
  heavy_avg_score: number | null;
  heavy_avg_accuracy: number | null;
  heavy_avg_hit_diff: number | null;
  heavy_avg_medic_hits: number | null;
  heavy_total_medic_hits: number | null;
  heavy_avg_missiled_opponent: number | null;
  heavy_total_missiled_opponent: number | null;
  heavy_total_nuke_cancels: number | null;
  scout_total_games_played: number | null;
  scout_avg_mvp: number | null;
  scout_avg_score: number | null;
  scout_avg_accuracy: number | null;
  scout_avg_hit_diff: number | null;
  scout_avg_medic_hits: number | null;
  scout_total_medic_hits: number | null;
  scout_total_nuke_cancels: number | null;
  scout_total_rapid_fires: number | null;
  scout_total_shot_3hit: number | null;
  scout_avg_shot_3_hit: number | null;
  ammo_total_games_played: number | null;
  ammo_avg_mvp: number | null;
  ammo_avg_score: number | null;
  ammo_avg_accuracy: number | null;
  ammo_avg_hit_diff: number | null;
  ammo_avg_medic_hits: number | null;
  ammo_total_medic_hits: number | null;
  ammo_total_boosts: number | null;
  ammo_avg_boosts: number | null;
  ammo_avg_double_resup_ratio: number | null;
  medic_total_games_played: number | null;
  medic_avg_mvp: number | null;
  medic_avg_score: number | null;
  medic_avg_accuracy: number | null;
  medic_avg_hit_diff: number | null;
  medic_avg_medic_hits: number | null;
  medic_total_medic_hits: number | null;
  medic_total_boosts: number | null;
  medic_avg_boosts: number | null;
  medic_avg_double_resup_ratio: number | null;
};

const ZERO_PLAYER_STATS: Omit<
  CompetitionPlayerStatRow,
  "ipl_id" | "player_name" | "player_picture_url" | "team_name" | "team_logo_url"
> = {
  games_played: 0,
  wins: null,
  losses: null,
  avg_score: null,
  avg_mvp: null,
  avg_accuracy: null,
  total_mvp: null,
  overall_hit_diff: null,
  total_medic_hits: null,
  total_missiles: null,
  total_nukes_canceled: null,
  total_nukes_detonated: null,
  total_rapid_fires: null,
  total_ammo_boosts: null,
  total_life_boosts: null,
  commander_total_games_played: null,
  commander_avg_mvp: null,
  commander_avg_score: null,
  commander_avg_accuracy: null,
  commander_avg_hit_diff: null,
  commander_avg_medic_hits: null,
  commander_total_medic_hits: null,
  commander_avg_missiled_opponent: null,
  commander_total_missiled_opponent: null,
  commander_total_nuke_cancels: null,
  heavy_total_games_played: null,
  heavy_avg_mvp: null,
  heavy_avg_score: null,
  heavy_avg_accuracy: null,
  heavy_avg_hit_diff: null,
  heavy_avg_medic_hits: null,
  heavy_total_medic_hits: null,
  heavy_avg_missiled_opponent: null,
  heavy_total_missiled_opponent: null,
  heavy_total_nuke_cancels: null,
  scout_total_games_played: null,
  scout_avg_mvp: null,
  scout_avg_score: null,
  scout_avg_accuracy: null,
  scout_avg_hit_diff: null,
  scout_avg_medic_hits: null,
  scout_total_medic_hits: null,
  scout_total_nuke_cancels: null,
  scout_total_rapid_fires: null,
  scout_total_shot_3hit: null,
  scout_avg_shot_3_hit: null,
  ammo_total_games_played: null,
  ammo_avg_mvp: null,
  ammo_avg_score: null,
  ammo_avg_accuracy: null,
  ammo_avg_hit_diff: null,
  ammo_avg_medic_hits: null,
  ammo_total_medic_hits: null,
  ammo_total_boosts: null,
  ammo_avg_boosts: null,
  ammo_avg_double_resup_ratio: null,
  medic_total_games_played: null,
  medic_avg_mvp: null,
  medic_avg_score: null,
  medic_avg_accuracy: null,
  medic_avg_hit_diff: null,
  medic_avg_medic_hits: null,
  medic_total_medic_hits: null,
  medic_total_boosts: null,
  medic_avg_boosts: null,
  medic_avg_double_resup_ratio: null,
};

export async function getCompetitionPlayerStats(slug: string): Promise<{
  [key: string]: CompetitionPlayerStatRow[];
  alltime: CompetitionPlayerStatRow[];
} | null> {
  const [comp] = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (!comp) return null;

  const rosterRows = await db
    .selectDistinctOn([player.id], {
      playerId: player.id,
      iplId: player.iplId,
      callsign: player.currentCallsign,
      teamName: competitionTeam.name,
      teamId: competitionTeam.id,
      teamHasLogo: competitionTeam.hasLogo,
      teamLogoVersion: competitionTeam.logoVersion,
      rosterEntryId: competitionTeamPlayer.id,
      hasProfilePicture: competitionTeamPlayer.hasProfilePicture,
      pictureVersion: competitionTeamPlayer.pictureVersion,
    })
    .from(competitionTeam)
    .innerJoin(
      competitionTeamPlayer,
      eq(competitionTeamPlayer.competitionTeamId, competitionTeam.id),
    )
    .innerJoin(player, eq(player.id, competitionTeamPlayer.playerId))
    .where(eq(competitionTeam.competitionId, comp.id))
    .orderBy(player.id, asc(competitionTeamPlayer.isMercenary));

  if (rosterRows.length === 0) return { [slug]: [], alltime: [] };

  const playerIds = rosterRows.map((r) => r.playerId);

  function buildAggQuery(extraConds: SQL<unknown>[]) {
    return db
      .select({
        playerId: player.id,
        iplId: player.iplId,
        callsign: player.currentCallsign,
        gamesPlayed: sql<number>`count(*)::int`,
        wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
        losses: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'loss')::int`,
        avgScore: sql<number | null>`avg(${sm5Scorecard.score})`,
        avgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints})`,
        avgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy})`,
        totalMvp: sql<number | null>`sum(${sm5Scorecard.mvpPoints})`,
        overallHitDiff: sql<number | null>`avg(${sm5Scorecard.hitDiff})`,
        totalMedicHits: sql<number>`sum(${sm5Scorecard.medicHits})::int`,
        totalMissiles: sql<number>`sum(${sm5Scorecard.missilesHitOpponent})::int`,
        totalNukesCanceled: sql<number>`sum(${sm5Scorecard.nukesCanceled})::int`,
        totalNukesDetonated: sql<number>`coalesce(sum(${sm5Scorecard.nukesDetonated}), 0)::int`,
        totalRapidFires: sql<number>`coalesce(sum(${sm5Scorecard.rapidFire}), 0)::int`,
        totalAmmoBoosts: sql<number>`coalesce(sum(${sm5Scorecard.ammoBoost}), 0)::int`,
        totalLifeBoosts: sql<number>`coalesce(sum(${sm5Scorecard.lifeBoost}), 0)::int`,
        // Commander (position 1)
        cmdGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 1), 0)::int`,
        cmdAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdAvgMissiledOpponent: sql<
          number | null
        >`avg(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalMissiledOpponent: sql<
          number | null
        >`sum(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 1)`,
        cmdTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 1)`,
        // Heavy (position 2)
        hvyGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 2), 0)::int`,
        hvyAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyAvgMissiledOpponent: sql<
          number | null
        >`avg(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalMissiledOpponent: sql<
          number | null
        >`sum(${sm5Scorecard.missilesHitOpponent}) filter (where ${sm5Scorecard.position} = 2)`,
        hvyTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 2)`,
        // Scout (position 3)
        sctGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 3), 0)::int`,
        sctAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalNukeCancels: sql<
          number | null
        >`sum(${sm5Scorecard.nukesCanceled}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalRapidFires: sql<
          number | null
        >`sum(${sm5Scorecard.rapidFire}) filter (where ${sm5Scorecard.position} = 3)`,
        sctTotalShot3hit: sql<
          number | null
        >`sum(${sm5Scorecard.shotsHitOpponent3hit}) filter (where ${sm5Scorecard.position} = 3)`,
        sctAvgShot3hit: sql<
          number | null
        >`avg(${sm5Scorecard.shotsHitOpponent3hit}) filter (where ${sm5Scorecard.position} = 3)`,
        // Ammo Carrier (position 4)
        ammoGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 4), 0)::int`,
        ammoAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoTotalBoosts: sql<
          number | null
        >`sum(${sm5Scorecard.ammoBoost}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgBoosts: sql<
          number | null
        >`avg(${sm5Scorecard.ammoBoost}) filter (where ${sm5Scorecard.position} = 4)`,
        ammoAvgDoubleResupRatio: sql<
          number | null
        >`avg(${sm5Scorecard.doubleResuppliesGiven}::float / nullif(${sm5Scorecard.resuppliesGiven}, 0)) filter (where ${sm5Scorecard.position} = 4)`,
        // Medic (position 5)
        medGames: sql<
          number | null
        >`nullif(count(*) filter (where ${sm5Scorecard.position} = 5), 0)::int`,
        medAvgMvp: sql<
          number | null
        >`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgScore: sql<
          number | null
        >`avg(${sm5Scorecard.score}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgAccuracy: sql<
          number | null
        >`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgHitDiff: sql<
          number | null
        >`avg(${sm5Scorecard.hitDiff}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgMedicHits: sql<
          number | null
        >`avg(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
        medTotalMedicHits: sql<
          number | null
        >`sum(${sm5Scorecard.medicHits}) filter (where ${sm5Scorecard.position} = 5)`,
        medTotalBoosts: sql<
          number | null
        >`sum(${sm5Scorecard.lifeBoost}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgBoosts: sql<
          number | null
        >`avg(${sm5Scorecard.lifeBoost}) filter (where ${sm5Scorecard.position} = 5)`,
        medAvgDoubleResupRatio: sql<
          number | null
        >`avg(${sm5Scorecard.doubleResuppliesGiven}::float / nullif(${sm5Scorecard.resuppliesGiven}, 0)) filter (where ${sm5Scorecard.position} = 5)`,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
      .innerJoin(game, eq(game.id, sm5GameTeam.gameId))
      .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
      .where(and(inArray(sm5Scorecard.playerId, playerIds), eq(game.exclude, false), ...extraConds))
      .groupBy(player.id, player.iplId, player.currentCallsign);
  }

  const [compRows, alltimeRows] = await Promise.all([
    buildAggQuery([
      sql`${sm5GameTeam.gameId} IN (
        SELECT cmg.game_id
        FROM competition_match_game cmg
        JOIN competition_match cm ON cm.id = cmg.match_id
        WHERE cm.competition_id = ${comp.id}
      )`,
      eq(sm5Scorecard.isMercenary, false),
    ]),
    buildAggQuery([]),
  ]);

  function mapRow(
    r: (typeof compRows)[number] | undefined,
    iplId: string | null,
    callsign: string,
    playerPictureUrl: string | null,
    teamName: string,
    teamLogoUrl: string | null,
  ): CompetitionPlayerStatRow {
    if (!r) {
      return {
        ipl_id: iplId,
        player_name: callsign,
        player_picture_url: playerPictureUrl,
        team_name: teamName,
        team_logo_url: teamLogoUrl,
        ...ZERO_PLAYER_STATS,
      };
    }
    const n = (v: number | null) => (v !== null ? Number(v) : null);
    return {
      ipl_id: r.iplId,
      player_name: r.callsign,
      player_picture_url: playerPictureUrl,
      team_name: teamName,
      team_logo_url: teamLogoUrl,
      games_played: Number(r.gamesPlayed),
      wins: Number(r.wins),
      losses: Number(r.losses),
      avg_score: n(r.avgScore),
      avg_mvp: n(r.avgMvp),
      avg_accuracy: n(r.avgAccuracy),
      total_mvp: n(r.totalMvp),
      overall_hit_diff: n(r.overallHitDiff),
      total_medic_hits: Number(r.totalMedicHits),
      total_missiles: Number(r.totalMissiles),
      total_nukes_canceled: Number(r.totalNukesCanceled),
      total_nukes_detonated: Number(r.totalNukesDetonated),
      total_rapid_fires: Number(r.totalRapidFires),
      total_ammo_boosts: Number(r.totalAmmoBoosts),
      total_life_boosts: Number(r.totalLifeBoosts),
      commander_total_games_played: n(r.cmdGames),
      commander_avg_mvp: n(r.cmdAvgMvp),
      commander_avg_score: n(r.cmdAvgScore),
      commander_avg_accuracy: n(r.cmdAvgAccuracy),
      commander_avg_hit_diff: n(r.cmdAvgHitDiff),
      commander_avg_medic_hits: n(r.cmdAvgMedicHits),
      commander_total_medic_hits: n(r.cmdTotalMedicHits),
      commander_avg_missiled_opponent: n(r.cmdAvgMissiledOpponent),
      commander_total_missiled_opponent: n(r.cmdTotalMissiledOpponent),
      commander_total_nuke_cancels: n(r.cmdTotalNukeCancels),
      heavy_total_games_played: n(r.hvyGames),
      heavy_avg_mvp: n(r.hvyAvgMvp),
      heavy_avg_score: n(r.hvyAvgScore),
      heavy_avg_accuracy: n(r.hvyAvgAccuracy),
      heavy_avg_hit_diff: n(r.hvyAvgHitDiff),
      heavy_avg_medic_hits: n(r.hvyAvgMedicHits),
      heavy_total_medic_hits: n(r.hvyTotalMedicHits),
      heavy_avg_missiled_opponent: n(r.hvyAvgMissiledOpponent),
      heavy_total_missiled_opponent: n(r.hvyTotalMissiledOpponent),
      heavy_total_nuke_cancels: n(r.hvyTotalNukeCancels),
      scout_total_games_played: n(r.sctGames),
      scout_avg_mvp: n(r.sctAvgMvp),
      scout_avg_score: n(r.sctAvgScore),
      scout_avg_accuracy: n(r.sctAvgAccuracy),
      scout_avg_hit_diff: n(r.sctAvgHitDiff),
      scout_avg_medic_hits: n(r.sctAvgMedicHits),
      scout_total_medic_hits: n(r.sctTotalMedicHits),
      scout_total_nuke_cancels: n(r.sctTotalNukeCancels),
      scout_total_rapid_fires: n(r.sctTotalRapidFires),
      scout_total_shot_3hit: n(r.sctTotalShot3hit),
      scout_avg_shot_3_hit: n(r.sctAvgShot3hit),
      ammo_total_games_played: n(r.ammoGames),
      ammo_avg_mvp: n(r.ammoAvgMvp),
      ammo_avg_score: n(r.ammoAvgScore),
      ammo_avg_accuracy: n(r.ammoAvgAccuracy),
      ammo_avg_hit_diff: n(r.ammoAvgHitDiff),
      ammo_avg_medic_hits: n(r.ammoAvgMedicHits),
      ammo_total_medic_hits: n(r.ammoTotalMedicHits),
      ammo_total_boosts: n(r.ammoTotalBoosts),
      ammo_avg_boosts: n(r.ammoAvgBoosts),
      ammo_avg_double_resup_ratio: n(r.ammoAvgDoubleResupRatio),
      medic_total_games_played: n(r.medGames),
      medic_avg_mvp: n(r.medAvgMvp),
      medic_avg_score: n(r.medAvgScore),
      medic_avg_accuracy: n(r.medAvgAccuracy),
      medic_avg_hit_diff: n(r.medAvgHitDiff),
      medic_avg_medic_hits: n(r.medAvgMedicHits),
      medic_total_medic_hits: n(r.medTotalMedicHits),
      medic_total_boosts: n(r.medTotalBoosts),
      medic_avg_boosts: n(r.medAvgBoosts),
      medic_avg_double_resup_ratio: n(r.medAvgDoubleResupRatio),
    };
  }

  const compMap = new Map(compRows.map((r) => [r.playerId, r]));
  const alltimeMap = new Map(alltimeRows.map((r) => [r.playerId, r]));

  return {
    [slug]: rosterRows.map((p) =>
      mapRow(
        compMap.get(p.playerId),
        p.iplId,
        p.callsign,
        p.hasProfilePicture ? getPlayerPictureUrl(p.rosterEntryId, p.pictureVersion) : null,
        p.teamName,
        p.teamHasLogo ? getTeamLogoUrl(p.teamId, p.teamLogoVersion) : null,
      ),
    ),
    alltime: rosterRows.map((p) =>
      mapRow(
        alltimeMap.get(p.playerId),
        p.iplId,
        p.callsign,
        p.hasProfilePicture ? getPlayerPictureUrl(p.rosterEntryId, p.pictureVersion) : null,
        p.teamName,
        p.teamHasLogo ? getTeamLogoUrl(p.teamId, p.teamLogoVersion) : null,
      ),
    ),
  };
}

// ---------------------------------------------------------------------------
// Competition schedule
// ---------------------------------------------------------------------------

export type CompetitionScheduleEntry = {
  gameName: string;
  team1Name: string;
  team2Name: string;
  team1LogoUrl: string | null;
  team2LogoUrl: string | null;
  scheduledStartTime: Date | null;
  actualStartTime: Date | null;
  team1Score: number | null;
  team2Score: number | null;
  scoreDifferential: number | null;
};

export async function getCompetitionSchedule(
  slug: string,
): Promise<CompetitionScheduleEntry[] | null> {
  const comp = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (comp.length === 0) return null;
  const competitionId = comp[0].id;

  // Fetch all matches with round and team info
  const matchRows = await db
    .select({
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundNumber: competitionRound.roundNumber,
      roundType: competitionRound.type,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      game1ScheduledStartTime: competitionMatch.game1ScheduledStartTime,
      game2ScheduledStartTime: competitionMatch.game2ScheduledStartTime,
    })
    .from(competitionMatch)
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(asc(competitionRound.roundNumber), asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  // Fetch team names
  const teamIds = [
    ...new Set(
      matchRows.flatMap((m) => [m.team1Id, m.team2Id]).filter((id): id is string => id !== null),
    ),
  ];
  const teams =
    teamIds.length > 0
      ? await db
          .select({
            id: competitionTeam.id,
            name: competitionTeam.name,
            hasLogo: competitionTeam.hasLogo,
            logoVersion: competitionTeam.logoVersion,
          })
          .from(competitionTeam)
          .where(inArray(competitionTeam.id, teamIds))
      : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Fetch all game assignments with actual scores
  const matchIds = matchRows.map((m) => m.matchId);
  const assignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
      actualStartTime: game.startTime,
      team1Score: sql<
        number | null
      >`t1.score + t1.elimination_bonus + coalesce(t1.penalty_score, 0)`,
      team2Score: sql<
        number | null
      >`t2.score + t2.elimination_bonus + coalesce(t2.penalty_score, 0)`,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .leftJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .leftJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(inArray(competitionMatchGame.matchId, matchIds));

  // Index assignments by matchId + gameNumber
  type AssignmentData = {
    actualStartTime: Date;
    team1Score: number | null;
    team2Score: number | null;
  };
  const assignmentMap = new Map<string, AssignmentData>();
  for (const a of assignments) {
    assignmentMap.set(`${a.matchId}:${a.gameNumber}`, {
      actualStartTime: a.actualStartTime,
      team1Score: a.team1Score,
      team2Score: a.team2Score,
    });
  }

  // Build one entry per game slot
  const entries: CompetitionScheduleEntry[] = [];
  for (const m of matchRows) {
    const isFinals = m.roundType === "finals";
    const roundPrefix = isFinals ? "Finals" : `R${m.roundNumber}`;
    const team1 = m.team1Id ? teamMap.get(m.team1Id) : undefined;
    const team2 = m.team2Id ? teamMap.get(m.team2Id) : undefined;
    const team1Name = m.team1Id ? (team1?.name ?? "TBD") : "TBD";
    const team2Name = m.team2Id ? (team2?.name ?? "TBD") : "TBD";
    const team1LogoUrl =
      m.team1Id && team1?.hasLogo ? getTeamLogoUrl(m.team1Id, team1.logoVersion) : null;
    const team2LogoUrl =
      m.team2Id && team2?.hasLogo ? getTeamLogoUrl(m.team2Id, team2.logoVersion) : null;

    for (const gameNumber of [1, 2] as const) {
      const scheduled = gameNumber === 1 ? m.game1ScheduledStartTime : m.game2ScheduledStartTime;
      const actual = assignmentMap.get(`${m.matchId}:${gameNumber}`);

      // Skip slots with no scheduled time and no actual game
      if (!scheduled && !actual) continue;

      const team1Score = actual?.team1Score ?? null;
      const team2Score = actual?.team2Score ?? null;

      entries.push({
        gameName: `${roundPrefix} M${m.matchNumber} G${gameNumber}`,
        team1Name,
        team2Name,
        team1LogoUrl,
        team2LogoUrl,
        scheduledStartTime: scheduled ?? null,
        actualStartTime: actual?.actualStartTime ?? null,
        team1Score,
        team2Score,
        scoreDifferential:
          team1Score !== null && team2Score !== null ? team1Score - team2Score : null,
      });
    }
  }

  entries.sort((a, b) => {
    if (!a.scheduledStartTime && !b.scheduledStartTime) return 0;
    if (!a.scheduledStartTime) return 1;
    if (!b.scheduledStartTime) return -1;
    return a.scheduledStartTime.getTime() - b.scheduledStartTime.getTime();
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Competition standings (API)
// ---------------------------------------------------------------------------

export type CompetitionStandingsApiRow = Omit<CompetitionStandingsRow, "teamLogoVersion">;

export async function getCompetitionStandingsData(
  slug: string,
): Promise<CompetitionStandingsApiRow[] | null> {
  const [comp] = await db
    .select({ id: competition.id })
    .from(competition)
    .where(eq(competition.slug, slug));
  if (!comp) return null;

  const rows = await getCompetitionStandings(comp.id);
  return rows.map(({ teamLogoVersion, ...rest }) => rest);
}
