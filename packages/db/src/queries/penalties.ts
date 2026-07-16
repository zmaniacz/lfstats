// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  center,
  competition,
  competitionMatch,
  competitionMatchGame,
  competitionRound,
  game,
  sm5GamePenalty,
  sm5GameTeam,
  sm5GameTeamPenalty,
  sm5Scorecard,
  sm5ScorecardMvp,
} from "../schema";
import { gameScopeConditions, type GameScopeFilter } from "./scope";

export type PenaltyRecord = {
  id: string;
  scorecardId: string;
  gameId: string;
  type: string;
  description: string;
  scoreValue: number;
  mvpValue: number;
  inGame: boolean;
  rescinded: boolean;
  time: number | null;
};

export async function getGamePenalties(gameId: string): Promise<PenaltyRecord[]> {
  const rows = await db
    .select({
      id: sm5GamePenalty.id,
      scorecardId: sm5GamePenalty.scorecardId,
      gameId: sm5GamePenalty.gameId,
      type: sm5GamePenalty.type,
      description: sm5GamePenalty.description,
      scoreValue: sm5GamePenalty.scoreValue,
      mvpValue: sm5GamePenalty.mvpValue,
      inGame: sm5GamePenalty.inGame,
      rescinded: sm5GamePenalty.rescinded,
      time: sm5GamePenalty.time,
    })
    .from(sm5GamePenalty)
    .where(eq(sm5GamePenalty.gameId, gameId))
    .orderBy(sm5GamePenalty.time);
  return rows;
}

export type CompetitionPenaltyRecord = PenaltyRecord & {
  callsign: string;
  playerId: string | null;
  iplId: string | null;
  gameStartTime: Date;
  centerName: string;
  gameSlug: string;
  competitionName: string | null;
  // Competition match context (null if game not assigned to a match)
  roundNumber: number | null;
  matchNumber: number | null;
  gameNumber: number | null;
  team1ShortName: string | null;
  team2ShortName: string | null;
};

/**
 * Penalties across any scope (social / competition / all). Competition match
 * context (round/match/game numbers, team short names, competition name) comes
 * from left joins, so it is simply null for social games.
 */
export async function getPenalties(
  scopeFilter: GameScopeFilter,
): Promise<CompetitionPenaltyRecord[]> {
  const scopeConditions = gameScopeConditions(scopeFilter);
  return db
    .select({
      id: sm5GamePenalty.id,
      scorecardId: sm5GamePenalty.scorecardId,
      gameId: sm5GamePenalty.gameId,
      type: sm5GamePenalty.type,
      description: sm5GamePenalty.description,
      scoreValue: sm5GamePenalty.scoreValue,
      mvpValue: sm5GamePenalty.mvpValue,
      inGame: sm5GamePenalty.inGame,
      rescinded: sm5GamePenalty.rescinded,
      time: sm5GamePenalty.time,
      callsign: sm5Scorecard.callsign,
      playerId: sm5Scorecard.playerId,
      iplId: sm5Scorecard.iplId,
      gameStartTime: game.startTime,
      centerName: center.name,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      competitionName: competition.name,
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1ShortName: sql<
        string | null
      >`(select short_name from competition_team where id = ${competitionMatch.team1Id})`,
      team2ShortName: sql<
        string | null
      >`(select short_name from competition_team where id = ${competitionMatch.team2Id})`,
    })
    .from(sm5GamePenalty)
    .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
    .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .leftJoin(competition, eq(competition.id, game.competitionId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.gameId, game.id))
    .leftJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .leftJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(scopeConditions.length ? and(...scopeConditions) : undefined)
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
      asc(sm5GamePenalty.time),
    );
}

/** Back-compat wrapper: penalties for one competition. */
export async function getCompetitionPenalties(
  competitionId: string,
): Promise<CompetitionPenaltyRecord[]> {
  return getPenalties({ scope: "competition", competitionId });
}

export async function addPenalty(data: {
  scorecardId: string;
  gameId: string;
  type?: string;
  description?: string;
  scoreValue?: number;
  mvpValue?: number;
  inGame?: boolean;
}): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sm5GamePenalty)
      .values({
        scorecardId: data.scorecardId,
        gameId: data.gameId,
        type: data.type ?? "Common Foul",
        description: data.description ?? "",
        scoreValue: data.scoreValue ?? 0,
        mvpValue: data.mvpValue ?? 0,
        inGame: data.inGame ?? false,
        rescinded: false,
      })
      .returning({ id: sm5GamePenalty.id });

    if ((data.mvpValue ?? 0) !== 0) {
      await upsertPenaltyMvpComponent(data.scorecardId, tx);
      await recalculateScorecardMvp(data.scorecardId, tx);
    }

    if ((data.scoreValue ?? 0) !== 0) {
      await recalculateGameResult(data.gameId, tx);
    }

    return row.id;
  });
}

