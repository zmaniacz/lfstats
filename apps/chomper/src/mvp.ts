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
  // True for the default model's row: only that one may be written to
  // sm5_scorecard.mvp_points / mvp_model_id. Every model's components are stored.
  isDefault: boolean;
  totalPoints: number;
  components: MvpComponent[];
}

export interface MvpModelInput {
  id: string;
  parameters: unknown;
  isDefault: boolean;
}

// Shared shape of every per-position parameter block. Keys marked optional are absent from
// older models (2021.12); a component whose key is absent is not emitted at all, so a
// model's stored breakdown only ever lists the components it defines.
interface PositionParameters {
  // Per-position accuracy weight (MVP2027). Falls back to universal.accuracy_points_per_percent.
  accuracy_points_per_percent?: number;
  score_bonus_threshold: number;
  // 0 disables the score bonus for the position (stored as input 0, points 0).
  score_bonus_points_per_1000: number;
}

// JSON shape for MvpModel.parameters (2021.12 and later)
interface MvpParameters {
  universal: {
    accuracy_points_per_percent: number;
    medic_hit_opponent_points: number;
    medic_hit_team_points: number;
    // Team won by elimination: minimum + points_per_second × max(0, seconds of scheduled
    // time left − seconds_threshold). 2021.12: 4 + 1/min beyond 3 min; 2027.1: 1 + 0.75/min.
    elimination_bonus_minimum: number;
    elimination_bonus_seconds_threshold: number;
    elimination_bonus_points_per_second: number;
    nuke_cancel_opponent_points: number;
    nuke_cancel_team_points: number;
    missiled_points: number;
    eliminated_points: number;
  };
  commander: PositionParameters & {
    // Commander-only override of universal.medic_hit_opponent_points (MVP2027 C1).
    medic_hit_opponent_points?: number;
    missile_opponent_points: number;
    nuke_detonated_points: number;
    nuke_canceled_points: number;
  };
  heavy: PositionParameters & {
    missile_opponent_points: number;
  };
  scout: PositionParameters & {
    shot_3hit_points: number;
    reset_opponent_points?: number;
  };
  ammo_carrier: PositionParameters & {
    ammo_boost_points?: number;
    ammo_boost_recipient_points?: number;
    assist_points?: number;
  };
  medic: PositionParameters & {
    life_boost_points?: number;
    life_boost_recipient_points?: number;
    times_reset_points?: number;
    assist_points?: number;
    survival_bonus_points: number;
  };
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------------------
// Boost recipients
// ---------------------------------------------------------------------------

/**
 * Teammates reached by each player's boosts, summed over every boost they fired.
 *
 * A teammate is reached by a boost when their state snapshot at the boost event shows more
 * shots (0510 ammo boost) or lives (0512 life boost) than their previous snapshot. This is
 * the rule the MVP2027 analysis applied to sm5_game_player_state (scripts/mvp2027/
 * ammo_ev.sql, med_ev.sql), and `backfillBoostRecipientsForGames` in @lfstats/db repeats it
 * in SQL for games ingested before the columns existed. A teammate already at maximum, or
 * down when the boost fired, gets no increase and does not count.
 *
 * Keyed by the boosting player's entityId; players who never reached anyone are absent.
 */
export function computeBoostRecipients(simResult: SimulatedGame): Map<string, number> {
  const boosts = new Map<number, { actor: string; kind: "shots" | "lives" }>();
  simResult.events.forEach((e, i) => {
    if (!e.actorEntityId) return;
    if (e.eventType === "0510") boosts.set(i, { actor: e.actorEntityId, kind: "shots" });
    else if (e.eventType === "0512") boosts.set(i, { actor: e.actorEntityId, kind: "lives" });
  });

  const counts = new Map<string, number>();
  if (boosts.size === 0) return counts;

  for (const [entityId, ps] of simResult.playerStats) {
    const snaps = [...ps.stateSnapshots].sort((a, b) => a.eventIndex - b.eventIndex);
    for (let i = 1; i < snaps.length; i++) {
      const snap = snaps[i]!;
      const boost = boosts.get(snap.eventIndex);
      if (!boost || boost.actor === entityId) continue;
      const prev = snaps[i - 1]!;
      const reached = boost.kind === "shots" ? snap.shots > prev.shots : snap.lives > prev.lives;
      if (reached) counts.set(boost.actor, (counts.get(boost.actor) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * MVP rows for every given model (normally every non-retired model). Exactly one of them
 * should be the default; its rows carry isDefault and are the only ones a caller may write
 * to sm5_scorecard.mvp_points.
 */
export function calculateMvpForModels(
  simResult: SimulatedGame,
  sm5StatsById: Map<string, ParsedSm5Stats>,
  entityEndsById: Map<string, { score: number; exitType: string }>,
  mvpModels: MvpModelInput[],
  scheduledDuration: number,
  boostRecipientsById: Map<string, number> = computeBoostRecipients(simResult),
): MvpRow[] {
  return mvpModels.flatMap((model) =>
    calculateMvp(
      simResult,
      sm5StatsById,
      entityEndsById,
      model,
      scheduledDuration,
      boostRecipientsById,
    ),
  );
}

export function calculateMvp(
  simResult: SimulatedGame,
  sm5StatsById: Map<string, ParsedSm5Stats>,
  entityEndsById: Map<string, { score: number; exitType: string }>,
  mvpModel: MvpModelInput,
  scheduledDuration: number,
  boostRecipientsById: Map<string, number> = computeBoostRecipients(simResult),
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
    const posParams = getPositionParams(pos, params);

    // Find this player's team and whether it won by elimination
    const simTeam = simResult.teams.find((t) => t.tdfTeamIndex === ps.teamIndex);
    const teamWonByElimination = simResult.outcome === "elimination" && simTeam?.result === "win";

    // Elimination bonus input: seconds of scheduled game time remaining above the threshold
    let eliminationBonusInput = 0;
    let eliminationBonusPoints = 0;
    if (teamWonByElimination) {
      const remaining = (scheduledDuration - simResult.actualDuration) / 1000; // seconds
      const threshold = params.universal.elimination_bonus_seconds_threshold;
      const secondsAbove = Math.max(0, remaining - threshold);
      eliminationBonusInput = r3(secondsAbove);
      eliminationBonusPoints =
        params.universal.elimination_bonus_minimum +
        secondsAbove * params.universal.elimination_bonus_points_per_second;
    }

    // Accuracy: round(accuracy × 100) percentage points
    // Multiply first to avoid floating point error (e.g. 56/100 * 100 = 56.0000...01)
    const accuracyPct = sm5.shotsFired > 0 ? Math.round((sm5.shotsHit * 100) / sm5.shotsFired) : 0;
    const accuracyWeight =
      posParams?.accuracy_points_per_percent ?? params.universal.accuracy_points_per_percent;

    const components: MvpComponent[] = [];

    const comp = (name: string, input: number, points: number) => {
      components.push({
        component: name,
        inputValue: r3(input),
        points: r3(points),
      });
    };

    // Universal components (all positions)
    comp("accuracy", accuracyPct, accuracyPct * accuracyWeight);
    const opponentMedicHits = sm5.medicHits;
    const teamMedicHits = sm5.ownMedicHits;
    const opponentMedicHitPoints =
      (pos === POSITION.COMMANDER ? params.commander.medic_hit_opponent_points : undefined) ??
      params.universal.medic_hit_opponent_points;
    comp("shots_hit_opponent_medic", opponentMedicHits, opponentMedicHits * opponentMedicHitPoints);
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
      comp("eliminated", elimInput, elimInput * params.universal.eliminated_points);
    } else {
      comp("eliminated", 0, 0);
    }

    // Position-specific
    if (pos === POSITION.COMMANDER || pos === POSITION.HEAVY) {
      const missilePoints =
        pos === POSITION.COMMANDER
          ? params.commander.missile_opponent_points
          : params.heavy.missile_opponent_points;
      comp("missiles_hit_opponent", sm5.missiledOpponent, sm5.missiledOpponent * missilePoints);
    } else {
      comp("missiles_hit_opponent", 0, 0);
    }

    if (pos === POSITION.COMMANDER) {
      comp(
        "nukes_detonated",
        sm5.nukesDetonated,
        sm5.nukesDetonated * params.commander.nuke_detonated_points,
      );
      const nukesCanceledByOpponent = ps.nukeCanceledByOpponent;
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
      comp("shots_hit_opponent_3hit", sm5.shot3Hit, sm5.shot3Hit * params.scout.shot_3hit_points);
    } else {
      comp("shots_hit_opponent_3hit", 0, 0);
    }

    // Opponents reset — Scout only (MVP2027 S1)
    const resetOpponentPoints = params.scout.reset_opponent_points;
    if (resetOpponentPoints !== undefined) {
      if (pos === POSITION.SCOUT) {
        comp("reset_opponent", ps.resetOpponent, ps.resetOpponent * resetOpponentPoints);
      } else {
        comp("reset_opponent", 0, 0);
      }
    }

    const ammoBoostPoints = params.ammo_carrier.ammo_boost_points;
    if (ammoBoostPoints !== undefined) {
      if (pos === POSITION.AMMO) {
        comp("ammo_boost", sm5.ammoBoost, sm5.ammoBoost * ammoBoostPoints);
      } else {
        comp("ammo_boost", 0, 0);
      }
    }

    // Teammates reached by ammo boosts — Ammo only (MVP2027 A2)
    const ammoRecipientPoints = params.ammo_carrier.ammo_boost_recipient_points;
    if (ammoRecipientPoints !== undefined) {
      if (pos === POSITION.AMMO) {
        const reached = boostRecipientsById.get(entityId) ?? 0;
        comp("ammo_boost_recipients", reached, reached * ammoRecipientPoints);
      } else {
        comp("ammo_boost_recipients", 0, 0);
      }
    }

    const lifeBoostPoints = params.medic.life_boost_points;
    if (lifeBoostPoints !== undefined) {
      if (pos === POSITION.MEDIC) {
        comp("life_boost", sm5.lifeBoost, sm5.lifeBoost * lifeBoostPoints);
      } else {
        comp("life_boost", 0, 0);
      }
    }

    // Teammates reached by life boosts — Medic only (MVP2027 M1)
    const lifeRecipientPoints = params.medic.life_boost_recipient_points;
    if (lifeRecipientPoints !== undefined) {
      if (pos === POSITION.MEDIC) {
        const reached = boostRecipientsById.get(entityId) ?? 0;
        comp("life_boost_recipients", reached, reached * lifeRecipientPoints);
      } else {
        comp("life_boost_recipients", 0, 0);
      }
    }

    if (pos === POSITION.MEDIC) {
      const survivalInput = eliminated ? 0 : 1;
      comp("survival_bonus", survivalInput, survivalInput * params.medic.survival_bonus_points);
    } else {
      comp("survival_bonus", 0, 0);
    }

    // Times reset — Medic only (MVP2027 M2)
    const timesResetPoints = params.medic.times_reset_points;
    if (timesResetPoints !== undefined) {
      if (pos === POSITION.MEDIC) {
        comp("times_reset", ps.timesReset, ps.timesReset * timesResetPoints);
      } else {
        comp("times_reset", 0, 0);
      }
    }

    // Assists — Ammo and Medic (MVP2027 A4, M4)
    const ammoAssistPoints = params.ammo_carrier.assist_points;
    const medicAssistPoints = params.medic.assist_points;
    if (ammoAssistPoints !== undefined || medicAssistPoints !== undefined) {
      const assistPoints =
        pos === POSITION.AMMO
          ? (ammoAssistPoints ?? 0)
          : pos === POSITION.MEDIC
            ? (medicAssistPoints ?? 0)
            : 0;
      if (assistPoints !== 0) {
        comp("assists", ps.assists, ps.assists * assistPoints);
      } else {
        comp("assists", 0, 0);
      }
    }

    // Score bonus — position-specific threshold and multiplier
    const scoreBonusThreshold = posParams?.score_bonus_threshold ?? 0;
    const scoreBonusMultiplier = posParams?.score_bonus_points_per_1000 ?? 0;
    const scoreBonusInput =
      scoreBonusMultiplier === 0 ? 0 : r3(Math.max(0, score - scoreBonusThreshold) / 1000);
    comp("score_bonus", scoreBonusInput, scoreBonusInput * scoreBonusMultiplier);

    const totalPoints = r3(components.reduce((sum, c) => sum + c.points, 0));

    rows.push({
      entityId,
      modelId: mvpModel.id,
      isDefault: mvpModel.isDefault,
      totalPoints,
      components,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPositionParams(pos: number, params: MvpParameters): PositionParameters | null {
  switch (pos) {
    case POSITION.COMMANDER:
      return params.commander;
    case POSITION.HEAVY:
      return params.heavy;
    case POSITION.SCOUT:
      return params.scout;
    case POSITION.AMMO:
      return params.ammo_carrier;
    case POSITION.MEDIC:
      return params.medic;
    default:
      return null;
  }
}
