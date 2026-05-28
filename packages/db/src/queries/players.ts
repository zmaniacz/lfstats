import { db } from "../client";
import { player, playerCallsignHistory, sm5Scorecard, sm5GameTeam, game } from "../schema";
import { eq, and, asc, desc, count, sql } from "drizzle-orm";
import type { MvpBoxPlotItem } from "./centers";

export type PlayerDetail = {
  id: string;
  iplId: string;
  currentCallsign: string;
  firstSeenAt: Date;
};

export type PlayerCallsignHistoryItem = {
  callsign: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

export type PositionAvgMvp = {
  position: number;
  avgMvp: number;
};

export async function getPlayerByIplId(iplId: string): Promise<PlayerDetail | null> {
  const normalized = iplId.startsWith("#") ? iplId : `#${iplId}`;
  const [row] = await db
    .select({
      id: player.id,
      iplId: player.iplId,
      currentCallsign: player.currentCallsign,
      firstSeenAt: player.firstSeenAt,
    })
    .from(player)
    .where(eq(player.iplId, normalized));

  return row ?? null;
}

export async function getPlayerCallsignHistory(
  playerId: string,
): Promise<PlayerCallsignHistoryItem[]> {
  const rows = await db
    .select({
      callsign: playerCallsignHistory.callsign,
      firstSeenAt: playerCallsignHistory.firstSeenAt,
      lastSeenAt: playerCallsignHistory.lastSeenAt,
    })
    .from(playerCallsignHistory)
    .where(eq(playerCallsignHistory.playerId, playerId))
    .orderBy(desc(playerCallsignHistory.lastSeenAt));

  return rows.map((r) => ({
    callsign: r.callsign,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
  }));
}

export type PlayerResultItem = {
  colourEnum: number;
  result: "win" | "loss";
  outcome: "score" | "elimination";
  count: number;
};

export async function getPlayerResultsByColor(playerId: string): Promise<PlayerResultItem[]> {
  const rows = await db
    .select({
      colourEnum: sm5GameTeam.colourEnum,
      result: sm5GameTeam.result,
      outcome: game.outcome,
      count: count(),
    })
    .from(sm5Scorecard)
    .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .where(
      and(
        eq(sm5Scorecard.playerId, playerId),
        eq(sm5GameTeam.isNeutral, false),
      ),
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

export async function getPlayerAvgMvpByPosition(
  playerId: string,
): Promise<PositionAvgMvp[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .where(eq(sm5Scorecard.playerId, playerId))
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgMvp: r.avgMvp,
  }));
}

export async function getGlobalAvgMvpByPosition(): Promise<PositionAvgMvp[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgMvp: sql<number>`AVG(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgMvp: r.avgMvp,
  }));
}

export async function getPlayerMvpBoxPlot(playerId: string): Promise<MvpBoxPlotItem[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      min: sql<number>`MIN(${sm5Scorecard.mvpPoints})::float`,
      q1: sql<number>`PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      median: sql<number>`PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      q3: sql<number>`PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY ${sm5Scorecard.mvpPoints})::float`,
      max: sql<number>`MAX(${sm5Scorecard.mvpPoints})::float`,
    })
    .from(sm5Scorecard)
    .where(eq(sm5Scorecard.playerId, playerId))
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    min: r.min,
    q1: r.q1,
    median: r.median,
    q3: r.q3,
    max: r.max,
  }));
}

export type PositionAvgScore = {
  position: number;
  avgScore: number;
};

export async function getPlayerAvgScoreByPosition(
  playerId: string,
): Promise<PositionAvgScore[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgScore: sql<number>`AVG(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .where(eq(sm5Scorecard.playerId, playerId))
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgScore: r.avgScore,
  }));
}

export async function getGlobalAvgScoreByPosition(): Promise<PositionAvgScore[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      avgScore: sql<number>`AVG(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .groupBy(sm5Scorecard.position)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    avgScore: r.avgScore,
  }));
}
