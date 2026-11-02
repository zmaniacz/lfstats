// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../client";
import {
  detectHighlights,
  type GameTimeline,
  type HighlightCandidate,
  type HighlightCategory,
} from "../lib/highlights/detectors";
import {
  game,
  sm5GameEvent,
  sm5GameHighlight,
  sm5GamePlayerState,
  sm5GameTeam,
  sm5Scorecard,
} from "../schema";

/** Null when the game has no replay data, such as a forfeit or a PDF-era game. */
async function loadGameTimeline(gameId: string): Promise<GameTimeline | null> {
  const [gameRow] = await db
    .select({ duration: game.actualDuration, outcome: game.outcome })
    .from(game)
    .where(eq(game.id, gameId));
  if (!gameRow) return null;

  const [events, states, players, teams] = await Promise.all([
    db
      .select({
        id: sm5GameEvent.id,
        time: sm5GameEvent.time,
        type: sm5GameEvent.eventType,
        actor: sm5GameEvent.actorScorecardId,
        target: sm5GameEvent.targetScorecardId,
      })
      .from(sm5GameEvent)
      .where(eq(sm5GameEvent.gameId, gameId))
      .orderBy(asc(sm5GameEvent.time)),
    db
      .select({
        scorecardId: sm5GamePlayerState.scorecardId,
        eventId: sm5GamePlayerState.eventId,
        time: sm5GamePlayerState.time,
        score: sm5GamePlayerState.score,
        lives: sm5GamePlayerState.lives,
        isNuking: sm5GamePlayerState.isNuking,
      })
      .from(sm5GamePlayerState)
      .where(eq(sm5GamePlayerState.gameId, gameId))
      .orderBy(asc(sm5GamePlayerState.time)),
    db
      .select({
        id: sm5Scorecard.id,
        position: sm5Scorecard.position,
        teamId: sm5Scorecard.teamId,
      })
      .from(sm5Scorecard)
      .innerJoin(sm5GameTeam, eq(sm5Scorecard.teamId, sm5GameTeam.id))
      .where(and(eq(sm5Scorecard.gameId, gameId), eq(sm5GameTeam.isNeutral, false))),
    db
      .select({
        id: sm5GameTeam.id,
        tdfTeamIndex: sm5GameTeam.tdfTeamIndex,
        result: sm5GameTeam.result,
      })
      .from(sm5GameTeam)
      .where(and(eq(sm5GameTeam.gameId, gameId), eq(sm5GameTeam.isNeutral, false))),
  ]);

  if (events.length === 0) return null;
  return { ...gameRow, events, states, players, teams };
}

/** Runs the detectors over a game's stored rows without writing anything. */
export async function findGameHighlights(gameId: string): Promise<HighlightCandidate[]> {
  const timeline = await loadGameTimeline(gameId);
  return timeline ? detectHighlights(timeline) : [];
}

/**
 * Replaces a game's highlights in one transaction, so every trigger is idempotent. With
 * `categories`, only those categories are replaced.
 */
export async function generateHighlights(
  gameId: string,
  categories?: HighlightCategory[],
): Promise<HighlightCandidate[]> {
  const found = await findGameHighlights(gameId);
  const rows = categories ? found.filter((h) => categories.includes(h.category)) : found;

  await db.transaction(async (tx) => {
    await tx
      .delete(sm5GameHighlight)
      .where(
        and(
          eq(sm5GameHighlight.gameId, gameId),
          categories ? inArray(sm5GameHighlight.category, categories) : undefined,
        ),
      );
    if (rows.length > 0) {
      await tx.insert(sm5GameHighlight).values(rows.map((h) => ({ ...h, gameId })));
    }
  });
  return rows;
}

/**
 * For callers whose own work has already committed: a highlight failure is logged rather than
 * thrown, since the game is sound and the backfill can repair it.
 */
export async function refreshGameHighlights(gameId: string): Promise<void> {
  try {
    await generateHighlights(gameId);
  } catch (err) {
    console.error(`Highlight generation failed for game ${gameId}:`, err);
  }
}

export type HighlightBackfillRange = {
  /** Center-local dates, `YYYY-MM-DD`, both inclusive. Omit for the whole archive. */
  from?: string;
  to?: string;
};

export async function getGameIdsForHighlights({ from, to }: HighlightBackfillRange) {
  return db
    .select({ id: game.id, tdfFilename: game.tdfFilename })
    .from(game)
    .where(
      and(
        eq(game.type, "sm5"),
        from ? sql`${game.startTime} >= ${from}::date` : undefined,
        to ? sql`${game.startTime} < ${to}::date + 1` : undefined,
      ),
    )
    .orderBy(asc(game.startTime));
}

export type GameHighlight = {
  id: string;
  category: HighlightCategory;
  time: number;
  magnitude: number;
  details: HighlightCandidate["details"];
  primaryCallsign: string | null;
  secondaryCallsign: string | null;
  teamId: string | null;
  teamName: string | null;
};

/** Every visible highlight for a game. Excluded, aborted and replayed games have none. */
export async function getGameHighlights(gameId: string): Promise<GameHighlight[]> {
  const primary = alias(sm5Scorecard, "primary_scorecard");
  const secondary = alias(sm5Scorecard, "secondary_scorecard");

  return db
    .select({
      id: sm5GameHighlight.id,
      category: sm5GameHighlight.category,
      time: sm5GameHighlight.time,
      magnitude: sm5GameHighlight.magnitude,
      details: sm5GameHighlight.details,
      primaryCallsign: primary.callsign,
      secondaryCallsign: secondary.callsign,
      teamId: sm5GameTeam.id,
      teamName: sm5GameTeam.name,
    })
    .from(sm5GameHighlight)
    .innerJoin(game, eq(sm5GameHighlight.gameId, game.id))
    .leftJoin(primary, eq(sm5GameHighlight.primaryScorecardId, primary.id))
    .leftJoin(secondary, eq(sm5GameHighlight.secondaryScorecardId, secondary.id))
    .leftJoin(
      sm5GameTeam,
      and(
        eq(sm5GameTeam.gameId, sm5GameHighlight.gameId),
        eq(sm5GameTeam.tdfTeamIndex, sm5GameHighlight.tdfTeamIndex),
      ),
    )
    .where(
      and(
        eq(sm5GameHighlight.gameId, gameId),
        eq(game.exclude, false),
        notInArray(game.outcome, ["aborted", "replay"]),
      ),
    );
}
