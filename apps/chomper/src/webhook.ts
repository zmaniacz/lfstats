// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Outbound notification fired once a game is fully ingested.
 *
 * The game slug is `{countryCode}-{siteCode}-{YYYYMMDDHHmmss}` — the same
 * identifier used in game page URLs and the public API (see
 * `packages/db/src/lib/game-slug.ts`), and the archive key minus its `.tdf`
 * suffix.
 */

const DEFAULT_WEBHOOK_URL = "https://www.ebomike.com/lfserver/new_game";
// Deliberately short. This is a fire-and-forget notification to a third-party
// host, fired last in a Lambda with a 120s budget — a receiver that hasn't
// answered in 5s isn't going to answer usefully, and we've already decided to
// swallow the failure.
const TIMEOUT_MS = 5_000;

export function buildGameSlug(countryCode: number, siteCode: number, startTime: string): string {
  return `${countryCode}-${siteCode}-${startTime}`;
}

/**
 * POST `{"game_slug": "..."}` to the new-game webhook.
 *
 * Never throws: the game is already committed and archived by the time this
 * runs, so a webhook failure must not fail the job or send the TDF to the
 * error bucket. Failures are logged and swallowed.
 *
 * Set `NEW_GAME_WEBHOOK_URL` to point elsewhere, or to an empty string to
 * disable the notification entirely.
 */
export async function notifyNewGame(gameSlug: string): Promise<void> {
  const url = process.env.NEW_GAME_WEBHOOK_URL ?? DEFAULT_WEBHOOK_URL;
  if (!url) return;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_slug: gameSlug }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`New-game webhook returned ${response.status} for ${gameSlug}`);
    }
  } catch (err) {
    console.warn(`New-game webhook failed for ${gameSlug}: ${(err as Error).message}`);
  }
}
