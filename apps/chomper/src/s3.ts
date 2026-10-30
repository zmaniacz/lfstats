// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({ followRegionRedirects: true });

/**
 * True for S3's "no such object". Needs s3:ListBucket on the bucket: without it
 * S3 answers 403 for a missing key rather than 404.
 */
export function isMissingObjectError(err: unknown): boolean {
  return (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404;
}

export async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (isMissingObjectError(err)) return false;
    throw err;
  }
}

export async function listTdfs(bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key?.endsWith(".tdf")) keys.push(obj.Key);
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys.sort();
}

export async function fetchTdf(bucket: string, key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!response.Body) {
    throw new Error(`S3 object ${bucket}/${key} has no body`);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function deleteTdf(bucket: string, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function archiveTdf(
  sourceBucket: string,
  sourceKey: string,
  destBucket: string,
  destKey: string,
  deleteSourceTdf: boolean,
): Promise<void> {
  // Copy to archive bucket
  await s3.send(
    new CopyObjectCommand({
      CopySource: `${sourceBucket}/${sourceKey}`,
      Bucket: destBucket,
      Key: destKey,
    }),
  );

  // Delete from source bucket
  if (deleteSourceTdf) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: sourceBucket,
        Key: sourceKey,
      }),
    );
  }
}
