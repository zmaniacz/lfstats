// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../schema";
import { QueryApiError } from "./errors";

// A separate connection pool for query API reads, so open-ended analytics can never starve
// the site's own pool or write anything (docs/Query_API_Spec.md "Limits and safety").
//
// Defence in depth:
//  1. QUERY_DATABASE_URL should point at a SELECT-only role (packages/db/sql/query-readonly-role.sql).
//  2. Every session is also read-only and time-limited via startup parameters, which
//     still holds if QUERY_DATABASE_URL is unset and we fall back to DATABASE_URL.
//  3. A process-wide concurrency cap bounds how many requests hit the database at once.

export const ANALYTICS_POOL_SIZE = 4;
export const ANALYTICS_STATEMENT_TIMEOUT_MS = 5_000;
export const ANALYTICS_SLOT_WAIT_MS = 2_000;

const globalForAnalytics = globalThis as typeof globalThis & {
  _analyticsClient?: postgres.Sql;
  _analyticsDb?: PostgresJsDatabase<typeof schema>;
};

export function getAnalyticsDb(): PostgresJsDatabase<typeof schema> {
  if (globalForAnalytics._analyticsDb) return globalForAnalytics._analyticsDb;

  const url = process.env.QUERY_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("QUERY_DATABASE_URL (or DATABASE_URL) is not set.");

  globalForAnalytics._analyticsClient = postgres(url, {
    max: ANALYTICS_POOL_SIZE,
    idle_timeout: 20,
    connection: {
      application_name: "lfstats-query-api",
      statement_timeout: ANALYTICS_STATEMENT_TIMEOUT_MS,
      default_transaction_read_only: true,
    },
  });
  globalForAnalytics._analyticsDb = drizzle(globalForAnalytics._analyticsClient, { schema });
  return globalForAnalytics._analyticsDb;
}

/**
 * A counting semaphore with a bounded wait. Exported for tests; use withAnalyticsSlot.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly capacity: number) {}

  /** Resolves true once a slot is held, or false if none frees up within `timeoutMs`. */
  acquire(timeoutMs: number): Promise<boolean> {
    if (this.active < this.capacity) {
      this.active++;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const grant = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(grant);
        if (i !== -1) this.waiters.splice(i, 1);
        resolve(false);
      }, timeoutMs);
      this.waiters.push(grant);
    });
  }

  release(): void {
    const next = this.waiters.shift();
    // Hand the slot straight to the next waiter, so `active` is unchanged.
    if (next) next();
    else this.active--;
  }
}

const globalForSlots = globalThis as typeof globalThis & { _analyticsSlots?: Semaphore };

/**
 * Runs `fn` holding one of ANALYTICS_POOL_SIZE request slots. If none frees up within
 * ANALYTICS_SLOT_WAIT_MS the request is rejected with 429 rather than queueing without
 * bound behind slow queries.
 */
export async function withAnalyticsSlot<T>(fn: () => Promise<T>): Promise<T> {
  globalForSlots._analyticsSlots ??= new Semaphore(ANALYTICS_POOL_SIZE);
  const slots = globalForSlots._analyticsSlots;
  if (!(await slots.acquire(ANALYTICS_SLOT_WAIT_MS))) {
    throw new QueryApiError("server_busy", "The server is busy with other queries.", {
      hint: "Retry in a few seconds.",
      retryAfterSeconds: 2,
    });
  }
  try {
    return await fn();
  } finally {
    slots.release();
  }
}
