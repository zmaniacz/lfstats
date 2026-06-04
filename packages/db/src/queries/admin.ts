import { db } from "../client";
import {
  competition,
  game,
  gameTag,
  gameTagAssignment,
  center,
} from "../schema";
import {
  eq,
  and,
  gte,
  lte,
  desc,
  asc,
  sql,
  inArray,
} from "drizzle-orm";


// ---------------------------------------------------------------------------
// Competition types
// ---------------------------------------------------------------------------

export type CompetitionListItem = {
  id: string;
  name: string;
  type: "competitive" | "social";
  startDate: string;
  endDate: string | null;
  hostCenterId: string | null;
  hostCenterName: string | null;
  gameCount: number;
};

export type CompetitionDetail = {
  id: string;
  name: string;
  type: "competitive" | "social";
  startDate: string;
  endDate: string | null;
  description: string | null;
  hostCenterId: string | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Competition CRUD
// ---------------------------------------------------------------------------

export async function getCompetitions(): Promise<CompetitionListItem[]> {
  const rows = await db
    .select({
      id: competition.id,
      name: competition.name,
      type: competition.type,
      startDate: competition.startDate,
      endDate: competition.endDate,
      hostCenterId: competition.hostCenterId,
      hostCenterName: center.name,
      gameCount: sql<number>`count(${game.id})::int`,
    })
    .from(competition)
    .leftJoin(center, eq(competition.hostCenterId, center.id))
    .leftJoin(game, eq(game.competitionId, competition.id))
    .groupBy(competition.id, center.name)
    .orderBy(desc(competition.startDate));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    startDate: r.startDate,
    endDate: r.endDate,
    hostCenterId: r.hostCenterId,
    hostCenterName: r.hostCenterName,
    gameCount: r.gameCount,
  }));
}

export async function getCompetitionById(id: string): Promise<CompetitionDetail | null> {
  const [row] = await db
    .select({
      id: competition.id,
      name: competition.name,
      type: competition.type,
      startDate: competition.startDate,
      endDate: competition.endDate,
      description: competition.description,
      hostCenterId: competition.hostCenterId,
      createdAt: competition.createdAt,
    })
    .from(competition)
    .where(eq(competition.id, id));

  return row ?? null;
}

export async function createCompetition(
  data: typeof competition.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(competition).values(data).returning({ id: competition.id });
  return row.id;
}

export async function updateCompetition(
  id: string,
  data: Partial<typeof competition.$inferInsert>,
): Promise<void> {
  await db.update(competition).set(data).where(eq(competition.id, id));
}

export async function deleteCompetition(id: string): Promise<void> {
  await db.delete(competition).where(eq(competition.id, id));
}

export async function bulkAssignGamesToCompetition(
  competitionId: string,
  centerId: string,
  dateFrom: string,
  dateTo: string,
): Promise<number> {
  const result = await db
    .update(game)
    .set({ competitionId })
    .where(
      and(
        eq(game.centerId, centerId),
        gte(game.startTime, new Date(dateFrom)),
        lte(game.startTime, new Date(`${dateTo}T23:59:59`)),
      ),
    )
    .returning({ id: game.id });

  return result.length;
}

// ---------------------------------------------------------------------------
// GameTag types
// ---------------------------------------------------------------------------

