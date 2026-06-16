// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { db } from "../client";
import {
  lbGameTeam,
  lbScorecard,
  lbGamePlayerInteraction,
  lbGameEvent,
  lbGamePlayerState,
} from "../schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Laserball Game Structure
//
// Identity/reference upserts (center, player, battlesuit, callsign history) and
// the shared `game` insert + natural-key lookups are reused from ./chomper —
// laserball shares those tables. Only the lb_-specific inserts live here.
// ---------------------------------------------------------------------------

export async function insertLbGameTeams(tx: Tx, rows: (typeof lbGameTeam.$inferInsert)[]) {
  return tx.insert(lbGameTeam).values(rows).returning();
}

// ---------------------------------------------------------------------------
// Player Performance
// ---------------------------------------------------------------------------

export async function insertLbScorecards(tx: Tx, rows: (typeof lbScorecard.$inferInsert)[]) {
  return tx.insert(lbScorecard).values(rows).returning();
}

export async function insertLbGamePlayerInteractions(
  tx: Tx,
  rows: (typeof lbGamePlayerInteraction.$inferInsert)[],
) {
  if (rows.length === 0) return;
  await tx.insert(lbGamePlayerInteraction).values(rows);
}

// ---------------------------------------------------------------------------
// Replay Data
// ---------------------------------------------------------------------------

export async function insertLbGameEvents(tx: Tx, rows: (typeof lbGameEvent.$inferInsert)[]) {
  if (rows.length === 0) return [];
  const CHUNK = 1000;
  const results: (typeof lbGameEvent.$inferSelect)[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = await tx
      .insert(lbGameEvent)
      .values(rows.slice(i, i + CHUNK))
      .returning();
    results.push(...batch);
  }
  return results;
}

export async function insertLbGamePlayerStates(
  tx: Tx,
  rows: (typeof lbGamePlayerState.$inferInsert)[],
) {
  if (rows.length === 0) return;
  // Batch in chunks to avoid hitting postgres parameter limits on large games
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await tx.insert(lbGamePlayerState).values(rows.slice(i, i + CHUNK));
  }
}
