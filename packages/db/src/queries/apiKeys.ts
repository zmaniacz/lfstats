// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../client";
import { apiKey, authUser } from "../schema";

// All API-key crypto lives in this file so hashing exists in exactly one place.
// Callers pass plaintext in and never see a hash.

const KEY_PREFIX = "lfs_";
const PREFIX_DISPLAY_LENGTH = 8;

export type ApiKeyRow = typeof apiKey.$inferSelect;

export type ApiKeyListing = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  createdByEmail: string | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
};

function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generates a new key, stores only its hash and display prefix, and returns the
 * plaintext exactly once. There is no way to recover the plaintext afterwards.
 */
export async function createApiKey(
  name: string,
  createdByUserId: string,
): Promise<{ id: string; plaintext: string }> {
  const plaintext = KEY_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiKey)
    .values({
      name,
      keyHash: hashKey(plaintext),
      keyPrefix: plaintext.slice(0, PREFIX_DISPLAY_LENGTH),
      createdByUserId,
    })
    .returning({ id: apiKey.id });

  return { id: row!.id, plaintext };
}

/**
 * Resolves a plaintext key to its row, rejecting revoked keys. Touches
 * lastUsedAt so an unused key can be identified before revoking it.
 */
export async function authenticateApiKey(
  plaintext: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: apiKey.id, name: apiKey.name })
    .from(apiKey)
    .where(and(eq(apiKey.keyHash, hashKey(plaintext)), isNull(apiKey.revokedAt)));

  if (!row) return null;

  await db.update(apiKey).set({ lastUsedAt: new Date() }).where(eq(apiKey.id, row.id));
  return row;
}

export async function listApiKeys(): Promise<ApiKeyListing[]> {
  return db
    .select({
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      createdByEmail: authUser.email,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
    })
    .from(apiKey)
    .leftJoin(authUser, eq(authUser.id, apiKey.createdByUserId))
    .orderBy(desc(apiKey.createdAt));
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.update(apiKey).set({ revokedAt: new Date() }).where(eq(apiKey.id, id));
}
