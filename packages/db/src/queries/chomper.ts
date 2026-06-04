import { eq, isNull, and, sql, inArray, gte, desc } from "drizzle-orm";
import { db } from "../client";
import {
  center,
  player,
  playerCallsignHistory,
  battlesuit,
  target,
  game,
  sm5GameTeam,
  sm5GameTarget,
  sm5GameTargetDestruction,
  gameReferee,
  sm5GamePenalty,
  sm5Scorecard,
  sm5GamePlayerInteraction,
  sm5GameEvent,
  sm5GamePlayerState,
  sm5ScorecardMvp,
  chomperJob,
  sm5MvpModel,
} from "../schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// ChomperJob
// ---------------------------------------------------------------------------

export async function createChomperJob(data: typeof chomperJob.$inferInsert) {
  const [row] = await db.insert(chomperJob).values(data).returning();
  return row;
}

export async function updateChomperJob(
  id: string,
  data: Partial<typeof chomperJob.$inferInsert>,
) {
  await db.update(chomperJob).set(data).where(eq(chomperJob.id, id));
}

export async function findChomperJobByLambdaRequestId(lambdaRequestId: string) {
  const [row] = await db
    .select()
    .from(chomperJob)
    .where(eq(chomperJob.lambdaRequestId, lambdaRequestId))
    .limit(1);
  return row ?? null;
}

export async function getFailedChomperJobs() {
  return db
    .select()
    .from(chomperJob)
    .where(
      and(
        inArray(chomperJob.status, ["failed", "rejected"]),
        eq(chomperJob.archived, false),
      ),
    )
    .orderBy(desc(chomperJob.startedAt));
}

export async function archiveChomperJob(id: string) {
  await db
    .update(chomperJob)
    .set({ archived: true })
    .where(eq(chomperJob.id, id));
}

export async function archiveAllChomperJobs() {
  await db
    .update(chomperJob)
    .set({ archived: true })
    .where(
      and(
        inArray(chomperJob.status, ["failed", "rejected"]),
        eq(chomperJob.archived, false),
      ),
    );
}

export async function getChomperJobsByS3Keys(s3Keys: string[]) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  return db
    .select()
    .from(chomperJob)
    .where(and(inArray(chomperJob.s3Key, s3Keys), gte(chomperJob.startedAt, oneHourAgo)))
    .orderBy(chomperJob.startedAt);
}

// ---------------------------------------------------------------------------
// Identity / Reference
// ---------------------------------------------------------------------------

export async function upsertCenter(tx: Tx, data: typeof center.$inferInsert) {
  await tx.insert(center).values(data).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(center)
    .where(
      and(
        eq(center.countryCode, data.countryCode),
        eq(center.siteCode, data.siteCode),
      ),
    );
  return row;
}

export async function upsertPlayer(tx: Tx, data: typeof player.$inferInsert) {
  const [row] = await tx
    .insert(player)
    .values(data)
    .onConflictDoUpdate({
      target: player.iplId,
      set: {
        currentCallsign: sql`excluded.current_callsign`,
        // Only populate memberId if the existing row has null and incoming has a value
        memberId: sql`CASE WHEN ${player.memberId} IS NULL THEN excluded.member_id ELSE ${player.memberId} END`,
      },
    })
    .returning();
  return row;
}

export async function upsertPlayerCallsignHistory(
  tx: Tx,
  data: typeof playerCallsignHistory.$inferInsert,
) {
  await tx
    .insert(playerCallsignHistory)
    .values(data)
    .onConflictDoUpdate({
      target: [playerCallsignHistory.playerId, playerCallsignHistory.callsign],
      set: { lastSeenAt: sql`excluded.last_seen_at` },
    });
}

