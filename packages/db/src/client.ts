import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { drizzle } from "drizzle-orm/postgres-js";
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

  const client = new SecretsManagerClient({});
  const response = await client.send(
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

const client = postgres(await resolveDatabaseUrl());
export const db = drizzle(client, { schema });
