import { db } from "../client";
import {
  center,
  game,
  sm5Scorecard,
  sm5GameTeam,
  sm5ScorecardMvp,
} from "../schema";
import { eq, and, ne, desc, count, sql, asc } from "drizzle-orm";

export type CenterListItem = {
  id: string;
  name: string;
  gameCount: number;
};

export type CenterPositionStat = {
  centerId: string;
  centerName: string;
  position: number;
  avgMvp: number;
  avgScore: number;
};

export type CenterDetail = {
  id: string;
  name: string;
  shortName: string | null;
  city: string | null;
  countryName: string | null;
  timezone: string | null;
};

export async function getCenterList(): Promise<CenterListItem[]> {
  const rows = await db
    .select({
      id: center.id,
      name: center.name,
      gameCount: count(game.id),
    })
    .from(center)
    .innerJoin(game, eq(game.centerId, center.id))
    .groupBy(center.id)
    .orderBy(desc(count(game.id)));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    gameCount: r.gameCount,
  }));
}

export async function getCenterPositionStats(): Promise<CenterPositionStat[]> {
  const rows = await db
    .select({
      centerId: center.id,
      centerName: center.name,
      position: sm5Scorecard.position,
      avgMvp: sql<number>`avg(${sm5Scorecard.mvpPoints})::float`,
      avgScore: sql<number>`avg(${sm5Scorecard.score})::float`,
    })
    .from(sm5Scorecard)
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .innerJoin(center, eq(game.centerId, center.id))
    .groupBy(center.id, center.name, sm5Scorecard.position);

  return rows.map((r) => ({
    centerId: r.centerId,
    centerName: r.centerName,
    position: r.position,
    avgMvp: r.avgMvp,
    avgScore: r.avgScore,
  }));
}

export async function getCenterById(id: string): Promise<CenterDetail | null> {
  const [row] = await db
    .select({
      id: center.id,
      name: center.name,
      shortName: center.shortName,
      city: center.city,
      countryName: center.countryName,
      timezone: center.timezone,
    })
    .from(center)
    .where(eq(center.id, id));

  return row ?? null;
}

export async function getCenterGameCount(id: string): Promise<number> {
  const [row] = await db
    .select({ count: count(game.id) })
    .from(game)
    .where(eq(game.centerId, id));

  return row?.count ?? 0;
}

export type WinsByColorItem = {
  colourEnum: number;
  outcome: "score" | "elimination";
  count: number;
};

export async function getCenterWinsByColor(
  id: string,
): Promise<WinsByColorItem[]> {
  const rows = await db
    .select({
      colourEnum: sm5GameTeam.colourEnum,
      outcome: game.outcome,
      count: count(),
    })
    .from(sm5GameTeam)
    .innerJoin(game, eq(sm5GameTeam.gameId, game.id))
    .where(
      and(
        eq(sm5GameTeam.result, "win"),
        eq(sm5GameTeam.isNeutral, false),
        eq(game.centerId, id),
      ),
    )
    .groupBy(sm5GameTeam.colourEnum, game.outcome)
    .orderBy(asc(sm5GameTeam.colourEnum), desc(game.outcome));

  return rows
    .filter((r) => r.outcome === "score" || r.outcome === "elimination")
    .map((r) => ({
      colourEnum: r.colourEnum,
      outcome: r.outcome as "score" | "elimination",
      count: r.count,
    }));
}

export type MvpBoxPlotItem = {
  position: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
};

export async function getGlobalMvpBoxPlot(): Promise<MvpBoxPlotItem[]> {
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

export async function getCenterMvpBoxPlot(
  id: string,
): Promise<MvpBoxPlotItem[]> {
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
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(eq(game.centerId, id))
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

export type MvpComponentItem = {
  position: number;
  component: string;
  avgPoints: number;
};

export async function getGlobalMvpComponents(): Promise<MvpComponentItem[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      component: sm5ScorecardMvp.component,
      avgPoints: sql<number>`AVG(${sm5ScorecardMvp.points})::float`,
    })
    .from(sm5ScorecardMvp)
    .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
    .groupBy(sm5Scorecard.position, sm5ScorecardMvp.component)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    component: r.component,
    avgPoints: r.avgPoints,
  }));
}

export async function getCenterMvpComponents(
  id: string,
): Promise<MvpComponentItem[]> {
  const rows = await db
    .select({
      position: sm5Scorecard.position,
      component: sm5ScorecardMvp.component,
      avgPoints: sql<number>`AVG(${sm5ScorecardMvp.points})::float`,
    })
    .from(sm5ScorecardMvp)
    .innerJoin(sm5Scorecard, eq(sm5ScorecardMvp.scorecardId, sm5Scorecard.id))
    .innerJoin(game, eq(sm5Scorecard.gameId, game.id))
    .where(eq(game.centerId, id))
    .groupBy(sm5Scorecard.position, sm5ScorecardMvp.component)
    .orderBy(sm5Scorecard.position);

  return rows.map((r) => ({
    position: r.position,
    component: r.component,
    avgPoints: r.avgPoints,
  }));
}
