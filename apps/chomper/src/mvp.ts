// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { ParsedSm5Stats, SimulatedGame } from "./types.js";
import { POSITION } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MvpComponent {
  component: string;
  inputValue: number;
  points: number;
}

export interface MvpRow {
  entityId: string;
  modelId: string;
  totalPoints: number;
  components: MvpComponent[];
}

// JSON shape for MvpModel.parameters (version 2021.12)
interface MvpParameters {
  universal: {
    accuracy_points_per_percent: number;
    medic_hit_opponent_points: number;
    medic_hit_team_points: number;
    elimination_bonus_minimum: number;
    elimination_bonus_seconds_threshold: number;
    elimination_bonus_points_per_second: number;
    nuke_cancel_opponent_points: number;
    nuke_cancel_team_points: number;
    missiled_points: number;
    eliminated_points: number;
  };
  commander: {
    missile_opponent_points: number;
    nuke_detonated_points: number;
    nuke_canceled_points: number;
    score_bonus_threshold: number;
    score_bonus_points_per_1000: number;
  };
  heavy: {
    missile_opponent_points: number;
    score_bonus_threshold: number;
    score_bonus_points_per_1000: number;
  };
  scout: {
    shot_3hit_points: number;
    score_bonus_threshold: number;
    score_bonus_points_per_1000: number;
  };
  ammo_carrier: {
    ammo_boost_points: number;
    score_bonus_threshold: number;
    score_bonus_points_per_1000: number;
  };
  medic: {
    life_boost_points: number;
    survival_bonus_points: number;
    score_bonus_threshold: number;
    score_bonus_points_per_1000: number;
  };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function calculateMvp(
  simResult: SimulatedGame,
  sm5StatsById: Map<string, ParsedSm5Stats>,
  entityEndsById: Map<string, { score: number; exitType: string }>,
  mvpModel: { id: string; parameters: unknown },
  scheduledDuration: number,
): MvpRow[] {
  const params = mvpModel.parameters as MvpParameters;
  const rows: MvpRow[] = [];

  for (const [entityId, ps] of simResult.playerStats) {
    const sm5 = sm5StatsById.get(entityId);
    const end = entityEndsById.get(entityId);
    if (!sm5 || !end) continue;

    const score = end.score;
    const eliminated = end.exitType === "04";
    const pos = ps.position;

    // Find this player's team and whether it won by elimination
    const simTeam = simResult.teams.find(
      (t) => t.tdfTeamIndex === ps.teamIndex,
    );
    const teamWonByElimination =
      simResult.outcome === "elimination" && simTeam?.result === "win";

    // Elimination bonus input: seconds of game time remaining above 3-min threshold
    let eliminationBonusInput = 0;
    let eliminationBonusPoints = 0;
    if (teamWonByElimination) {
      const remaining = (scheduledDuration - simResult.actualDuration) / 1000; // seconds
      const threshold = params.universal.elimination_bonus_seconds_threshold; // 180
      const secondsAbove = Math.max(0, remaining - threshold);
      eliminationBonusInput = r3(secondsAbove);
      eliminationBonusPoints =
        params.universal.elimination_bonus_minimum +
        secondsAbove * params.universal.elimination_bonus_points_per_second;
    }

    // Accuracy: ceil(accuracy × 100) percentage points
    // Multiply first to avoid floating point error (e.g. 56/100 * 100 = 56.0000...01)
    const accuracyPct =
      sm5.shotsFired > 0
        ? Math.round((sm5.shotsHit * 100) / sm5.shotsFired)
        : 0;

    const components: MvpComponent[] = [];

    const comp = (name: string, input: number, points: number) => {
      components.push({
        component: name,
        inputValue: r3(input),
        points: r3(points),
      });
    };

    // Universal components (all positions)
    comp(
      "accuracy",
      accuracyPct,
      accuracyPct * params.universal.accuracy_points_per_percent,
    );
    // Missile hits on a medic remove 2 lives, so each counts as 2 medic hits.
    const opponentMedicHits = sm5.medicHits + ps.missilesHitOpponentMedic * 2;
    const teamMedicHits = sm5.ownMedicHits + ps.missilesHitTeamMedic * 2;
    comp(
      "shots_hit_opponent_medic",
      opponentMedicHits,
      opponentMedicHits * params.universal.medic_hit_opponent_points,
    );
    comp(
      "shots_hit_team_medic",
      teamMedicHits,
      teamMedicHits * params.universal.medic_hit_team_points,
    );
    comp("elimination_bonus", eliminationBonusInput, eliminationBonusPoints);
    comp(
      "nukes_canceled",
      sm5.nukeCancels,
      sm5.nukeCancels * params.universal.nuke_cancel_opponent_points,
    );
    comp(
      "team_nukes_canceled",
      sm5.ownNukeCancels,
      sm5.ownNukeCancels * params.universal.nuke_cancel_team_points,
    );
    comp(
      "times_hit_by_missile",
      sm5.timesMissiled,
      sm5.timesMissiled * params.universal.missiled_points,
    );

    // Eliminated — all positions except Medic
    if (pos !== POSITION.MEDIC) {
      const elimInput = eliminated ? 1 : 0;
      comp(
        "eliminated",
        elimInput,
        elimInput * params.universal.eliminated_points,
      );
    } else {
      comp("eliminated", 0, 0);
    }

    // Position-specific
    if (pos === POSITION.COMMANDER || pos === POSITION.HEAVY) {
      const missilePoints =
        pos === POSITION.COMMANDER
          ? params.commander.missile_opponent_points
          : params.heavy.missile_opponent_points;
      comp(
        "missiles_hit_opponent",
        sm5.missiledOpponent,
        sm5.missiledOpponent * missilePoints,
      );
    } else {
      comp("missiles_hit_opponent", 0, 0);
    }

    if (pos === POSITION.COMMANDER) {
      comp(
        "nukes_detonated",
        sm5.nukesDetonated,
        sm5.nukesDetonated * params.commander.nuke_detonated_points,
      );
      const nukesCanceledByOpponent = sm5.nukesActivated - sm5.nukesDetonated;
      comp(
        "nukes_canceled_by_opponent",
        nukesCanceledByOpponent,
        nukesCanceledByOpponent * params.commander.nuke_canceled_points,
      );
    } else {
      comp("nukes_detonated", 0, 0);
      comp("nukes_canceled_by_opponent", 0, 0);
    }

    if (pos === POSITION.SCOUT) {
      comp(
        "shots_hit_opponent_3hit",
        sm5.shot3Hit,
        sm5.shot3Hit * params.scout.shot_3hit_points,
      );
    } else {
      comp("shots_hit_opponent_3hit", 0, 0);
    }

    if (pos === POSITION.AMMO) {
      comp(
        "ammo_boost",
        sm5.ammoBoost,
        sm5.ammoBoost * params.ammo_carrier.ammo_boost_points,
      );
    } else {
      comp("ammo_boost", 0, 0);
    }

    if (pos === POSITION.MEDIC) {
      comp(
        "life_boost",
        sm5.lifeBoost,
        sm5.lifeBoost * params.medic.life_boost_points,
      );
      const survivalInput = eliminated ? 0 : 1;
      comp(
        "survival_bonus",
        survivalInput,
        survivalInput * params.medic.survival_bonus_points,
      );
    } else {
      comp("life_boost", 0, 0);
      comp("survival_bonus", 0, 0);
    }

    // Score bonus — position-specific threshold and multiplier
    const scoreBonusThreshold = getScoreBonusThreshold(pos, params);
    const scoreBonusMultiplier = getScoreBonusMultiplier(pos, params);
    const scoreBonusInput = r3(Math.max(0, score - scoreBonusThreshold) / 1000);
    comp(
      "score_bonus",
      scoreBonusInput,
      scoreBonusInput * scoreBonusMultiplier,
    );

    const totalPoints = r3(components.reduce((sum, c) => sum + c.points, 0));

    rows.push({
      entityId,
      modelId: mvpModel.id,
      totalPoints,
      components,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreBonusThreshold(pos: number, params: MvpParameters): number {
  switch (pos) {
    case POSITION.COMMANDER:
      return params.commander.score_bonus_threshold;
    case POSITION.HEAVY:
      return params.heavy.score_bonus_threshold;
    case POSITION.SCOUT:
      return params.scout.score_bonus_threshold;
    case POSITION.AMMO:
      return params.ammo_carrier.score_bonus_threshold;
    case POSITION.MEDIC:
      return params.medic.score_bonus_threshold;
    default:
      return 0;
  }
}

function getScoreBonusMultiplier(pos: number, params: MvpParameters): number {
  switch (pos) {
    case POSITION.COMMANDER:
      return params.commander.score_bonus_points_per_1000;
    case POSITION.HEAVY:
      return params.heavy.score_bonus_points_per_1000;
    case POSITION.SCOUT:
      return params.scout.score_bonus_points_per_1000;
    case POSITION.AMMO:
      return params.ammo_carrier.score_bonus_points_per_1000;
    case POSITION.MEDIC:
      return params.medic.score_bonus_points_per_1000;
    default:
      return 0;
  }
}
