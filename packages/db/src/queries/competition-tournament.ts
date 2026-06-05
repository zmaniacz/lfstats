// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  competitionTeam,
  competitionTeamPlayer,
  competitionRound,
  competitionMatch,
  competitionMatchGame,
  player,
  playerCallsignHistory,
  game,
  sm5GameTeam,
  sm5Scorecard,
  center,
  competition,
} from "../schema";
import { eq, and, asc, desc, ilike, inArray, not, or, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Competition lookup
// ---------------------------------------------------------------------------

export async function getCompetitionHostCenterId(
  competitionId: string,
): Promise<string | null> {
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
  shortName: string | null;
  playerCount: number;
};

export type CompetitionTeamRosterEntry = {
  id: string; // competitionTeamPlayer.id — used for removal
  playerId: string;
  iplId: string;
  currentCallsign: string;
};

export type CompetitionRoundListItem = {
  id: string;
  competitionId: string;
  name: string;
  roundNumber: number;
  type: "pool" | "finals";
  matchCount: number;
};

export type CompetitionMatchListItem = {
  id: string;
  roundId: string;
  matchNumber: number;
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;
  scheduledTime: Date | null;
  game1Assigned: boolean;
  game2Assigned: boolean;
};

export type CompetitionMatchDetail = {
  id: string;
  competitionId: string;
  roundId: string;
  team1Id: string;
  team1Name: string;
  team2Id: string;
  team2Name: string;
  scheduledTime: Date | null;
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
      shortName: competitionTeam.shortName,
      playerCount: sql<number>`count(${competitionTeamPlayer.id})::int`,
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

export async function getCompetitionTeamById(
  id: string,
): Promise<{ id: string; competitionId: string; name: string; shortName: string | null } | null> {
  const [row] = await db
    .select()
    .from(competitionTeam)
    .where(eq(competitionTeam.id, id));
  return row ?? null;
}

export async function updateCompetitionTeam(
  id: string,
  data: { name: string; shortName: string | null },
): Promise<void> {
  await db
    .update(competitionTeam)
    .set({ name: data.name, shortName: data.shortName })
    .where(eq(competitionTeam.id, id));
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
    })
    .from(competitionTeamPlayer)
    .innerJoin(player, eq(player.id, competitionTeamPlayer.playerId))
    .where(eq(competitionTeamPlayer.competitionTeamId, teamId))
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export type TeamGameParticipant = {
  playerId: string;
  iplId: string;
  currentCallsign: string;
  isMercenary: boolean;
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
      isMercenary: sm5Scorecard.isMercenary,
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
    .groupBy(player.id, player.iplId, player.currentCallsign, sm5Scorecard.isMercenary)
    .orderBy(asc(player.currentCallsign));

  return rows;
}

export async function setPlayerMercenary(
  competitionTeamId: string,
  playerId: string,
  isMercenary: boolean,
): Promise<void> {
  // Update all scorecards for this player on game-teams belonging to this competition team
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
  const [row] = await db
    .insert(competitionTeam)
    .values(data)
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
  await db
    .insert(competitionTeamPlayer)
    .values({ competitionTeamId, playerId })
    .onConflictDoNothing();
}

export async function removePlayerFromCompetitionTeam(
  entryId: string,
): Promise<void> {
  await db
    .delete(competitionTeamPlayer)
    .where(eq(competitionTeamPlayer.id, entryId));
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
    .leftJoin(
      competitionMatch,
      eq(competitionMatch.roundId, competitionRound.id),
    )
    .where(eq(competitionRound.competitionId, competitionId))
    .groupBy(competitionRound.id)
    .orderBy(asc(competitionRound.roundNumber));

  return rows;
}

export async function createCompetitionRound(data: {
  competitionId: string;
  name: string;
  roundNumber: number;
  type: "pool" | "finals";
}): Promise<string> {
  const [row] = await db
    .insert(competitionRound)
    .values(data)
    .returning({ id: competitionRound.id });
  return row.id;
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
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      scheduledTime: competitionMatch.scheduledTime,
    })
    .from(competitionMatch)
    .where(eq(competitionMatch.roundId, roundId))
    .orderBy(asc(competitionMatch.matchNumber));

  if (matchRows.length === 0) return [];

  const teamIds = [
    ...new Set([
      ...matchRows.map((m) => m.team1Id),
      ...matchRows.map((m) => m.team2Id),
    ]),
  ];

  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, teamIds));

  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  const matchIds = matchRows.map((m) => m.id);
  const gameAssignments = await db
    .select({
      matchId: competitionMatchGame.matchId,
      gameNumber: competitionMatchGame.gameNumber,
    })
    .from(competitionMatchGame)
    .where(inArray(competitionMatchGame.matchId, matchIds));

  const assignedMap = new Map<string, Set<number>>();
  for (const a of gameAssignments) {
    if (!assignedMap.has(a.matchId)) assignedMap.set(a.matchId, new Set());
    assignedMap.get(a.matchId)!.add(a.gameNumber);
  }

  return matchRows.map((m) => ({
    id: m.id,
    roundId: m.roundId,
    matchNumber: m.matchNumber,
    team1Id: m.team1Id,
    team1Name: teamMap.get(m.team1Id) ?? "Unknown",
    team2Id: m.team2Id,
    team2Name: teamMap.get(m.team2Id) ?? "Unknown",
    scheduledTime: m.scheduledTime,
    game1Assigned: assignedMap.get(m.id)?.has(1) ?? false,
    game2Assigned: assignedMap.get(m.id)?.has(2) ?? false,
  }));
}

