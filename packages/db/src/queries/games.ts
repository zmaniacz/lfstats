import { db } from "../client"
import { game, sm5GameTeam, center } from "../schema"
import { eq, and, desc, inArray, sql } from "drizzle-orm"

export const GAMES_PER_PAGE = 10

export type GameTeamSummary = {
  colourEnum: number
  score: number | null
  result: "win" | "loss" | "draw" | null
}

export type GameListItem = {
  id: string
  startTime: Date
  outcome: "score" | "elimination" | "draw"
  centerName: string
  teams: GameTeamSummary[]
}

export async function getGamesPage(page: number): Promise<GameListItem[]> {
  const offset = (page - 1) * GAMES_PER_PAGE

  const rows = await db
    .select({
      id: game.id,
      startTime: game.startTime,
      outcome: game.outcome,
      centerName: center.name,
    })
    .from(game)
    .innerJoin(center, eq(game.centerId, center.id))
    .orderBy(desc(game.startTime))
    .limit(GAMES_PER_PAGE)
    .offset(offset)

  if (rows.length === 0) return []

  const gameIds = rows.map((r) => r.id)

  const teamRows = await db
    .select({
      gameId: sm5GameTeam.gameId,
      colourEnum: sm5GameTeam.colourEnum,
      score: sm5GameTeam.score,
      result: sm5GameTeam.result,
    })
    .from(sm5GameTeam)
    .where(and(inArray(sm5GameTeam.gameId, gameIds), eq(sm5GameTeam.isNeutral, false)))
    .orderBy(sm5GameTeam.tdfTeamIndex)

  const teamsByGame = new Map<string, typeof teamRows>()
  for (const team of teamRows) {
    const list = teamsByGame.get(team.gameId) ?? []
    list.push(team)
    teamsByGame.set(team.gameId, list)
  }

  return rows.map((row) => ({
    id: row.id,
    startTime: row.startTime,
    outcome: row.outcome,
    centerName: row.centerName,
    teams: (teamsByGame.get(row.id) ?? []).map((t) => ({
      colourEnum: t.colourEnum,
      score: t.score,
      result: t.result,
    })),
  }))
}

export async function getGamesCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(game)
  return row?.count ?? 0
}
