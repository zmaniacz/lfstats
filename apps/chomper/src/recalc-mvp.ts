// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  db,
  getAllMvpModels,
  getGameForRecalc,
  getGameIdsPage,
  getPenaltyMvpAggregatesForGame,
  getScorecardsForRecalc,
  getTeamsForRecalc,
  initDb,
  recalcMvpForGame,
} from "@lfstats/db";
import { calculateMvp } from "./mvp.js";
import type { ParsedSm5Stats, SimulatedGame } from "./types.js";

await initDb();

const allModels = await getAllMvpModels();
if (allModels.length === 0) {
  console.error("No MVP models found in database");
  process.exit(1);
}
const modelById = new Map(allModels.map((m) => [m.id, m]));

const PAGE_SIZE = 100;
let offset = 0;
let totalGames = 0;
let totalScorecards = 0;

while (true) {
  const page = await getGameIdsPage(PAGE_SIZE, offset);
  if (page.length === 0) break;
  offset += PAGE_SIZE;

  for (const { id: gameId } of page) {
    const gameRow = await getGameForRecalc(gameId);
    if (!gameRow) continue;

    const teams = await getTeamsForRecalc(gameId);
    const scorecards = await getScorecardsForRecalc(gameId);
    if (scorecards.length === 0) continue;

    const mvpModelId = scorecards[0]!.mvpModelId;
    const mvpModel = modelById.get(mvpModelId);
    if (!mvpModel) {
      console.warn(`  Game ${gameId}: MVP model ${mvpModelId} not found, skipping`);
      continue;
    }

    const simResult = {
      actualDuration: gameRow.actualDuration,
      outcome: gameRow.outcome,
      eliminationTime: null,
      teams: teams.map((t) => ({
        tdfTeamIndex: t.tdfTeamIndex,
        result: t.result ?? "draw",
      })),
      playerStats: new Map(
        scorecards.map((sc) => [
          sc.id,
          {
            position: sc.position,
            teamIndex: sc.tdfTeamIndex,
            missilesHitOpponentMedic: sc.missilesHitOpponentMedic,
            missilesHitTeamMedic: sc.missilesHitTeamMedic,
          },
        ]),
      ),
      events: [],
      targetDestructions: [],
      penalties: [],
      interactions: new Map(),
    } as unknown as SimulatedGame;

    const sm5StatsById = new Map<string, ParsedSm5Stats>(
      scorecards.map((sc) => [
        sc.id,
        {
          id: sc.id,
          shotsHit: sc.shotsHit,
          shotsFired: sc.shotsFired,
          timesZapped: sc.timesHit,
          timesMissiled: sc.timesHitByMissile,
          missileHits: sc.missileHits,
          nukesDetonated: sc.nukesDetonated ?? 0,
          nukesActivated: sc.nukesActivated ?? 0,
          nukeCancels: sc.nukesCanceled,
          medicHits: sc.medicHits,
          ownMedicHits: sc.teamMedicHits,
          medicNukes: 0,
          scoutRapid: 0,
          lifeBoost: sc.lifeBoost ?? 0,
          ammoBoost: sc.ammoBoost ?? 0,
          livesLeft: sc.livesLeft,
          shotsLeft: sc.shotsLeft,
          penalties: sc.penalties,
          shot3Hit: sc.shotsHitOpponent3hit,
          ownNukeCancels: sc.teamNukesCanceled,
          shotOpponent: sc.shotsHitOpponent,
          shotTeam: sc.shotsHitTeam,
          missiledOpponent: sc.missilesHitOpponent,
          missiledTeam: sc.missilesHitTeam,
        },
      ]),
    );

    const entityEndsById = new Map(
      scorecards.map((sc) => [sc.id, { score: sc.score, exitType: sc.eliminated ? "04" : "00" }]),
    );

    const mvpRows = calculateMvp(
      simResult,
      sm5StatsById,
      entityEndsById,
      mvpModel,
      gameRow.scheduledDuration,
    );

    // Build penalty_adjustment components from non-rescinded penalties with mvpValue != 0
    const penaltyAggregates = await getPenaltyMvpAggregatesForGame(gameId);
    const penaltyByScorecard = new Map(penaltyAggregates.map((p) => [p.scorecardId, p]));

    const penaltyComponents = penaltyAggregates.map((p) => ({
      scorecardId: p.scorecardId,
      mvpModelId: mvpModelId,
      component: "penalty_adjustment" as const,
      inputValue: Number(p.count),
      points: Number(p.total),
    }));

    const updates = mvpRows.map((r) => {
      const penalty = penaltyByScorecard.get(r.entityId);
      const penaltyPoints = penalty ? Number(penalty.total) : 0;
      return {
        id: r.entityId,
        mvpPoints: r.totalPoints + penaltyPoints,
        mvpModelId: r.modelId,
      };
    });

    await db.transaction((tx) =>
      recalcMvpForGame(
        tx,
        scorecards.map((sc) => sc.id),
        updates,
        [
          ...mvpRows.flatMap((r) =>
            r.components.map((c) => ({
              scorecardId: r.entityId,
              mvpModelId: r.modelId,
              component: c.component,
              inputValue: c.inputValue,
              points: c.points,
            })),
          ),
          ...penaltyComponents,
        ],
      ),
    );

    totalScorecards += scorecards.length;
    totalGames++;

    if (totalGames % 100 === 0) {
      console.log(`  ${totalGames} games, ${totalScorecards} scorecards…`);
    }
  }
}

console.log(`Done. Updated ${totalScorecards} scorecards across ${totalGames} games.`);
process.exit(0);
