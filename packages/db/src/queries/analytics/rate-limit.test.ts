// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, rateLimitsFor } from "./rate-limit";

const T0 = Date.UTC(2026, 9, 4, 12, 0, 0);

describe("RateLimiter", () => {
  it("allows up to the per-minute limit, then says when to retry", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 2, perDay: 100 };
    assert.deepEqual(rl.check("k", limits, T0), { ok: true });
    assert.deepEqual(rl.check("k", limits, T0 + 1_000), { ok: true });
    assert.deepEqual(rl.check("k", limits, T0 + 15_000), { ok: false, retryAfterSeconds: 45 });
  });

  it("resets each minute", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 1, perDay: 100 };
    rl.check("k", limits, T0);
    assert.equal(rl.check("k", limits, T0 + 30_000).ok, false);
    assert.equal(rl.check("k", limits, T0 + 60_000).ok, true);
  });

  it("enforces the daily limit across minutes", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 10, perDay: 2 };
    rl.check("k", limits, T0);
    rl.check("k", limits, T0 + 60_000);
    const third = rl.check("k", limits, T0 + 120_000);
    assert.equal(third.ok, false);
    assert.ok(!third.ok && third.retryAfterSeconds > 3600);
  });

  it("keeps keys independent", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 1, perDay: 100 };
    rl.check("a", limits, T0);
    assert.equal(rl.check("b", limits, T0).ok, true);
  });

  it("does not count rejected requests", () => {
    const rl = new RateLimiter();
    const limits = { perMinute: 1, perDay: 2 };
    rl.check("k", limits, T0);
    for (let i = 0; i < 5; i++) rl.check("k", limits, T0 + 1_000);
    assert.equal(rl.check("k", limits, T0 + 60_000).ok, true);
  });
});

describe("rateLimitsFor", () => {
  it("falls back to server defaults for unset per-key limits", () => {
    assert.deepEqual(rateLimitsFor({ rateLimitPerMinute: null, rateLimitPerDay: 50 }), {
      perMinute: 60,
      perDay: 50,
    });
  });
});
