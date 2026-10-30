// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  createChomperJob,
  findActiveMvpModel,
  findCenterByNaturalKey,
  findChomperJobByLambdaRequestId,
  findGameByNaturalKey,
  getCompetitionBySlug,
  updateChomperJob,
} from "@lfstats/db";
import { buildArchiveKey, ingest, parseGameStartTime } from "./ingester.js";
import { calculateMvp } from "./mvp.js";
import { ParseError, RejectionError, parseTdf } from "./parser.js";
import { archiveTdf, deleteTdf, fetchTdf, isMissingObjectError, objectExists } from "./s3.js";
import { runConsistencyCheck, simulate } from "./simulator.js";
import { simulateLaserball } from "./laserball/simulator.js";
import { ingestLaserball } from "./laserball/ingester.js";
import { LASERBALL_MISSION_TYPE } from "./laserball/types.js";
import { buildGameSlug, notifyNewGame } from "./webhook.js";

const DEADLOCK_CODE = "40P01";
const MAX_INGEST_RETRIES = 3;

async function ingestWithRetry(...args: Parameters<typeof ingest>): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ingest(...args);
    } catch (err: unknown) {
      const isDeadlock =
        typeof err === "object" &&
        err !== null &&
        "cause" in err &&
        typeof (err as { cause?: unknown }).cause === "object" &&
        (err as { cause?: { code?: string } }).cause?.code === DEADLOCK_CODE;
      if (!isDeadlock || attempt >= MAX_INGEST_RETRIES) throw err;
      console.warn(`Deadlock on ingest attempt ${attempt}, retrying…`);
    }
  }
}

const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET;
const ERROR_BUCKET = process.env.ERROR_BUCKET;

if (!process.env.INCOMING_BUCKET) throw new Error("Missing env var: INCOMING_BUCKET");
if (!ARCHIVE_BUCKET) throw new Error("Missing env var: ARCHIVE_BUCKET");
if (!ERROR_BUCKET) throw new Error("Missing env var: ERROR_BUCKET");

/** S3 event keys arrive URL-encoded, with spaces as `+`. */
export function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, " "));
}

/**
 * Runs one incoming TDF through the whole pipeline. `requestId` makes it
 * idempotent: it must be the same on every redelivery of the same event.
 *
 * Resolves once the outcome is recorded on the ChomperJob and the file has left
 * the incoming bucket; a failure that got that far is the resolved `Error`, and
 * retrying it would achieve nothing. A rejection means the outcome could not be
 * recorded (typically the database is unreachable) and the event should be
 * delivered again.
 */
