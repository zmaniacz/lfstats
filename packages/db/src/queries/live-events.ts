// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Live events tell open browser tabs that data changed. The worker publishes them with
 * Postgres NOTIFY and the web app relays them over Server-Sent Events (`/api/live`). The
 * browser shows a toast for `match_game` and refreshes the page it is on for both kinds.
 *
 * Delivery is best-effort and at most once. A tab that is closed or reconnecting simply
 * misses the event, and it sees the new data the next time it loads anyway.
 */

import { sql } from "drizzle-orm";
import { db, getPgClient } from "../client";
import type { NotificationMessage } from "../lib/notifications";

export const LIVE_EVENTS_CHANNEL = "lfstats_live";

/** One side of a match. Trios and duos list every team on the side. */
export type LiveMatchSide = { names: string[]; points: number };

/** One game, or one Laserball half, of a match. Colours are `colour_enum` values. */
export type LiveMatchGame = {
  label: string;
  team1Score: number | null;
  team2Score: number | null;
  team1Colour: number;
  team2Colour: number;
  winner: "team1" | "team2" | null;
};

/** The match so far, for the toast's scoreboard. Push notifications use the text instead. */
export type LiveMatchScoreboard = {
  gameType: "sm5" | "lb";
  competitionName: string;
  roundName: string;
  matchNumber: number;
  team1: LiveMatchSide;
  team2: LiveMatchSide;
  games: LiveMatchGame[];
  /** The game this event is about, highlighted in the toast. */
  latestIndex: number;
  winner: "team1" | "team2" | "draw" | "incomplete";
};

export type LiveEvent =
  /** A game was ingested. Pages refresh but no toast is shown. */
  | { type: "game"; gameId: string; competitionId: string | null }
  /**
   * A game was added to a match. The toast shows the scoreboard, falling back to the push
   * notification's text.
   */
  | ({
      type: "match_game";
      competitionId: string;
      scoreboard?: LiveMatchScoreboard;
    } & NotificationMessage);

/** Publishes an event. Never throws: a missed refresh must not fail the work that caused it. */
export async function publishLiveEvent(event: LiveEvent): Promise<void> {
  try {
    await db.execute(sql`select pg_notify(${LIVE_EVENTS_CHANNEL}, ${JSON.stringify(event)})`);
  } catch (err) {
    console.warn(`Live event ${event.type} failed: ${(err as Error).message}`);
  }
}

/**
 * Calls `onEvent` for every published event. postgres.js holds the LISTEN on a dedicated
 * connection and re-subscribes after it reconnects. Malformed payloads are dropped.
 */
export async function listenLiveEvents(onEvent: (event: LiveEvent) => void): Promise<void> {
  await getPgClient().listen(LIVE_EVENTS_CHANNEL, (payload) => {
    try {
      onEvent(JSON.parse(payload) as LiveEvent);
    } catch {
      console.warn("Dropped a malformed live event");
    }
  });
}
