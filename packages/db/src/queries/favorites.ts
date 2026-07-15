// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  userFavoriteGame,
  userFavoritePlayer,
  game,
  sm5GameTeam,
  sm5Scorecard,
  center,
  competition,
  player,
} from "../schema";
import { eq, and, desc, inArray, sql, count } from "drizzle-orm";
import type { GameListItem } from "./games";

export type FavoritePlayerItem = {
  id: string;
  iplId: string;
  currentCallsign: string;
  totalGames: number;
  lastGameAt: Date | null;
};

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
      competitionName: competition.name,
      actualDuration: game.actualDuration,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .leftJoin(competition, eq(game.competitionId, competition.id))
    .where(inArray(game.id, gameIds));

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
      competitionName: row.competitionName,
      actualDuration: row.actualDuration,
      teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
        colourEnum: t.colourEnum,
        score: t.score,
        eliminationBonus: t.eliminationBonus,
        penaltyScore: t.penaltyScore ?? 0,
        result: t.result,
      })),
    }));
}

export async function addFavorite(userId: string, gameId: string, note?: string): Promise<void> {
  await db.insert(userFavoriteGame).values({ userId, gameId, note }).onConflictDoNothing();
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

export async function getUserFavoritePlayers(userId: string): Promise<FavoritePlayerItem[]> {
  const favoriteRows = await db
    .select({ playerId: userFavoritePlayer.playerId })
    .from(userFavoritePlayer)
    .where(eq(userFavoritePlayer.userId, userId))
    .orderBy(desc(userFavoritePlayer.createdAt));

  if (favoriteRows.length === 0) return [];

  const playerIds = favoriteRows.map((r) => r.playerId);

  const statsRows = await db
    .select({
      id: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      totalGames: count(sm5Scorecard.id),
      lastGameAt: sql<string | null>`MAX(${game.startTime})`,
    })
    .from(player)
    .leftJoin(sm5Scorecard, eq(sm5Scorecard.playerId, player.id))
    .leftJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .leftJoin(game, eq(sm5GameTeam.gameId, game.id))
    .where(inArray(player.id, playerIds))
    .groupBy(player.id, player.iplId, player.currentCallsign);

  const statsMap = new Map(statsRows.map((r) => [r.id, r]));

  return playerIds
    .map((id) => statsMap.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({
      ...r,
      lastGameAt: r.lastGameAt ? new Date(r.lastGameAt) : null,
    }));
}

export async function addFavoritePlayer(
  userId: string,
  playerId: string,
  note?: string,
): Promise<void> {
  await db.insert(userFavoritePlayer).values({ userId, playerId, note }).onConflictDoNothing();
}

export async function removeFavoritePlayer(userId: string, playerId: string): Promise<void> {
  await db
    .delete(userFavoritePlayer)
    .where(and(eq(userFavoritePlayer.userId, userId), eq(userFavoritePlayer.playerId, playerId)));
}

export async function isPlayerFavorite(userId: string, playerId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: userFavoritePlayer.id })
    .from(userFavoritePlayer)
    .where(and(eq(userFavoritePlayer.userId, userId), eq(userFavoritePlayer.playerId, playerId)));
  return row !== undefined;
}