export async function getCompetitionMatchById(
  id: string,
): Promise<CompetitionMatchDetail | null> {
  const [match] = await db
    .select()
    .from(competitionMatch)
    .where(eq(competitionMatch.id, id));

  if (!match) return null;

  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, [match.team1Id, match.team2Id]));

  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return {
    id: match.id,
    competitionId: match.competitionId,
    roundId: match.roundId,
    team1Id: match.team1Id,
    team1Name: teamMap.get(match.team1Id) ?? "Unknown",
    team2Id: match.team2Id,
    team2Name: teamMap.get(match.team2Id) ?? "Unknown",
    scheduledTime: match.scheduledTime,
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
      await tx
        .update(competitionMatch)
        .set({ matchNumber })
        .where(eq(competitionMatch.id, id));
    }
  });
}

export async function createCompetitionMatch(data: {
  competitionId: string;
  roundId: string;
  matchNumber: number;
  team1Id: string;
  team2Id: string;
  scheduledTime?: Date | null;
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

// ---------------------------------------------------------------------------
// Match game assignments
// ---------------------------------------------------------------------------

export async function getMatchGameAssignments(
  matchId: string,
): Promise<MatchGameAssignment[]> {
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
    ...new Set([
      ...rows.map((r) => r.team1GameTeamId),
      ...rows.map((r) => r.team2GameTeamId),
    ]),
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
}

export async function removeGameFromMatch(matchGameId: string): Promise<void> {
  await db
    .delete(competitionMatchGame)
    .where(eq(competitionMatchGame.id, matchGameId));
}

export async function getUnassignedCompetitionGames(
  competitionId: string,
): Promise<UnassignedCompetitionGame[]> {
  const assignedGameIds = db
    .select({ gameId: competitionMatchGame.gameId })
    .from(competitionMatchGame)
    .innerJoin(
      competitionMatch,
      eq(competitionMatch.id, competitionMatchGame.matchId),
    )
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
    .where(
      and(
        eq(game.competitionId, competitionId),
        not(inArray(game.id, assignedGameIds)),
      ),
    )
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
    .where(
      and(
        inArray(sm5GameTeam.gameId, gameIds),
        eq(sm5GameTeam.isNeutral, false),
      ),
    );

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

export async function getAvailableMatchesForGame(
  competitionId: string,
): Promise<AvailableMatch[]> {
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
    ...new Set([
      ...matchRows.map((m) => m.team1Id),
      ...matchRows.map((m) => m.team2Id),
    ]),
  ];
  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, teamIds));
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
        team1Name: teamMap.get(m.team1Id) ?? "Unknown",
        team2Name: teamMap.get(m.team2Id) ?? "Unknown",
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
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit";
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
  outcome: "score" | "elimination" | "draw" | "aborted" | "forfeit";
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

  const teamIds = [...new Set([...rows.map((r) => r.team1Id), ...rows.map((r) => r.team2Id)])];
  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, teamIds));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    matchGameId: r.matchGameId,
    roundName: r.roundName,
    matchNumber: r.matchNumber,
    gameNumber: r.gameNumber,
    team1Name: teamMap.get(r.team1Id) ?? "Unknown",
    team1ColourEnum: r.team1ColourEnum,
    team2Name: teamMap.get(r.team2Id) ?? "Unknown",
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
  startDate: string;
  endDate: string | null;
};

