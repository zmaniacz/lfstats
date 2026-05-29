import { db } from "../client";
import { game, sm5GameTeam, center, competition, gameTagAssignment } from "../schema";
import { eq, and, isNull, or, inArray, gte, lte, sql, desc } from "drizzle-orm";
import type { GameListItem } from "./games";

async function attachTeams(rows: { id: string; startTime: Date; outcome: "score" | "elimination" | "draw"; centerName: string; description: string | null }[]): Promise<GameListItem[]> {
  if (rows.length === 0) return [];

  const gameIds = rows.map((r) => r.id);

  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex);

  const teamsByGame = new Map<string, typeof teamRows>();
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? [];
    list.push(team);
    teamsByGame.set(team.gameId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    startTime: row.startTime,
    outcome: row.outcome,
    centerName: row.centerName,
    description: row.description,
    teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
      colourEnum: t.colourEnum,
      score: t.score,
      eliminationBonus: t.eliminationBonus,
      result: t.result,
    })),
  }));
}

export async function getNightlyGames(centerId: string, date: string): Promise<GameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(
      and(
        eq(game.centerId, centerId),
        sql`date(${game.startTime}) = ${date}::date`,
        isNull(game.competitionId),
        eq(game.exclude, false),
      ),
    )
    .orderBy(desc(game.startTime));

  return attachTeams(rows);
}

export type SocialGamesFilter = {
  centerId?: string;
  dateFrom?: string;
  dateTo?: string;
  tagIds?: string[];
};

export async function getSocialGames(filter: SocialGamesFilter): Promise<GameListItem[]> {
  const { centerId, dateFrom, dateTo, tagIds } = filter;

  const conditions = [
    eq(game.exclude, false),
    or(isNull(game.competitionId), eq(competition.type, "social")),
  ];

  if (centerId) conditions.push(eq(game.centerId, centerId));
  if (dateFrom) conditions.push(gte(game.startTime, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(game.startTime, new Date(`${dateTo}T23:59:59`)));

  if (tagIds && tagIds.length > 0) {
    const taggedGameIds = db
      .select({ gameId: gameTagAssignment.gameId })
      .from(gameTagAssignment)
      .where(inArray(gameTagAssignment.tagId, tagIds))
      .groupBy(gameTagAssignment.gameId)
      .having(sql`count(distinct ${gameTagAssignment.tagId}) = ${tagIds.length}`);

    conditions.push(inArray(game.id, taggedGameIds));
  }

  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(and(...conditions))
    .orderBy(desc(game.startTime));

  return attachTeams(rows);
}

export async function getCompetitionGames(competitionId: string): Promise<GameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(and(eq(game.competitionId, competitionId), eq(game.exclude, false)))
    .orderBy(desc(game.startTime));

  return attachTeams(rows);
}

export async function getAllCompetitiveGames(): Promise<GameListItem[]> {
  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .innerJoin(competition, eq(game.competitionId, competition.id))
    .where(and(eq(competition.type, "competitive"), eq(game.exclude, false)))
    .orderBy(desc(game.startTime));

  return attachTeams(rows);
}
