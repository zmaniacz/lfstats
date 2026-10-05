// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Per-key request limits for the query API. In memory: LFstats runs as a single web
// process, so there is nothing to share counters with, and a restart forgiving a key's
// count is harmless. If the app ever runs as several replicas this needs a shared store.

export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
export const DEFAULT_RATE_LIMIT_PER_DAY = 2_000;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type RateLimits = { perMinute: number; perDay: number };

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Windows = { minuteStart: number; minuteCount: number; dayStart: number; dayCount: number };

/** Fixed-window counters per key: one per minute and one per (UTC) day. */
export class RateLimiter {
  private readonly windows = new Map<string, Windows>();

  check(keyId: string, limits: RateLimits, now: number = Date.now()): RateLimitResult {
    const minuteStart = now - (now % MINUTE_MS);
    const dayStart = now - (now % DAY_MS);

    let w = this.windows.get(keyId);
    if (!w) {
      w = { minuteStart, minuteCount: 0, dayStart, dayCount: 0 };
      this.windows.set(keyId, w);
    }
    if (w.minuteStart !== minuteStart) {
      w.minuteStart = minuteStart;
      w.minuteCount = 0;
    }
    if (w.dayStart !== dayStart) {
      w.dayStart = dayStart;
      w.dayCount = 0;
    }

    // A rejected request does not count against the limit, so a client that backs off
    // for retry_after_seconds is not still locked out when it returns.
    if (w.dayCount >= limits.perDay) {
      return { ok: false, retryAfterSeconds: Math.ceil((dayStart + DAY_MS - now) / 1000) };
    }
    if (w.minuteCount >= limits.perMinute) {
      return { ok: false, retryAfterSeconds: Math.ceil((minuteStart + MINUTE_MS - now) / 1000) };
    }
    w.minuteCount++;
    w.dayCount++;
    return { ok: true };
  }
}

export function rateLimitsFor(key: {
  rateLimitPerMinute: number | null;
  rateLimitPerDay: number | null;
}): RateLimits {
  return {
    perMinute: key.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    perDay: key.rateLimitPerDay ?? DEFAULT_RATE_LIMIT_PER_DAY,
  };
}
