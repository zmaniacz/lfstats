// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Long-running ingest worker: pulls S3 upload events from SQS and runs each one
 * through the same pipeline as the Lambda. Every connection is outbound, which
 * is the point — it sits next to Postgres, so nothing has to reach the database
 * from the internet.
 *
 * One message at a time on purpose. Ingests can't deadlock each other, and a
 * burst of uploads just waits in the queue.
 */

import { setTimeout as sleep } from "node:timers/promises";
import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from "@aws-sdk/client-sqs";
import { initDb, pingDb } from "@lfstats/db";
import type { S3Event } from "aws-lambda";
import { decodeS3Key, processFile } from "./process-file.js";

const QUEUE_URL = process.env.CHOMPER_QUEUE_URL;
if (!QUEUE_URL) throw new Error("Missing env var: CHOMPER_QUEUE_URL");

const LONG_POLL_SECONDS = 20;
const RETRY_DELAY_MS = 30_000;

const sqs = new SQSClient({});
const shutdown = new AbortController();

async function pause(): Promise<void> {
  await sleep(RETRY_DELAY_MS, undefined, { signal: shutdown.signal }).catch(() => {});
}

async function handleMessage(message: Message): Promise<void> {
  const messageId = message.MessageId;
  if (!messageId || !message.Body) throw new Error("SQS message has no id or body");

  // Records is absent on the s3:TestEvent S3 sends when the notification is
  // configured, which is the one message here that has nothing to process.
  const records = (JSON.parse(message.Body) as Partial<S3Event>).Records ?? [];
  for (const [index, record] of records.entries()) {
    const key = decodeS3Key(record.s3.object.key);
    console.log(`Processing ${key}`);
    const failure = await processFile(record.s3.bucket.name, key, `${messageId}/${index}`);
    if (failure) console.error(`Failed ${key}: ${failure.message}`);
  }

  await sqs.send(
    new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: message.ReceiptHandle }),
  );
}

async function run(): Promise<void> {
  await initDb();
  console.log("Chomper worker started");

  while (!shutdown.signal.aborted) {
    try {
      // Every receive counts towards the queue's maxReceiveCount, so a worker
      // polling through a database outage would dead-letter good files. They
      // wait in the queue instead, where they stay for 14 days.
      await pingDb();
      const { Messages = [] } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: LONG_POLL_SECONDS,
        }),
        { abortSignal: shutdown.signal },
      );
      // Not interrupted by shutdown: a file in progress is always finished.
      for (const message of Messages) await handleMessage(message);
    } catch (err) {
      if (shutdown.signal.aborted) break;
      // An unacknowledged message comes back after the visibility timeout.
      console.error(`Worker error, retrying: ${(err as Error).message}`);
      await pause();
    }
  }

  console.log("Chomper worker stopped");
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => shutdown.abort());
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
