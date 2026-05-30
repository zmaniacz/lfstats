import { db } from "../client";
import { userFavoriteGame, game, sm5GameTeam, center } from "../schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import type { GameListItem } from "./games";

export async function getUserFavorites(userId: string): Promise<GameListItem[]> {
  const favoriteRows = await db
    .select({ gameId: userFavoriteGame.gameId })
    .from(userFavoriteGame)
    .where(eq(userFavoriteGame.userId, userId))
    .orderBy(desc(userFavoriteGame.createdAt));

  if (favoriteRows.length === 0) return [];

  const gameIds = favoriteRows.map((r) => r.gameId);

  const gameRows = await db
    .select({
      id: game.id,
      slug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      centerSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text)`,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
      description: game.description,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .where(inArray(game.id, gameIds));

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

  const gameMap = new Map(gameRows.map((r) => [r.id, r]));

  return gameIds
    .map((id) => gameMap.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      centerSlug: row.centerSlug,
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

export async function addFavorite(
  userId: string,
  gameId: string,
  note?: string,
): Promise<void> {
  await db
    .insert(userFavoriteGame)
    .values({ userId, gameId, note })
    .onConflictDoNothing();
}

export async function removeFavorite(userId: string, gameId: string): Promise<void> {
  await db
    .delete(userFavoriteGame)
    .where(and(eq(userFavoriteGame.userId, userId), eq(userFavoriteGame.gameId, gameId)));
}

export async function isFavorite(userId: string, gameId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userFavoriteGame.id })
    .from(userFavoriteGame)
    .where(and(eq(userFavoriteGame.userId, userId), eq(userFavoriteGame.gameId, gameId)));
  return row !== undefined;
}
