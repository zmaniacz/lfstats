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
  center,
  competition,
} from "../schema";
import { eq, and, asc, ilike, inArray, not, or, sql } from "drizzle-orm";

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
  outcome: "score" | "elimination" | "draw" | "aborted";
};

export type CompetitionAssignedGame = {
  id: string;
  slug: string;
  matchGameId: string;
  roundName: string;
  matchNumber: number;
  gameNumber: number;
  team1Name: string;
  team2Name: string;
  startTime: Date;
  outcome: "score" | "elimination" | "draw" | "aborted";
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
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
    })
    .from(competitionMatchGame)
    .innerJoin(game, eq(game.id, competitionMatchGame.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .innerJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .innerJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
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
    team2Name: teamMap.get(r.team2Id) ?? "Unknown",
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
