import {
  S3Client,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const s3 = new S3Client({});

export async function fetchTdf(bucket: string, key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

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
  await s3.send(
    new DeleteObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey,
    }),
  );
}
