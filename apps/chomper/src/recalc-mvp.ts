// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Recomputes MVP for stored SM5 games without re-simulating.
//
//   pnpm --filter chomper recalcMVP                         every non-retired model
//   pnpm --filter chomper recalcMVP --model 2027.1-dev   one model only (backfill)
//   pnpm --filter chomper recalcMVP --game <game-id>     one game only
//
// Only the default model writes sm5_scorecard.mvp_points / mvp_model_id; every selected
// model gets its sm5_scorecard_mvp breakdown rows (and penalty_adjustment) replaced.
// Ammo/Medic boost recipients are filled from the replay state rows first wherever they are
// still null (games ingested before the columns existed).

import { parseArgs } from "node:util";
import {
  backfillBoostRecipientsForGame,
  db,
  findActiveMvpModels,
  getGameForRecalc,
  getGameIdsPage,
  getPenaltyMvpAggregatesForGame,
  getScorecardsForRecalc,
  getTeamsForRecalc,
  initDb,
  recalcMvpForGame,
} from "@lfstats/db";
import { calculateMvpForModels } from "./mvp.js";
import type { ParsedSm5Stats, SimulatedGame } from "./types.js";
import { POSITION } from "./types.js";

const { values: args } = parseArgs({
  // pnpm may forward a literal "--" separator; drop it so the flags still parse.
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    model: { type: "string" },
    game: { type: "string" },
  },
});

await initDb();

const activeModels = await findActiveMvpModels();
const defaultModels = activeModels.filter((m) => m.isDefault);
if (defaultModels.length !== 1) {
  console.error(
    `Expected exactly one non-retired default MVP model, found ${defaultModels.length}`,
  );
  process.exit(1);
}

const targetModels = args.model
  ? activeModels.filter((m) => m.version === args.model)
  : activeModels;
if (targetModels.length === 0) {
  console.error(
    `No non-retired MVP model "${args.model}". Available: ${activeModels.map((m) => m.version).join(", ")}`,
  );
  process.exit(1);
}
const targetModelIds = targetModels.map((m) => m.id);
console.log(
  `Recomputing MVP for ${targetModels.map((m) => `${m.version}${m.isDefault ? " (default)" : ""}`).join(", ")}`,
);

const PAGE_SIZE = 100;
let offset = 0;
let totalGames = 0;
let totalScorecards = 0;
let recipientBackfills = 0;

async function recalcGame(gameId: string): Promise<void> {
  const gameRow = await getGameForRecalc(gameId);
  if (!gameRow) return;

  const teams = await getTeamsForRecalc(gameId);
  let scorecards = await getScorecardsForRecalc(gameId);
  if (scorecards.length === 0) return;

  // Boost recipients are stored per scorecard since MVP2027. Older games get them from the
  // replay state rows once, here, rather than being guessed.
  const missingRecipients = scorecards.some(
    (sc) =>
      (sc.position === POSITION.AMMO && sc.ammoBoostRecipients === null) ||
      (sc.position === POSITION.MEDIC && sc.lifeBoostRecipients === null),
  );
  if (missingRecipients) {
    await backfillBoostRecipientsForGame(gameId);
    scorecards = await getScorecardsForRecalc(gameId);
    recipientBackfills++;
  }

  // Reconstruct, per non-neutral team, how many nukes were cancelled by players on
  // that team. A Commander's own "cancelled by opponent" count is then the sum of
  // this across every OTHER non-neutral team — exact for the standard 2-team case,
  // since a cancel recorded by any player on the sole opposing team can only have
  // targeted this team's one Commander.
  const nukesCanceledByTeamIndex = new Map<number, number>();
  for (const sc of scorecards) {
    if (sc.isNeutral) continue;
    nukesCanceledByTeamIndex.set(
      sc.tdfTeamIndex,
      (nukesCanceledByTeamIndex.get(sc.tdfTeamIndex) ?? 0) + sc.nukesCanceled,
    );
  }
  const nukeCanceledByOpponentForTeam = (teamIndex: number): number => {
    let total = 0;
    for (const [idx, sum] of nukesCanceledByTeamIndex) {
      if (idx !== teamIndex) total += sum;
    }
    return total;
  };

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
          nukeCanceledByOpponent: sc.isNeutral ? 0 : nukeCanceledByOpponentForTeam(sc.tdfTeamIndex),
          assists: sc.assists,
          resetOpponent: sc.resetOpponent,
          timesReset: sc.timesReset,
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

  // Stored recipients (exactly one of the two columns is set, by position).
  const boostRecipientsById = new Map<string, number>();
  for (const sc of scorecards) {
    const reached = sc.ammoBoostRecipients ?? sc.lifeBoostRecipients;
    if (reached !== null) boostRecipientsById.set(sc.id, reached);
  }

  const mvpRows = calculateMvpForModels(
    simResult,
    sm5StatsById,
    entityEndsById,
    targetModels,
    gameRow.scheduledDuration,
    boostRecipientsById,
  );

  // Penalty deductions belong to every model's breakdown and total.
  const penaltyAggregates = await getPenaltyMvpAggregatesForGame(gameId);
  const penaltyByScorecard = new Map(penaltyAggregates.map((p) => [p.scorecardId, p]));
  const penaltyComponents = targetModels.flatMap((model) =>
    penaltyAggregates.map((p) => ({
      scorecardId: p.scorecardId,
      mvpModelId: model.id,
      component: "penalty_adjustment" as const,
      inputValue: Number(p.count),
      points: Number(p.total),
    })),
  );

  // Only the default model's totals are written to sm5_scorecard.mvp_points.
  const updates = mvpRows
    .filter((r) => r.isDefault)
    .map((r) => {
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
      targetModelIds,
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

if (args.game) {
  await recalcGame(args.game);
} else {
  while (true) {
    const page = await getGameIdsPage(PAGE_SIZE, offset);
    if (page.length === 0) break;
    offset += PAGE_SIZE;
    for (const { id: gameId } of page) {
      await recalcGame(gameId);
    }
  }
}

console.log(
  `Done. Updated ${totalScorecards} scorecards across ${totalGames} games ` +
    `(boost recipients backfilled for ${recipientBackfills} games).`,
);
process.exit(0);
