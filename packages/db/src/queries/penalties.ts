// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  sm5GamePenalty,
  sm5Scorecard,
  sm5ScorecardMvp,
  sm5GameTeam,
  game,
  player,
  center,
  competitionMatchGame,
  competitionMatch,
  competitionRound,
  competitionTeam,
} from "../schema";
import { eq, and, sql, asc, isNull } from "drizzle-orm";

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
  // Competition match context (null if game not assigned to a match)
  roundNumber: number | null;
  matchNumber: number | null;
  gameNumber: number | null;
  team1ShortName: string | null;
  team2ShortName: string | null;
};

export async function getCompetitionPenalties(
  competitionId: string,
): Promise<CompetitionPenaltyRecord[]> {
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
      roundNumber: competitionRound.roundNumber,
      matchNumber: competitionMatch.matchNumber,
      gameNumber: competitionMatchGame.gameNumber,
      team1ShortName: sql<string | null>`(select short_name from competition_team where id = ${competitionMatch.team1Id})`,
      team2ShortName: sql<string | null>`(select short_name from competition_team where id = ${competitionMatch.team2Id})`,
    })
    .from(sm5GamePenalty)
    .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
    .innerJoin(game, eq(game.id, sm5GamePenalty.gameId))
    .innerJoin(center, eq(center.id, game.centerId))
    .leftJoin(competitionMatchGame, eq(competitionMatchGame.gameId, game.id))
    .leftJoin(competitionMatch, eq(competitionMatch.id, competitionMatchGame.matchId))
    .leftJoin(competitionRound, eq(competitionRound.id, competitionMatch.roundId))
    .where(eq(game.competitionId, competitionId))
    .orderBy(
      asc(competitionRound.roundNumber),
      asc(competitionMatch.matchNumber),
      asc(competitionMatchGame.gameNumber),
      asc(sm5GamePenalty.time),
    );
}

export async function getTeamPenaltyTotals(
  gameId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      teamId: sm5Scorecard.teamId,
      total: sql<number>`coalesce(sum(${sm5GamePenalty.scoreValue}), 0)::int`,
    })
    .from(sm5GamePenalty)
    .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
    .where(
      and(
        eq(sm5GamePenalty.gameId, gameId),
        eq(sm5GamePenalty.rescinded, false),
      ),
    )
    .groupBy(sm5Scorecard.teamId);

  return new Map(rows.map((r) => [r.teamId, r.total]));
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
        ...(data.description !== undefined && { description: data.description }),
        ...(data.scoreValue !== undefined && { scoreValue: data.scoreValue }),
        ...(data.mvpValue !== undefined && { mvpValue: data.mvpValue }),
        ...(data.rescinded !== undefined && { rescinded: data.rescinded }),
      })
      .where(eq(sm5GamePenalty.id, id));

    const mvpChanged =
      data.mvpValue !== undefined && data.mvpValue !== existing.mvpValue;
    const rescindChanged =
      data.rescinded !== undefined && data.rescinded !== existing.rescinded;

    if (mvpChanged || rescindChanged) {
      await upsertPenaltyMvpComponent(existing.scorecardId, tx);
      await recalculateScorecardMvp(existing.scorecardId, tx);
    }

    const scoreChanged =
      data.scoreValue !== undefined && data.scoreValue !== existing.scoreValue;
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
// Internal helpers
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function upsertPenaltyMvpComponent(
  scorecardId: string,
  tx: Tx,
): Promise<void> {
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
    .where(
      and(
        eq(sm5GamePenalty.scorecardId, scorecardId),
        eq(sm5GamePenalty.rescinded, false),
      ),
    );

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

async function recalculateScorecardMvp(
  scorecardId: string,
  tx: Tx,
): Promise<void> {
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

async function recalculateGameResult(gameId: string, tx: Tx): Promise<void> {
  // Elimination games: result is determined by elimination, not score
  const [gameRow] = await tx
    .select({ outcome: game.outcome })
    .from(game)
    .where(eq(game.id, gameId));
  if (!gameRow || gameRow.outcome === "elimination" || gameRow.outcome === "forfeit") return;

  const teams = await tx
    .select({
      id: sm5GameTeam.id,
      score: sm5GameTeam.score,
      eliminationBonus: sm5GameTeam.eliminationBonus,
    })
    .from(sm5GameTeam)
    .where(
      and(eq(sm5GameTeam.gameId, gameId), eq(sm5GameTeam.isNeutral, false)),
    );

  if (teams.length < 2) return;

  // Get penalty totals per team
  const penaltyRows = await tx
    .select({
      teamId: sm5Scorecard.teamId,
      total: sql<number>`coalesce(sum(${sm5GamePenalty.scoreValue}), 0)::int`,
    })
    .from(sm5GamePenalty)
    .innerJoin(sm5Scorecard, eq(sm5Scorecard.id, sm5GamePenalty.scorecardId))
    .where(
      and(
        eq(sm5GamePenalty.gameId, gameId),
        eq(sm5GamePenalty.rescinded, false),
      ),
    )
    .groupBy(sm5Scorecard.teamId);

  const penaltyMap = new Map(penaltyRows.map((r) => [r.teamId, r.total]));

  const scores = teams.map((t) => ({
    id: t.id,
    effective:
      (t.score ?? 0) + (t.eliminationBonus ?? 0) + (penaltyMap.get(t.id) ?? 0),
  }));

  const maxScore = Math.max(...scores.map((s) => s.effective));
  const winners = scores.filter((s) => s.effective === maxScore);
  const isDraw = winners.length > 1;

  for (const s of scores) {
    const result = isDraw ? "draw" : s.effective === maxScore ? "win" : "loss";
    await tx
      .update(sm5GameTeam)
      .set({ result })
      .where(eq(sm5GameTeam.id, s.id));
  }
}
