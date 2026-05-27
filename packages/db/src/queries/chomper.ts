import { eq, isNull, and, sql } from "drizzle-orm";
import { db } from "../client.js";
import {
  center,
  player,
  playerCallsignHistory,
  battlesuit,
  target,
  game,
  gameTeam,
  gameTarget,
  gameTargetDestruction,
  gameReferee,
  gamePenalty,
  scorecard,
  gamePlayerInteraction,
  gameEvent,
  gamePlayerState,
  scorecardMvp,
  chomperJob,
  mvpModel,
} from "../schema.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// ChomperJob
// ---------------------------------------------------------------------------

export async function createChomperJob(
  data: typeof chomperJob.$inferInsert,
) {
  const [row] = await db.insert(chomperJob).values(data).returning();
  return row;
}

export async function updateChomperJob(
  id: string,
  data: Partial<typeof chomperJob.$inferInsert>,
) {
  await db.update(chomperJob).set(data).where(eq(chomperJob.id, id));
}

// ---------------------------------------------------------------------------
// Identity / Reference
// ---------------------------------------------------------------------------

export async function upsertCenter(
  tx: Tx,
  data: typeof center.$inferInsert,
) {
  const [row] = await tx
    .insert(center)
    .values(data)
    .onConflictDoUpdate({
      target: [center.countryCode, center.siteCode],
      set: { name: sql`excluded.name` },
    })
    .returning();
  return row;
}

export async function upsertPlayer(
  tx: Tx,
  data: typeof player.$inferInsert,
) {
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

export async function upsertTarget(
  tx: Tx,
  data: typeof target.$inferInsert,
) {
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
    .where(and(eq(center.countryCode, countryCode), eq(center.siteCode, siteCode)));
  return rows[0] ?? null;
}

export async function findGameByNaturalKey(
  centerId: string,
  startTime: Date,
) {
  const rows = await db
    .select()
    .from(game)
    .where(and(eq(game.centerId, centerId), eq(game.startTime, startTime)));
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Game Structure
// ---------------------------------------------------------------------------

export async function insertGame(
  tx: Tx,
  data: typeof game.$inferInsert,
) {
  const [row] = await tx.insert(game).values(data).returning();
  return row;
}

export async function insertGameTeams(
  tx: Tx,
  rows: (typeof gameTeam.$inferInsert)[],
) {
  return tx.insert(gameTeam).values(rows).returning();
}

export async function insertGameTargets(
  tx: Tx,
  rows: (typeof gameTarget.$inferInsert)[],
) {
  return tx.insert(gameTarget).values(rows).returning();
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
  rows: (typeof gameTargetDestruction.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  await tx.insert(gameTargetDestruction).values(rows);
}

export async function insertGamePenalties(
  tx: Tx,
  rows: (typeof gamePenalty.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  await tx.insert(gamePenalty).values(rows);
}

// ---------------------------------------------------------------------------
// Player Performance
// ---------------------------------------------------------------------------

export async function insertScorecards(
  tx: Tx,
  rows: (typeof scorecard.$inferInsert)[],
) {
  return tx.insert(scorecard).values(rows).returning();
}

export async function insertGamePlayerInteractions(
  tx: Tx,
  rows: (typeof gamePlayerInteraction.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(gamePlayerInteraction).values(rows);
}

// ---------------------------------------------------------------------------
// Replay Data
// ---------------------------------------------------------------------------

export async function insertGameEvents(
  tx: Tx,
  rows: (typeof gameEvent.$inferInsert)[],
) {
  if (rows.length === 0) return [];
  return tx.insert(gameEvent).values(rows).returning();
}

export async function insertGamePlayerStates(
  tx: Tx,
  rows: (typeof gamePlayerState.$inferInsert)[],
) {
  if (rows.length === 0) return;
  // Batch in chunks to avoid hitting postgres parameter limits on large games
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(gamePlayerState).values(rows.slice(i, i + CHUNK));
  }
}

// ---------------------------------------------------------------------------
// MVP
// ---------------------------------------------------------------------------

export async function findActiveMvpModel() {
  const rows = await db
    .select()
    .from(mvpModel)
    .where(isNull(mvpModel.retiredAt));
  return rows[0] ?? null;
}

export async function insertScorecardMvps(
  tx: Tx,
  rows: (typeof scorecardMvp.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(scorecardMvp).values(rows);
}