export async function updatePenalty(
  id: string,
  data: {
    type?: string;
    description?: string;
    scoreValue?: number;
    mvpValue?: number;
    rescinded?: boolean;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        scorecardId: sm5GamePenalty.scorecardId,
        gameId: sm5GamePenalty.gameId,
        mvpValue: sm5GamePenalty.mvpValue,
        scoreValue: sm5GamePenalty.scoreValue,
        rescinded: sm5GamePenalty.rescinded,
      })
      .from(sm5GamePenalty)
      .where(eq(sm5GamePenalty.id, id));

    if (!existing) return;

    await tx
      .update(sm5GamePenalty)
      .set({
        ...(data.type !== undefined && { type: data.type }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.scoreValue !== undefined && { scoreValue: data.scoreValue }),
        ...(data.mvpValue !== undefined && { mvpValue: data.mvpValue }),
        ...(data.rescinded !== undefined && { rescinded: data.rescinded }),
      })
      .where(eq(sm5GamePenalty.id, id));

    const mvpChanged = data.mvpValue !== undefined && data.mvpValue !== existing.mvpValue;
    const rescindChanged = data.rescinded !== undefined && data.rescinded !== existing.rescinded;

    if (mvpChanged || rescindChanged) {
      await upsertPenaltyMvpComponent(existing.scorecardId, tx);
      await recalculateScorecardMvp(existing.scorecardId, tx);
    }

    const scoreChanged = data.scoreValue !== undefined && data.scoreValue !== existing.scoreValue;
    if (scoreChanged || rescindChanged) {
      await recalculateGameResult(existing.gameId, tx);
    }
  });
}

export async function deletePenalty(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        scorecardId: sm5GamePenalty.scorecardId,
        gameId: sm5GamePenalty.gameId,
      })
      .from(sm5GamePenalty)
      .where(eq(sm5GamePenalty.id, id));

    if (!existing) return;

    await tx.delete(sm5GamePenalty).where(eq(sm5GamePenalty.id, id));
    await upsertPenaltyMvpComponent(existing.scorecardId, tx);
    await recalculateScorecardMvp(existing.scorecardId, tx);
    await recalculateGameResult(existing.gameId, tx);
  });
}

// ---------------------------------------------------------------------------
// Team Penalties
// ---------------------------------------------------------------------------

export type TeamPenaltyRecord = {
  id: string;
  gameTeamId: string;
  gameId: string;
  type: string;
  description: string;
  scoreValue: number;
  inGame: boolean;
  rescinded: boolean;
  time: number | null;
};

export async function getGameTeamPenalties(gameId: string): Promise<TeamPenaltyRecord[]> {
  const rows = await db
    .select({
      id: sm5GameTeamPenalty.id,
      gameTeamId: sm5GameTeamPenalty.gameTeamId,
      gameId: sm5GameTeamPenalty.gameId,
      type: sm5GameTeamPenalty.type,
      description: sm5GameTeamPenalty.description,
      scoreValue: sm5GameTeamPenalty.scoreValue,
      inGame: sm5GameTeamPenalty.inGame,
      rescinded: sm5GameTeamPenalty.rescinded,
      time: sm5GameTeamPenalty.time,
    })
    .from(sm5GameTeamPenalty)
    .where(eq(sm5GameTeamPenalty.gameId, gameId))
    .orderBy(sm5GameTeamPenalty.time);
  return rows;
}

export type CompetitionTeamPenaltyRecord = TeamPenaltyRecord & {
  teamName: string;
  gameStartTime: Date;
  centerName: string;
  gameSlug: string;
  competitionName: string | null;
  roundNumber: number | null;
  matchNumber: number | null;
  gameNumber: number | null;
  team1ShortName: string | null;
  team2ShortName: string | null;
};

/**
 * Team penalties across any scope (social / competition / all). Competition match
 * context comes from left joins, so it is simply null for social games.
 */
