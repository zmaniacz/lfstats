// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForDb = globalThis as typeof globalThis & {
  _pgClient?: postgres.Sql;
  _db?: PostgresJsDatabase<typeof schema>;
};

function build(url: string): PostgresJsDatabase<typeof schema> {
  globalForDb._pgClient ??= postgres(url, { max: 10, idle_timeout: 20 });
  globalForDb._db ??= drizzle(globalForDb._pgClient, { schema });
  return globalForDb._db;
}

/**
 * Builds the shared instance from DATABASE_URL, failing fast if it is unset.
 * Scripts and the Chomper worker call it once at startup.
 */
export async function initDb(): Promise<PostgresJsDatabase<typeof schema>> {
  return globalForDb._db ?? build(resolveDatabaseUrl());
}

/**
 * Returns the concrete instance (not the proxy). Use where a
 * library inspects the real database type — e.g. the Auth.js Drizzle
 * adapter, which detects the dialect from the instance itself.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb._db) return globalForDb._db;
  return build(resolveDatabaseUrl());
}

/**
 * Lazy database handle. Nothing runs at import. The client is built on
 * first property access from DATABASE_URL.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    if (!globalForDb._db) build(resolveDatabaseUrl());
    const real = globalForDb._db as PostgresJsDatabase<typeof schema>;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