export async function upsertBattlesuit(
  tx: Tx,
  data: typeof battlesuit.$inferInsert,
) {
  const [row] = await tx
    .insert(battlesuit)
    .values(data)
    .onConflictDoUpdate({
      target: [battlesuit.centerId, battlesuit.name],
      set: {
        // Only update hardwareId if incoming is non-null and existing is null
        hardwareId: sql`CASE WHEN excluded.hardware_id IS NOT NULL THEN excluded.hardware_id ELSE ${battlesuit.hardwareId} END`,
      },
    })
    .returning();
  return row;
}

export async function upsertTarget(tx: Tx, data: typeof target.$inferInsert) {
  const [row] = await tx
    .insert(target)
    .values(data)
    .onConflictDoUpdate({
      target: [target.centerId, target.hardwareId],
      set: { name: sql`excluded.name` },
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Idempotency / lookups
// ---------------------------------------------------------------------------

export async function findCenterByNaturalKey(
  countryCode: number,
  siteCode: number,
) {
  const rows = await db
    .select()
    .from(center)
    .where(
      and(eq(center.countryCode, countryCode), eq(center.siteCode, siteCode)),
    );
  return rows[0] ?? null;
}

export async function findGameByNaturalKey(centerId: string, startTime: Date) {
  const rows = await db
    .select()
    .from(game)
    .where(and(eq(game.centerId, centerId), eq(game.startTime, startTime)));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Game Structure
// ---------------------------------------------------------------------------

export async function insertGame(tx: Tx, data: typeof game.$inferInsert) {
  const [row] = await tx.insert(game).values(data).returning();
  return row;
}

export async function insertGameTeams(
  tx: Tx,
  rows: (typeof sm5GameTeam.$inferInsert)[],
) {
  return tx.insert(sm5GameTeam).values(rows).returning();
}

export async function insertGameTargets(
  tx: Tx,
  rows: (typeof sm5GameTarget.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  return tx.insert(sm5GameTarget).values(rows).returning();
}

export async function insertGameReferees(
  tx: Tx,
  rows: (typeof gameReferee.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  return tx.insert(gameReferee).values(rows).returning();
}

export async function insertGameTargetDestructions(
  tx: Tx,
  rows: (typeof sm5GameTargetDestruction.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  await tx.insert(sm5GameTargetDestruction).values(rows);
}

export async function insertGamePenalties(
  tx: Tx,
  rows: (typeof sm5GamePenalty.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  await tx.insert(sm5GamePenalty).values(rows);
}

// ---------------------------------------------------------------------------
// Player Performance
// ---------------------------------------------------------------------------

export async function insertScorecards(
  tx: Tx,
  rows: (typeof sm5Scorecard.$inferInsert)[],
) {
  return tx.insert(sm5Scorecard).values(rows).returning();
}

export async function insertGamePlayerInteractions(
  tx: Tx,
  rows: (typeof sm5GamePlayerInteraction.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(sm5GamePlayerInteraction).values(rows);
}

// ---------------------------------------------------------------------------
// Replay Data
// ---------------------------------------------------------------------------

export async function insertGameEvents(
  tx: Tx,
  rows: (typeof sm5GameEvent.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  const CHUNK = 1000;
  const results = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = await tx
      .insert(sm5GameEvent)
      .values(rows.slice(i, i + CHUNK))
      .returning();
    results.push(...batch);
  }
  return results;
}

export async function insertGamePlayerStates(
  tx: Tx,
  rows: (typeof sm5GamePlayerState.$inferInsert)[],
) {
  if (rows.length === 0) return;
  // Batch in chunks to avoid hitting postgres parameter limits on large games
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(sm5GamePlayerState).values(rows.slice(i, i + CHUNK));
  }
}

// ---------------------------------------------------------------------------
// MVP
// ---------------------------------------------------------------------------

export async function findActiveMvpModel() {
  const rows = await db
    .select()
    .from(sm5MvpModel)
    .where(isNull(sm5MvpModel.retiredAt));
  return rows[0] ?? null;
}

export async function insertScorecardMvps(
  tx: Tx,
  rows: (typeof sm5ScorecardMvp.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(sm5ScorecardMvp).values(rows);
}
