// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ScopeSchema } from "../../schemas/query-api";
import { didYouMean, fromZodError, mapDatabaseError, QueryApiError } from "./errors";
import { Semaphore } from "./pool";

describe("didYouMean", () => {
  it("ranks close candidates first and drops distant ones", () => {
    assert.deepEqual(didYouMean("internationls_2026", ["internationals_2026", "nationals_2025"]), [
      "internationals_2026",
    ]);
    assert.deepEqual(didYouMean("zzz", ["avg_mvp", "games"]), []);
  });
});

describe("fromZodError", () => {
  it("names the unknown field with its full path", () => {
    const parsed = ScopeSchema.safeParse({ date_range: { start: "2026-01-01" } });
    const err = fromZodError(parsed.error!);
    assert.equal(err.code, "unknown_field");
    assert.equal(err.field, "date_range.start");
    assert.equal(err.status, 400);
  });

  it("lists valid values for a bad enum", () => {
    const err = fromZodError(ScopeSchema.safeParse({ game_kind: "league" }).error!);
    assert.equal(err.field, "game_kind");
    assert.deepEqual(err.validValues, ["all", "social", "competitive"]);
  });
});

describe("QueryApiError", () => {
  it("serializes to the documented error body", () => {
    const err = new QueryApiError("rate_limited", "Slow down.", { retryAfterSeconds: 30 });
    assert.equal(err.status, 429);
    assert.deepEqual(err.toBody(), {
      code: "rate_limited",
      message: "Slow down.",
      retry_after_seconds: 30,
    });
  });
});

describe("mapDatabaseError", () => {
  it("turns a statement timeout into query_timeout", () => {
    assert.equal(mapDatabaseError({ code: "57014" })?.code, "query_timeout");
  });

  it("finds the code on a wrapped driver error", () => {
    const wrapped = new Error("Failed query: select pg_sleep(6)", { cause: { code: "57014" } });
    assert.equal(mapDatabaseError(wrapped)?.code, "query_timeout");
  });

  it("does not leak other database errors", () => {
    assert.equal(mapDatabaseError(new Error('relation "x" does not exist')), null);
  });
});

describe("Semaphore", () => {
  it("grants up to capacity, queues the rest, and hands slots over on release", async () => {
    const sem = new Semaphore(2);
    assert.equal(await sem.acquire(10), true);
    assert.equal(await sem.acquire(10), true);
    const waiting = sem.acquire(1_000);
    sem.release();
    assert.equal(await waiting, true);
  });

  it("gives up after the wait timeout", async () => {
    const sem = new Semaphore(1);
    await sem.acquire(10);
    assert.equal(await sem.acquire(20), false);
    // The timed-out waiter must not swallow the next release.
    sem.release();
    assert.equal(await sem.acquire(10), true);
  });
});
