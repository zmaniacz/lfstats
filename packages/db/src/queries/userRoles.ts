import { eq } from "drizzle-orm";
import { db } from "../client";
import { userRole } from "../schema";

export type UserRoleRow = typeof userRole.$inferSelect;

export async function getUserRoles(userId: string): Promise<UserRoleRow[]> {
  return db.select().from(userRole).where(eq(userRole.userId, userId));
}
