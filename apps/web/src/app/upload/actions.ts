// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { getChomperJobsByS3Keys } from "@lfstats/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_ROLES = ["superAdmin", "admin", "centerAdmin", "uploader"] as const;

async function requireUploadRole() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const ok = roles.some((r) => UPLOAD_ROLES.includes(r.role as (typeof UPLOAD_ROLES)[number]));
  if (!ok) throw new Error("Forbidden");
  return session!;
}

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export async function getPresignedUrlsAction(
  filenames: string[],
): Promise<{ filename: string; url: string }[]> {
  await requireUploadRole();

  const bucket = process.env.INCOMING_BUCKET;
  if (!bucket) throw new Error("INCOMING_BUCKET is not configured");

  if (filenames.length === 0) throw new Error("No files provided");

  const invalid = filenames.filter((n) => !n.toLowerCase().endsWith(".tdf"));
  if (invalid.length > 0) {
    throw new Error(`Only .tdf files are allowed: ${invalid.join(", ")}`);
  }

  const s3 = getS3Client();

  return Promise.all(
    filenames.map(async (filename) => {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        ContentType: "application/octet-stream",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url = await getSignedUrl(s3 as any, command, { expiresIn: 300 });
      return { filename, url };
    }),
  );
}

export async function getJobStatusesAction(s3Keys: string[]) {
  await requireUploadRole();
  return getChomperJobsByS3Keys(s3Keys);
}
