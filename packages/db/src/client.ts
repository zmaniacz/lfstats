import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

async function resolveDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) {
    throw new Error("Missing env var: DATABASE_URL or DATABASE_SECRET_ARN");
  }

  // Imported only on the Secrets Manager path, so the web build never
  // pulls the AWS SDK into its module graph.
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");

  const sm = new SecretsManagerClient({});
  const response = await sm.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  const secretString = response.SecretString;
  if (!secretString) {
    throw new Error(`Secret ${secretArn} contains no SecretString`);
  }

  let parsed;
  try {
    parsed = JSON.parse(secretString) as {
      username?: string;
      password?: string;
      host?: string;
      port?: string;
      dbname?: string;
      engine?: string;
    };
  } catch (err) {
    throw new Error(
      `Invalid JSON in secret ${secretArn}: ${(err as Error).message}`,
    );
  }

  const { username, password, host, port, dbname, engine } = parsed;
  if (!username || !password || !host || !port || !dbname) {
    throw new Error(
      `Secret ${secretArn} is missing required fields: username,password,host,port,dbname`,
    );
  }
  if (engine && engine !== "postgres") {
    throw new Error(`Unsupported secret engine: ${engine}`);
  }

  return `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${dbname}`;
}

const globalForDb = globalThis as typeof globalThis & {
  _pgClient?: postgres.Sql;
  _db?: PostgresJsDatabase<typeof schema>;
};

function build(url: string): PostgresJsDatabase<typeof schema> {
  globalForDb._pgClient ??= postgres(url, { max: 10 });
  globalForDb._db ??= drizzle(globalForDb._pgClient, { schema });
  return globalForDb._db;
}

/**
 * Async initializer. Use where the URL is resolved asynchronously
 * (e.g. Chomper, via DATABASE_SECRET_ARN). Call once before using `db`.
 */
export async function initDb(): Promise<PostgresJsDatabase<typeof schema>> {
  return globalForDb._db ?? build(await resolveDatabaseUrl());
}

/**
 * Returns the concrete instance (not the proxy). Use where a
 * library inspects the real database type — e.g. the Auth.js Drizzle
 * adapter, which detects the dialect from the instance itself.
 */
export function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb._db) return globalForDb._db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. For the Secrets Manager path (e.g. Chomper), call `await initDb()` first.",
    );
  }
  return build(url);
}

/**
 * Lazy database handle. Nothing runs at import. The client is built on
 * first property access from DATABASE_URL. For the Secrets Manager path,
 * call `await initDb()` first.
 */
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    if (!globalForDb._db) {
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          "DATABASE_URL is not set. If resolving via DATABASE_SECRET_ARN (e.g. Chomper), call `await initDb()` before using `db`.",
        );
      }
      build(url);
    }
    const real = globalForDb._db as PostgresJsDatabase<typeof schema>;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