export type GameTagListItem = {
  id: string;
  centerId: string;
  name: string;
  color: string | null;
  description: string | null;
  archived: boolean;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// GameTag CRUD
// ---------------------------------------------------------------------------

export async function getTagsByCenter(
  centerId: string,
  includeArchived = false,
): Promise<GameTagListItem[]> {
  const conditions = [eq(gameTag.centerId, centerId)];
  if (!includeArchived) conditions.push(eq(gameTag.archived, false));

  const rows = await db
    .select()
    .from(gameTag)
    .where(and(...conditions))
    .orderBy(asc(gameTag.name));

  return rows;
}

export async function createTag(data: typeof gameTag.$inferInsert): Promise<string> {
  const [row] = await db.insert(gameTag).values(data).returning({ id: gameTag.id });
  return row.id;
}

export async function updateTag(
  id: string,
  data: Partial<typeof gameTag.$inferInsert>,
): Promise<void> {
  await db.update(gameTag).set(data).where(eq(gameTag.id, id));
}

export async function archiveTag(id: string): Promise<void> {
  await db.update(gameTag).set({ archived: true }).where(eq(gameTag.id, id));
}

export async function unarchiveTag(id: string): Promise<void> {
  await db.update(gameTag).set({ archived: false }).where(eq(gameTag.id, id));
}

export async function deleteTag(id: string): Promise<void> {
  await db.delete(gameTag).where(eq(gameTag.id, id));
}

export async function mergeTag(sourceId: string, targetId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Get all game IDs assigned to source tag
    const sourceAssignments = await tx
      .select({ gameId: gameTagAssignment.gameId })
      .from(gameTagAssignment)
      .where(eq(gameTagAssignment.tagId, sourceId));

    if (sourceAssignments.length > 0) {
      const gameIds = sourceAssignments.map((a) => a.gameId);

      // Find which game IDs already have the target tag (to skip conflicts)
      const existingTargetAssignments = await tx
        .select({ gameId: gameTagAssignment.gameId })
        .from(gameTagAssignment)
        .where(
          and(
            eq(gameTagAssignment.tagId, targetId),
            inArray(gameTagAssignment.gameId, gameIds),
          ),
        );

      const alreadyAssigned = new Set(existingTargetAssignments.map((a) => a.gameId));
      const gameIdsToMove = gameIds.filter((id) => !alreadyAssigned.has(id));

      if (gameIdsToMove.length > 0) {
        await tx
          .update(gameTagAssignment)
          .set({ tagId: targetId })
          .where(
            and(
              eq(gameTagAssignment.tagId, sourceId),
              inArray(gameTagAssignment.gameId, gameIdsToMove),
            ),
          );
      }
    }

    // Delete the source tag (cascade deletes any remaining assignments)
    await tx.delete(gameTag).where(eq(gameTag.id, sourceId));
  });
}

// ---------------------------------------------------------------------------
// GameTagAssignment
// ---------------------------------------------------------------------------

export async function assignTagToGame(
  gameId: string,
  tagId: string,
  assignedBy?: string,
): Promise<void> {
  await db
    .insert(gameTagAssignment)
    .values({ gameId, tagId, assignedBy })
    .onConflictDoNothing();
}

export async function removeTagFromGame(gameId: string, tagId: string): Promise<void> {
  await db
    .delete(gameTagAssignment)
    .where(and(eq(gameTagAssignment.gameId, gameId), eq(gameTagAssignment.tagId, tagId)));
}

export async function getTagsForGame(gameId: string): Promise<GameTagListItem[]> {
  const rows = await db
    .select({
      id: gameTag.id,
      centerId: gameTag.centerId,
      name: gameTag.name,
      color: gameTag.color,
      description: gameTag.description,
      archived: gameTag.archived,
      createdAt: gameTag.createdAt,
    })
    .from(gameTag)
    .innerJoin(gameTagAssignment, eq(gameTagAssignment.tagId, gameTag.id))
    .where(eq(gameTagAssignment.gameId, gameId))
    .orderBy(asc(gameTag.name));

  return rows;
}

// ---------------------------------------------------------------------------
// Game exclude toggle
// ---------------------------------------------------------------------------

export async function setGameExcluded(id: string, exclude: boolean): Promise<void> {
  await db.update(game).set({ exclude }).where(eq(game.id, id));
}

export async function removeGameFromCompetition(gameId: string): Promise<void> {
  await db.update(game).set({ competitionId: null }).where(eq(game.id, gameId));
}

export async function setGameCompetition(
  gameId: string,
  competitionId: string,
): Promise<void> {
  await db.update(game).set({ competitionId }).where(eq(game.id, gameId));
}