export async function getTeamPenalties(
  scopeFilter: GameScopeFilter,
): Promise<CompetitionTeamPenaltyRecord[]> {
  const scopeConditions = gameScopeConditions(scopeFilter);
  return db
    .select({
      id: sm5GameTeamPenalty.id,
      gameTeamId: sm5GameTeamPenalty.gameTeamId,
      gameId: sm5GameTeamPenalty.gameId,
      type: sm5GameTeamPenalty.type,
      description: sm5GameTeamPenalty.description,
      scoreValue: sm5GameTeamPenalty.scoreValue,
      inGame: sm5GameTeamPenalty.inGame,
      rescinded: sm5GameTeamPenalty.rescinded,
      time: sm5GameTeamPenalty.time,
      teamName: sm5GameTeam.name,
      gameStartTime: game.startTime,
      centerName: center.name,
      gameSlug: sql<string>`concat(${center.countryCode}::text, '-', ${center.siteCode}::text, '-', to_char(${game.startTime}, 'YYYYMMDDHH24MISS'))`,
      competitionName: competition.name,
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1ShortName: sql<
        string | null
      >`(select short_name from competition_team where id = ${competitionMatch.team1Id})`,
      team2ShortName: sql<
        string | null
      >`(select short_name from competition_team where id = ${competitionMatch.team2Id})`,
    })
    .from(sm5GameTeamPenalty)
    .innerJoin(sm5GameTeam, eq(sm5GameTeam.id, sm5GameTeamPenalty.gameTeamId))
    .innerJoin(game, eq(game.id, sm5GameTeamPenalty.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .leftJoin(competition, eq(competition.id, game.competitionId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.gameId, game.id))
    .leftJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .leftJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(scopeConditions.length ? and(...scopeConditions) : undefined)
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
      asc(sm5GameTeamPenalty.time),
    );
}

export async function addTeamPenalty(data: {
  gameTeamId: string;
  gameId: string;
  type?: string;
  description?: string;
  scoreValue?: number;
  inGame?: boolean;
}): Promise<string> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(sm5GameTeamPenalty)
      .values({
        gameTeamId: data.gameTeamId,
        gameId: data.gameId,
        type: data.type ?? "Common Foul",
        description: data.description ?? "",
        scoreValue: data.scoreValue ?? 0,
        inGame: data.inGame ?? false,
        rescinded: false,
      })
      .returning({ id: sm5GameTeamPenalty.id });

    if ((data.scoreValue ?? 0) !== 0) {
      await recalculateGameResult(data.gameId, tx);
    }

    return row.id;
  });
}

export async function updateTeamPenalty(
  id: string,
  data: {
    type?: string;
    description?: string;
    scoreValue?: number;
    rescinded?: boolean;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        gameId: sm5GameTeamPenalty.gameId,
        scoreValue: sm5GameTeamPenalty.scoreValue,
        rescinded: sm5GameTeamPenalty.rescinded,
      })
      .from(sm5GameTeamPenalty)
      .where(eq(sm5GameTeamPenalty.id, id));

    if (!existing) return;

    await tx
      .update(sm5GameTeamPenalty)
      .set({
        ...(data.type !== undefined && { type: data.type }),
        ...(data.description !== undefined && {
          description: data.description,
        }),
        ...(data.scoreValue !== undefined && { scoreValue: data.scoreValue }),
        ...(data.rescinded !== undefined && { rescinded: data.rescinded }),
      })
      .where(eq(sm5GameTeamPenalty.id, id));

    const scoreChanged = data.scoreValue !== undefined && data.scoreValue !== existing.scoreValue;
    const rescindChanged = data.rescinded !== undefined && data.rescinded !== existing.rescinded;

    if (scoreChanged || rescindChanged) {
      await recalculateGameResult(existing.gameId, tx);
    }
  });
}

