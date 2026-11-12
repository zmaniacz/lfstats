// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Single-game SM5 reingest from an already-downloaded TDF: parse, simulate,
 * consistency-check, snapshot the admin-owned metadata, recompute MVP and rebuild
 * the game's rows. Shared by bulk-reingest (one game or all of them) and fix-player.
 */

import {
  findIngestMvpModels,
  getCompetitionMatchGameForReingest,
  getGameById,
  getPenaltiesWithIplForReingest,
  getScorecardsIsMercenaryForReingest,
  getTeamPenaltiesForReingest,
  refreshGameHighlights,
} from "@lfstats/db";
import { parseGameStartTime } from "./ingester.js";
import { calculateMvpForModels } from "./mvp.js";
import { ParseError, parseTdf, RejectionError } from "./parser.js";
import type { PreservedGameMeta } from "./reingester.js";
import { reingest } from "./reingester.js";
import { runConsistencyCheck, simulate } from "./simulator.js";

const DEADLOCK_CODE = "40P01";
const MAX_REINGEST_RETRIES = 3;

export type MvpModels = Awaited<ReturnType<typeof findIngestMvpModels>>;

export type Sm5ReingestResult =
  | { status: "reingested" }
  | { status: "skipped"; reason: string }
  | {
      status: "failed";
      stage: "parse" | "simulate" | "consistency" | "missing" | "reingest";
      reason: string;
    };

export interface Sm5ReingestOptions {
  /**
   * Old ipl id → new ipl id. The admin-owned metadata snapshotted before the
   * rebuild (penalty overrides, post-game penalties, mercenary flags) is keyed by
   * the ipl id the game was previously ingested under; when the TDF's player ids
   * have just been corrected, those keys must follow the player or they would be
   * silently dropped.
   */
  iplRemap?: Map<string, string>;
}

async function reingestWithRetry(...args: Parameters<typeof reingest>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await reingest(...args);
    } catch (err: unknown) {
      const isDeadlock =
        typeof err === "object" &&
        err !== null &&
        "cause" in err &&
        typeof (err as { cause?: unknown }).cause === "object" &&
        (err as { cause?: { code?: string } }).cause?.code === DEADLOCK_CODE;
      if (!isDeadlock || attempt >= MAX_REINGEST_RETRIES) throw err;
      console.warn(`Deadlock on reingest attempt ${attempt}, retrying…`);
    }
  }
}

export async function reingestSm5Game(
  gameId: string,
  buffer: Buffer,
  mvpModels: MvpModels,
  options: Sm5ReingestOptions = {},
): Promise<Sm5ReingestResult> {
  const remapIpl = (id: string | null): string | null =>
    id === null ? null : (options.iplRemap?.get(id) ?? id);

  // 1. Parse TDF
  let parsed;
  try {
    parsed = parseTdf(buffer);
  } catch (err) {
    const reason =
      err instanceof RejectionError
        ? `Rejected: ${err.message}`
        : err instanceof ParseError
          ? `Parse error: ${err.message}`
          : `Unexpected parse error: ${(err as Error).message}`;
    return { status: "failed", stage: "parse", reason };
  }

  // 2. Only SM5 is re-ingestable here. Laserball games (mission type 28) have no
  // preserved SM5 metadata (penalties/mercenaries/MVP) and their own reingester,
  // so they are intentionally skipped rather than treated as anomalies.
  if (parsed.meta.missionType !== 5) {
    return {
      status: "skipped",
      reason: `Mission type ${parsed.meta.missionType} is not SM5 (not re-ingestable here)`,
    };
  }

  // 3. Simulate
  let simResult;
  try {
    simResult = simulate(parsed);
  } catch (err) {
    return {
      status: "failed",
      stage: "simulate",
      reason: `Simulation failed: ${(err as Error).message}`,
    };
  }

  // 4. Consistency check
  const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
  const { discrepancies } = runConsistencyCheck(
    simResult.playerStats,
    sm5StatsById,
    simResult.resourceLog,
  );
  if (discrepancies.length > 0) {
    return {
      status: "failed",
      stage: "consistency",
      reason: `Consistency check failed:\n${JSON.stringify(discrepancies, null, 2)}`,
    };
  }

  // 5. Snapshot metadata to preserve
  const [gameRow, matchGameRow, penaltyRows, mercenaryRows, teamPenaltyRows] = await Promise.all([
    getGameById(gameId),
    getCompetitionMatchGameForReingest(gameId),
    getPenaltiesWithIplForReingest(gameId),
    getScorecardsIsMercenaryForReingest(gameId),
    getTeamPenaltiesForReingest(gameId),
  ]);

  if (!gameRow) {
    return {
      status: "failed",
      stage: "missing",
      reason: "Game row disappeared between listing and reingest",
    };
  }

  const inGamePenalties: PreservedGameMeta["inGamePenalties"] = new Map();
  const postGamePenalties: PreservedGameMeta["postGamePenalties"] = [];

  for (const p of penaltyRows) {
    if (p.time !== null) {
      const key = `${remapIpl(p.iplId) ?? ""}:${p.time}`;
      inGamePenalties.set(key, {
        rescinded: p.rescinded,
        type: p.type,
        scoreValue: p.scoreValue,
        mvpValue: p.mvpValue,
        description: p.description,
        inGame: p.inGame,
      });
    } else {
      postGamePenalties.push({
        iplId: remapIpl(p.iplId),
        refereeIplId: remapIpl(p.refereeIplId),
        refereeHardwareId: p.refereeHardwareId,
        scoreValue: p.scoreValue,
        description: p.description,
        type: p.type,
        mvpValue: p.mvpValue,
        inGame: p.inGame,
        rescinded: p.rescinded,
      });
    }
  }

  const preservedMeta: PreservedGameMeta = {
    competitionId: gameRow.competitionId ?? null,
    exclude: gameRow.exclude,
    description: gameRow.description ?? null,
    matchGame: matchGameRow
      ? {
          matchId: matchGameRow.matchId,
          gameNumber: matchGameRow.gameNumber,
          team1TdfTeamIndex: matchGameRow.team1TdfTeamIndex,
          team2TdfTeamIndex: matchGameRow.team2TdfTeamIndex,
          assignedBy: matchGameRow.assignedBy,
        }
      : null,
    inGamePenalties,
    postGamePenalties,
    mercenaries: new Set(
      mercenaryRows.map((r) => remapIpl(r.iplId)).filter((id): id is string => !!id),
    ),
    teamPenalties: teamPenaltyRows,
  };

  // 6. Calculate MVP
  const gameStartTime = parseGameStartTime(parsed.meta.startTime);
  const entityEndsById = new Map(
    parsed.entityEnds.map((e) => [e.id, { score: e.score, exitType: e.exitType }]),
  );
  const mvpRows = calculateMvpForModels(
    simResult,
    sm5StatsById,
    entityEndsById,
    mvpModels,
    parsed.meta.duration,
  );

  // 7. Reingest
  try {
    await reingestWithRetry(gameId, preservedMeta, parsed, simResult, gameStartTime, mvpRows);
  } catch (err) {
    return {
      status: "failed",
      stage: "reingest",
      reason: `Reingest failed: ${(err as Error).message}`,
    };
  }

  await refreshGameHighlights(gameId);
  return { status: "reingested" };
}