export async function getCompetitiveCompetitions(): Promise<CompetitiveCompetitionSummary[]> {
  return db
    .select({
      id: competition.id,
      name: competition.name,
      startDate: competition.startDate,
      endDate: competition.endDate,
    })
    .from(competition)
    .where(eq(competition.type, "competitive"))
    .orderBy(desc(competition.startDate));
}

// ---------------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------------

export type CompetitionStandingsRow = {
  teamId: string;
  teamName: string;
  teamShortName: string | null;
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

export async function getCompetitionStandings(
  competitionId: string,
): Promise<CompetitionStandingsRow[]> {
  // Pull every assigned match-game with both teams' scores and results.
  // We need:
  //   - match-level W/L/D (compare combined score+elim_bonus across both games)
  //   - game-level W/L/D (sm5_game_team.result per game)
  //   - full-team eliminations (opposing sm5_game_team.eliminated = true)
  //   - score totals for ratio

  const gameRows = await db
    .select({
      matchId: competitionMatch.id,
      gameNumber: competitionMatchGame.gameNumber,
      // team1 perspective
      team1Id: competitionMatch.team1Id,
      team1Score: sql<number>`t1.score + t1.elimination_bonus`,
      team1Result: sql<string>`t1.result`,
      team1EliminatedOpponent: sql<boolean>`t2.eliminated`,
      // team2 perspective
      team2Id: competitionMatch.team2Id,
      team2Score: sql<number>`t2.score + t2.elimination_bonus`,
      team2Result: sql<string>`t2.result`,
      team2EliminatedOpponent: sql<boolean>`t1.eliminated`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(
      sql`sm5_game_team t1`,
      sql`t1.id = ${competitionMatchGame.team1GameTeamId}`,
    )
    .innerJoin(
      sql`sm5_game_team t2`,
      sql`t2.id = ${competitionMatchGame.team2GameTeamId}`,
    )
    .where(eq(competitionMatch.competitionId, competitionId));

  if (gameRows.length === 0) return [];

  // Group games by match
  const matchMap = new Map<
    string,
    { team1Id: string; team2Id: string; games: typeof gameRows }
  >();
  for (const row of gameRows) {
    if (!matchMap.has(row.matchId)) {
      matchMap.set(row.matchId, { team1Id: row.team1Id, team2Id: row.team2Id, games: [] });
    }
    matchMap.get(row.matchId)!.games.push(row);
  }

  // Accumulate per-team stats
  const stats = new Map<
    string,
    {
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
    }
  >();

  function ensureTeam(id: string) {
    if (!stats.has(id)) {
      stats.set(id, {
        matchPoints: 0, matchWins: 0, matchLosses: 0, matchDraws: 0,
        gameWins: 0, gameLosses: 0, gameDraws: 0,
        teamEliminations: 0, scoreFor: 0, scoreAgainst: 0,
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
      if (r1 === "win") { t1.gameWins += 1; t2.gameLosses += 1; }
      else if (r2 === "win") { t2.gameWins += 1; t1.gameLosses += 1; }
      else { t1.gameDraws += 1; t2.gameDraws += 1; }
    }

    // Match bonus: compare combined scores
    if (t1TotalScore > t2TotalScore) {
      t1.matchPoints += 2; t1.matchWins += 1; t2.matchLosses += 1;
    } else if (t2TotalScore > t1TotalScore) {
      t2.matchPoints += 2; t2.matchWins += 1; t1.matchLosses += 1;
    } else {
      t1.matchPoints += 1; t1.matchDraws += 1;
      t2.matchPoints += 1; t2.matchDraws += 1;
    }
  }

  // Also add game points into matchPoints (2 per game win, 1 per draw)
  for (const s of stats.values()) {
    s.matchPoints += s.gameWins * 2 + s.gameDraws;
  }

  // Fetch team names for all teams in competition (including 0-game teams)
  const allTeams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name, shortName: competitionTeam.shortName })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId))
    .orderBy(asc(competitionTeam.name));

  return allTeams.map((team) => {
    const s = stats.get(team.id) ?? {
      matchPoints: 0, matchWins: 0, matchLosses: 0, matchDraws: 0,
      gameWins: 0, gameLosses: 0, gameDraws: 0,
      teamEliminations: 0, scoreFor: 0, scoreAgainst: 0,
    };
    return { teamId: team.id, teamName: team.name, teamShortName: team.shortName, ...s };
  }).sort((a, b) => b.matchPoints - a.matchPoints || b.gameWins - a.gameWins);
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
  team1Id: string;
  team1Name: string;
  team1ShortName: string | null;
  team2Id: string;
  team2Name: string;
  team2ShortName: string | null;
  games: {
    gameNumber: number;
    gameId: string;
    gameSlug: string;
    team1Score: number | null;
    team2Score: number | null;
    team1Result: string | null;
    team2Result: string | null;
    team1ColourEnum: number;
    team2ColourEnum: number;
  }[];
  // match-level outcome (compare combined scores across both games)
  matchWinner: "team1" | "team2" | "draw" | "incomplete";
  team1MatchPoints: number; // match bonus only (2/1/0)
  team2MatchPoints: number;
  team1TotalPoints: number; // game points + match bonus
  team2TotalPoints: number;
};

export async function getCompetitionMatchResults(
  competitionId: string,
): Promise<CompetitionMatchResult[]> {
  const gameRows = await db
    .select({
      matchId: competitionMatch.id,
      matchNumber: competitionMatch.matchNumber,
      roundId: competitionRound.id,
      roundName: competitionRound.name,
      roundNumber: competitionRound.roundNumber,
      team1Id: competitionMatch.team1Id,
      team2Id: competitionMatch.team2Id,
      gameNumber: competitionMatchGame.gameNumber,
      gameId: game.id,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      team1Score: sql<number>`t1.score + t1.elimination_bonus`,
      team2Score: sql<number>`t2.score + t2.elimination_bonus`,
      team1Result: sql<string>`t1.result`,
      team2Result: sql<string>`t2.result`,
      team1ColourEnum: sql<number>`t1.colour_enum`,
      team2ColourEnum: sql<number>`t2.colour_enum`,
    })
    .from(competitionMatchGame)
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(sql`sm5_game_team t1`, sql`t1.id = ${competitionMatchGame.team1GameTeamId}`)
    .innerJoin(sql`sm5_game_team t2`, sql`t2.id = ${competitionMatchGame.team2GameTeamId}`)
    .where(eq(competitionMatch.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
    );

  if (gameRows.length === 0) return [];

  // Fetch team names and short names
  const teamIds = [...new Set(gameRows.flatMap((r) => [r.team1Id, r.team2Id]))];
  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name, shortName: competitionTeam.shortName })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, teamIds));
  const teamMap = new Map(teams.map((t) => [t.id, t]));

  // Group into matches
  const matchOrder: string[] = [];
  const matchMap = new Map<string, Omit<CompetitionMatchResult, "matchWinner" | "team1MatchPoints" | "team2MatchPoints" | "team1TotalPoints" | "team2TotalPoints"> & { games: CompetitionMatchResult["games"] }>();

  for (const row of gameRows) {
    if (!matchMap.has(row.matchId)) {
      matchOrder.push(row.matchId);
      const t1 = teamMap.get(row.team1Id);
      const t2 = teamMap.get(row.team2Id);
      matchMap.set(row.matchId, {
        matchId: row.matchId,
        matchNumber: row.matchNumber,
        roundId: row.roundId,
        roundName: row.roundName,
        roundNumber: row.roundNumber,
        team1Id: row.team1Id,
        team1Name: t1?.name ?? "Unknown",
        team1ShortName: t1?.shortName ?? null,
        team2Id: row.team2Id,
        team2Name: t2?.name ?? "Unknown",
        team2ShortName: t2?.shortName ?? null,
        games: [],
      });
    }
    matchMap.get(row.matchId)!.games.push({
      gameNumber: row.gameNumber,
      gameId: row.gameId,
      gameSlug: row.gameSlug,
      team1Score: row.team1Score,
      team2Score: row.team2Score,
      team1Result: row.team1Result,
      team2Result: row.team2Result,
      team1ColourEnum: row.team1ColourEnum,
      team2ColourEnum: row.team2ColourEnum,
    });
  }

  return matchOrder.map((id) => {
    const m = matchMap.get(id)!;
    if (m.games.length < 2) {
      return { ...m, matchWinner: "incomplete" as const, team1MatchPoints: 0, team2MatchPoints: 0, team1TotalPoints: 0, team2TotalPoints: 0 };
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
    // Game points: 2 per win, 1 per draw
    let t1GamePoints = 0;
    let t2GamePoints = 0;
    for (const g of m.games) {
      if (g.team1Result === "win") { t1GamePoints += 2; }
      else if (g.team2Result === "win") { t2GamePoints += 2; }
      else { t1GamePoints += 1; t2GamePoints += 1; }
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

export async function getGameMatchAssignment(
  gameId: string,
): Promise<GameMatchAssignment | null> {
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

  const teams = await db
    .select({ id: competitionTeam.id, name: competitionTeam.name })
    .from(competitionTeam)
    .where(inArray(competitionTeam.id, [row.team1Id, row.team2Id]));
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return {
    matchGameId: row.matchGameId,
    matchId: row.matchId,
    matchNumber: row.matchNumber,
    gameNumber: row.gameNumber,
    roundName: row.roundName,
    team1GameTeamId: row.team1GameTeamId,
    team1Name: teamMap.get(row.team1Id) ?? "Unknown",
    team2GameTeamId: row.team2GameTeamId,
    team2Name: teamMap.get(row.team2Id) ?? "Unknown",
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

export async function getCompetitionTopPlayers(
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionTopPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
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
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})`,
      totalMvp: sql<number>`sum(${sm5Scorecard.mvpPoints})`,
      totalTimeInGameSec: sql<number>`sum(${sm5Scorecard.uptime} + ${sm5Scorecard.resupplyDowntime} + ${sm5Scorecard.otherDowntime}) / 1000.0`,
      avgAccuracy: sql<number>`avg(${sm5Scorecard.accuracy})`,
      avgHitDiff: sql<number>`avg(${sm5Scorecard.hitDiff})`,
      wins: sql<number>`count(*) filter (where ${sm5GameTeam.result} = 'win')::int`,
      totalGames: sql<number>`count(*)::int`,
      // Per-position stats (positions 1–5)
      p1AvgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 1)`,
      p1AvgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 1)`,
      p1Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1 and ${sm5GameTeam.result} = 'win')::int`,
      p1Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 1)::int`,
      p2AvgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 2)`,
      p2AvgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 2)`,
      p2Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2 and ${sm5GameTeam.result} = 'win')::int`,
      p2Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 2)::int`,
      p3AvgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 3)`,
      p3AvgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 3)`,
      p3Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3 and ${sm5GameTeam.result} = 'win')::int`,
      p3Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 3)::int`,
      p4AvgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 4)`,
      p4AvgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 4)`,
      p4Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4 and ${sm5GameTeam.result} = 'win')::int`,
      p4Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 4)::int`,
      p5AvgMvp: sql<number | null>`avg(${sm5Scorecard.mvpPoints}) filter (where ${sm5Scorecard.position} = 5)`,
      p5AvgAccuracy: sql<number | null>`avg(${sm5Scorecard.accuracy}) filter (where ${sm5Scorecard.position} = 5)`,
      p5Wins: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5 and ${sm5GameTeam.result} = 'win')::int`,
      p5Games: sql<number>`count(*) filter (where ${sm5Scorecard.position} = 5)::int`,
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5Scorecard.teamId))
    .innerJoin(player, eq(player.id, sm5Scorecard.playerId))
    .where(and(...conditions))
    .groupBy(player.id, player.iplId, player.currentCallsign)
    .orderBy(sql`avg(${sm5Scorecard.mvpPoints}) DESC`);

  function posStats(avgMvp: number | null, avgAccuracy: number | null, wins: number, games: number): PositionStats | undefined {
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
    mvpPerMinute: r.totalTimeInGameSec > 0 ? Number(r.totalMvp) / (Number(r.totalTimeInGameSec) / 60) : 0,
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
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionCommanderPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, 1),
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
      avgMissilesHitOpponent: sql<number>`avg(${sm5Scorecard.missilesHitOpponent})`,
      nukeSuccessRatio: sql<number | null>`sum(${sm5Scorecard.nukesDetonated})::float / nullif(sum(${sm5Scorecard.nukesActivated}), 0)`,
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

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
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
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionHeavyPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, 2),
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
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
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionScoutPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, 3),
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
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
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionAmmoPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, 4),
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
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
    avgDoubleResuppliesGiven: r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
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
  competitionId: string,
  options: CompetitionTopPlayersOptions = {},
): Promise<CompetitionMedicPlayer[]> {
  const { showPool = true, showFinals = false, showMercs = false } = options;

  const roundTypes: string[] = [];
  if (showPool) roundTypes.push("pool");
  if (showFinals) roundTypes.push("finals");
  if (roundTypes.length === 0) return [];

  const roundTypeList = roundTypes.map((t) => `'${t}'`).join(", ");

  const conditions = [
    sql`${sm5GameTeam.gameId} IN (
      SELECT cmg.game_id
      FROM competition_match_game cmg
      JOIN competition_match cm ON cm.id = cmg.match_id
      JOIN competition_round cr ON cr.id = cm.round_id
      WHERE cm.competition_id = ${competitionId}
        AND cr.type IN (${sql.raw(roundTypeList)})
    )`,
    sql`${sm5Scorecard.playerId} IS NOT NULL`,
    eq(sm5Scorecard.position, 5),
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
      avgMedicHits: sql<number>`avg(${sm5Scorecard.shotsHitOpponentMedic} + ${sm5Scorecard.missilesHitOpponentMedic} * 2)`,
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
    avgDoubleResuppliesGiven: r.avgDoubleResuppliesGiven !== null ? Number(r.avgDoubleResuppliesGiven) : null,
    survivalRate: Number(r.totalGames) > 0 ? Number(r.survived) / Number(r.totalGames) : 0,
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
    const team1GameTeamId =
      data.forfeitingTeam === "team1" ? loserTeam.id : winnerTeam.id;
    const team2GameTeamId =
      data.forfeitingTeam === "team2" ? loserTeam.id : winnerTeam.id;

    await tx.insert(competitionMatchGame).values({
      matchId: data.matchId,
      gameId: gameRow.id,
      gameNumber: data.gameNumber,
      team1GameTeamId,
      team2GameTeamId,
    });
  });
}
