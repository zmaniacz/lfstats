// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { initDb } from "@lfstats/db";
import type { S3Handler } from "aws-lambda";
import { decodeS3Key, processFile } from "./process-file.js";

export const handler: S3Handler = async (event, context) => {
  await initDb();
  const record = event.Records[0];
  if (!record) return;

  const failure = await processFile(
    record.s3.bucket.name,
    decodeS3Key(record.s3.object.key),
    context.awsRequestId,
  );
  if (failure) throw failure;
};