export async function processFile(
  bucket: string,
  key: string,
  requestId: string,
): Promise<Error | null> {
  const slashIdx = key.indexOf("/");
  const competitionSlug = slashIdx === -1 ? null : key.slice(0, slashIdx);

  // 1. Write ChomperJob (status: processing) — outside main transaction.
  //    Check first so re-invocations with the same request ID are idempotent.
  const existing = await findChomperJobByLambdaRequestId(requestId);
  if (existing?.completedAt !== null && existing?.completedAt !== undefined) {
    console.log(`Job already completed for request ${requestId} (${existing.status}), skipping`);
    return null;
  }
  const job =
    existing ??
    (await createChomperJob({
      s3Key: key,
      status: "processing",
      lambdaRequestId: requestId,
    }));

  try {
    // 2. Fetch TDF file from S3
    let buffer: Buffer;
    try {
      buffer = await fetchTdf(bucket, key);
    } catch (err) {
      // S3 events are at-least-once, so a second event can arrive for a file
      // the first one already moved out of the incoming bucket.
      if (isMissingObjectError(err)) {
        await updateChomperJob(job.id, {
          status: "skipped",
          skipReason: "File is no longer in the incoming bucket",
          completedAt: new Date(),
        });
        return null;
      }
      throw err;
    }

    // 3. Parse TDF (Phase 1)
    let parsed;
    try {
      parsed = parseTdf(buffer);
    } catch (err) {
      if (err instanceof RejectionError) {
        await updateChomperJob(job.id, {
          status: "rejected",
          errorMessage: err.message,
          completedAt: new Date(),
        });
        await archiveTdf(bucket, key, ERROR_BUCKET!, key, true);
        return null;
      }
      if (err instanceof ParseError) {
        await updateChomperJob(job.id, {
          status: "failed",
          errorMessage: `Parse error: ${err.message}`,
          completedAt: new Date(),
        });
        await archiveTdf(bucket, key, ERROR_BUCKET!, key, true);
        return null;
      }
      throw err;
    }

    // 4. Validate — skip if neither SM5 nor Laserball
    if (parsed.meta.missionType !== 5 && parsed.meta.missionType !== LASERBALL_MISSION_TYPE) {
      await updateChomperJob(job.id, {
        status: "skipped",
        skipReason: `Mission type ${parsed.meta.missionType} is not SM5 or Laserball`,
        completedAt: new Date(),
      });
      await deleteTdf(bucket, key);
      return null;
    }
    const gameType = parsed.meta.missionType === LASERBALL_MISSION_TYPE ? "lb" : "sm5";

    // 4b. Skip playerless games (started and immediately cancelled before anyone joined)
    const hasPlayers = parsed.entities.some((e) => e.type === "player");
    if (!hasPlayers) {
      await updateChomperJob(job.id, {
        status: "skipped",
        skipReason: "No player entities — game cancelled before anyone joined",
        completedAt: new Date(),
      });
      await deleteTdf(bucket, key);
      return null;
    }

    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );

    // 5. Check for duplicate game
    const gameStartTime = parseGameStartTime(parsed.meta.startTime);

    const existingCenter = await findCenterByNaturalKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
    );
    if (existingCenter) {
      const existingGame = await findGameByNaturalKey(existingCenter.id, gameStartTime);
      if (existingGame) {
        await updateChomperJob(job.id, {
          status: "skipped",
          skipReason: `Duplicate game: gameId=${existingGame.id}`,
          gameId: existingGame.id,
          completedAt: new Date(),
        });
        // A crash between the ingest commit and step 11 leaves a committed game
        // whose only copy of the TDF is this one. Never delete it unarchived.
        if (await objectExists(ARCHIVE_BUCKET!, archiveKey)) {
          await deleteTdf(bucket, key);
        } else {
          console.warn(`Archiving ${key} as ${archiveKey}: game exists but its TDF was not stored`);
          await archiveTdf(bucket, key, ARCHIVE_BUCKET!, archiveKey, true);
        }
        return null;
      }
    }

    // 6b. Resolve competition slug prefix (if any) to a competitionId (shared)
    let competitionId: string | null = null;
    if (competitionSlug) {
      const competition = await getCompetitionBySlug(competitionSlug);
      if (competition && competition.gameType !== gameType) {
        // A Laserball file in an SM5 event's folder (or vice versa) is ingested as social.
        console.warn(
          `Competition "${competitionSlug}" is for ${competition.gameType} games; ` +
            `leaving this ${gameType} game unfiled (key: ${key})`,
        );
      } else if (competition) {
        competitionId = competition.id;
      } else {
        console.warn(`No competition found for slug "${competitionSlug}" (key: ${key})`);
      }
    }

    let gameId: string;
    if (gameType === "lb") {
      // --- Laserball pipeline (Phase 2 + 3) ---
      const lb = simulateLaserball(parsed);
      if (lb.playerStats.size === 0) {
        await updateChomperJob(job.id, {
          status: "skipped",
          skipReason: "No qualifying Laserball players (all under playtime threshold)",
          completedAt: new Date(),
        });
        await deleteTdf(bucket, key);
        return null;
      }
      // No line-7 ground truth; instead assert the goals↔line-5-score invariant.
      if (!lb.goalCheck.ok) {
        throw new Error(
          `Laserball goal/score mismatch: goals=${JSON.stringify(lb.goalCheck.teamGoals)} ` +
            `scoreEvents=${JSON.stringify(lb.goalCheck.scoreEventGoals)}`,
        );
      }
      gameId = await ingestLaserball(parsed, lb, gameStartTime, competitionId);
    } else {
      // --- SM5 pipeline (Phase 2 + 3) ---
      const simResult = simulate(parsed);

      // 6a. Consistency check — throws if any discrepancy found
      const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
      const { discrepancies } = runConsistencyCheck(
        simResult.playerStats,
        sm5StatsById,
        simResult.resourceLog,
      );
      if (discrepancies.length > 0) {
        throw new Error(`Consistency check failed:\n${discrepancies.join("\n")}`);
      }

      // 7. Find active MVP model
      const mvpModel = await findActiveMvpModel();
      if (!mvpModel) {
        throw new Error("No active MVP model found");
      }

      // 8. Calculate MVP scores
      const entityEndsById = new Map(
        parsed.entityEnds.map((e) => [e.id, { score: e.score, exitType: e.exitType }]),
      );
      const mvpRows = calculateMvp(
        simResult,
        sm5StatsById,
        entityEndsById,
        mvpModel,
        parsed.meta.duration,
      );

      // 9–15. Write all rows to database in a single transaction (Phase 3)
      gameId = await ingestWithRetry(
        parsed,
        simResult,
        gameStartTime,
        mvpRows,
        gameType,
        competitionId,
      );
    }

    // 10. Update ChomperJob (status: completed) — outside transaction
    await updateChomperJob(job.id, {
      status: "completed",
      gameId,
      completedAt: new Date(),
    });

    // 11. Move TDF file to archive bucket
    await archiveTdf(bucket, key, ARCHIVE_BUCKET!, archiveKey, true);

    // 12. Notify downstream consumers that a new game is available.
    //     Best-effort — never fails the job (the game is already committed).
    await notifyNewGame(
      buildGameSlug(parsed.meta.countryCode, parsed.meta.siteCode, parsed.meta.startTime),
    );
    return null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await updateChomperJob(job.id, {
      status: "failed",
      errorMessage: error.message,
      completedAt: new Date(),
    });
    await archiveTdf(bucket, key, ERROR_BUCKET!, key, true);
    return error;
  }
}
