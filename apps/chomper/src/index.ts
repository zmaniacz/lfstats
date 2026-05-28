import type { S3Handler } from "aws-lambda";
import { findCenterByNaturalKey, findGameByNaturalKey, findActiveMvpModel, createChomperJob, updateChomperJob } from "@lfstats/db";
import { parseTdf, ParseError } from "./parser.js";
import { simulate, runConsistencyCheck } from "./simulator.js";
import { ingest, parseGameStartTime, buildArchiveKey } from "./ingester.js";

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
import { calculateMvp } from "./mvp.js";
import { fetchTdf, archiveTdf } from "./s3.js";

const INCOMING_BUCKET = process.env.INCOMING_BUCKET;
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET;

if (!INCOMING_BUCKET) throw new Error("Missing env var: INCOMING_BUCKET");
if (!ARCHIVE_BUCKET) throw new Error("Missing env var: ARCHIVE_BUCKET");

export const handler: S3Handler = async (event, context) => {
  const record = event.Records[0];
  if (!record) return;

  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const lambdaRequestId = context.awsRequestId;

  // 1. Write ChomperJob (status: processing) — outside main transaction
  const job = await createChomperJob({
    s3Key: key,
    status: "processing",
    lambdaRequestId,
  });

  try {
    // 2. Fetch TDF file from S3
    const buffer = await fetchTdf(bucket, key);

    // 3. Parse TDF (Phase 1)
    let parsed;
    try {
      parsed = parseTdf(buffer);
    } catch (err) {
      if (err instanceof ParseError) {
        await updateChomperJob(job.id, {
          status: "failed",
          errorMessage: `Parse error: ${err.message}`,
          completedAt: new Date(),
        });
        return;
      }
      throw err;
    }

    // 4. Validate — skip if not SM5
    if (parsed.meta.missionType !== 5) {
      await updateChomperJob(job.id, {
        status: "skipped",
        skipReason: `Mission type ${parsed.meta.missionType} is not SM5`,
        completedAt: new Date(),
      });
      return;
    }
    const gameType = "sm5";

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
        return;
      }
    }

    // 6. Simulate state machine (Phase 2)
    const simResult = simulate(parsed);

    // 6a. Consistency check (dev aid — logs warnings, does not throw)
    const sm5StatsById = new Map(parsed.sm5Stats.map((s) => [s.id, s]));
    runConsistencyCheck(simResult.playerStats, sm5StatsById);

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
    const gameId = await ingestWithRetry(parsed, simResult, gameStartTime, mvpRows, gameType);

    // 10. Update ChomperJob (status: completed) — outside transaction
    await updateChomperJob(job.id, {
      status: "completed",
      gameId,
      completedAt: new Date(),
    });

    // 11. Move TDF file to archive bucket
    const archiveKey = buildArchiveKey(
      parsed.meta.countryCode,
      parsed.meta.siteCode,
      parsed.meta.startTime,
    );
    await archiveTdf(bucket, key, ARCHIVE_BUCKET, archiveKey);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    await updateChomperJob(job.id, {
      status: "failed",
      errorMessage: error.message,
      completedAt: new Date(),
    });
    throw err;
  }
};