export async function deleteTeamPenalty(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        gameId: sm5GameTeamPenalty.gameId,
      })
      .from(sm5GameTeamPenalty)
      .where(eq(sm5GameTeamPenalty.id, id));

    if (!existing) return;

    await tx.delete(sm5GameTeamPenalty).where(eq(sm5GameTeamPenalty.id, id));
    await recalculateGameResult(existing.gameId, tx);
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertPenaltyMvpComponent(scorecardId: string, tx: Tx): Promise<void> {
  // Get the scorecard's mvpModelId
  const [sc] = await tx
    .select({ mvpModelId: sm5Scorecard.mvpModelId })
    .from(sm5Scorecard)
    .where(eq(sm5Scorecard.id, scorecardId));
  if (!sc?.mvpModelId) return;

  // Sum non-rescinded penalty mvp values
  const [agg] = await tx
    .select({
      total: sql<number>`coalesce(sum(${sm5GamePenalty.mvpValue}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(sm5GamePenalty)
    .where(and(eq(sm5GamePenalty.scorecardId, scorecardId), eq(sm5GamePenalty.rescinded, false)));

  const total = Number(agg?.total ?? 0);
  const count = Number(agg?.count ?? 0);

  if (total === 0) {
    await tx
      .delete(sm5ScorecardMvp)
      .where(
        and(
          eq(sm5ScorecardMvp.scorecardId, scorecardId),
          eq(sm5ScorecardMvp.component, "penalty_adjustment"),
        ),
      );
  } else {
    await tx
      .insert(sm5ScorecardMvp)
      .values({
        scorecardId,
        mvpModelId: sc.mvpModelId,
        component: "penalty_adjustment",
        inputValue: count,
        points: total,
      })
      .onConflictDoUpdate({
        target: [
          sm5ScorecardMvp.scorecardId,
          sm5ScorecardMvp.mvpModelId,
          sm5ScorecardMvp.component,
        ],
        set: { inputValue: count, points: total },
      });
  }
}

async function recalculateScorecardMvp(scorecardId: string, tx: Tx): Promise<void> {
  await tx
    .update(sm5Scorecard)
    .set({
      mvpPoints: sql`(
        select coalesce(sum(${sm5ScorecardMvp.points}), 0)
        from ${sm5ScorecardMvp}
        where ${sm5ScorecardMvp.scorecardId} = ${scorecardId}
      )`,
    })
    .where(eq(sm5Scorecard.id, scorecardId));
}

export async function recalculateGameResult(gameId: string, tx: Tx): Promise<void> {
  const [gameRow] = await tx
    .select({ outcome: game.outcome })
    .from(game)
    .where(eq(game.id, gameId));
  if (!gameRow) return;

  const teams = await tx
    .select({
      id: sm5GameTeam.id,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
    })
    .from(sm5GameTeam)
    .where(and(eq(sm5GameTeam.gameId, gameId), eq(sm5GameTeam.isNeutral, false)));

  if (teams.length < 2) return;

  // Get penalty totals per team, from both player penalties and team penalties
  const [penaltyRows, teamPenaltyRows] = await Promise.all([
    tx
      .select({
        teamId: sm5Scorecard.teamId,
        total: sql<number>`coalesce(sum(${sm5GamePenalty.scoreValue}), 0)::int`,
      })
      .from(sm5GamePenalty)
      .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
      .where(and(eq(sm5GamePenalty.gameId, gameId), eq(sm5GamePenalty.rescinded, false)))
      .groupBy(sm5Scorecard.teamId),
    tx
      .select({
        teamId: sm5GameTeamPenalty.gameTeamId,
        total: sql<number>`coalesce(sum(${sm5GameTeamPenalty.scoreValue}), 0)::int`,
      })
      .from(sm5GameTeamPenalty)
      .where(and(eq(sm5GameTeamPenalty.gameId, gameId), eq(sm5GameTeamPenalty.rescinded, false)))
      .groupBy(sm5GameTeamPenalty.gameTeamId),
  ]);

  const penaltyMap = new Map(penaltyRows.map((r) => [r.teamId, r.total]));
  for (const r of teamPenaltyRows) {
    penaltyMap.set(r.teamId, (penaltyMap.get(r.teamId) ?? 0) + r.total);
  }

  const scores = teams.map((t) => ({
    id: t.id,
    penaltyScore: penaltyMap.get(t.id) ?? 0,
    effective: (t.score ?? 0) + (t.eliminationBonus ?? 0) + (penaltyMap.get(t.id) ?? 0),
  }));

  // Elimination/forfeit games: the winner is determined by elimination, not
  // score, so `result` is left untouched — but penaltyScore is always kept
  // current so the displayed score is correct regardless of outcome type.
  const recomputeResult = gameRow.outcome !== "elimination" && gameRow.outcome !== "forfeit";
  const maxScore = Math.max(...scores.map((s) => s.effective));
  const winners = scores.filter((s) => s.effective === maxScore);
  const isDraw = winners.length > 1;

  for (const s of scores) {
    await tx
      .update(sm5GameTeam)
      .set({
        penaltyScore: s.penaltyScore,
        ...(recomputeResult && {
          result: isDraw ? "draw" : s.effective === maxScore ? "win" : "loss",
        }),
      })
      .where(eq(sm5GameTeam.id, s.id));
  }
}
