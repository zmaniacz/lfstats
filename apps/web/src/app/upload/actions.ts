// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use server";

import { auth } from "@/auth";
import { getChomperJobsByS3Keys, getCompetitionBySlug } from "@lfstats/db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_ROLES = ["superAdmin", "admin", "centerAdmin", "uploader"] as const;
const ADMIN_ROLES = ["admin", "superAdmin"];

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
  competitionSlug: string | null,
): Promise<{ filename: string; key: string; url: string }[]> {
  const session = await requireUploadRole();

  const bucket = process.env.INCOMING_BUCKET;
  if (!bucket) throw new Error("INCOMING_BUCKET is not configured");

  if (filenames.length === 0) throw new Error("No files provided");

  const invalid = filenames.filter((n) => !n.toLowerCase().endsWith(".tdf"));
  if (invalid.length > 0) {
    throw new Error(`Only .tdf files are allowed: ${invalid.join(", ")}`);
  }

  let prefix = "";
  if (competitionSlug) {
    const competition = await getCompetitionBySlug(competitionSlug);
    if (!competition) throw new Error("Competition not found");
    if (competition.state !== "active") {
      throw new Error("Competition is not currently active");
    }

    const roles = session.user?.roles ?? [];
    const isAdmin = roles.some((r) => ADMIN_ROLES.includes(r.role));
    if (!isAdmin) {
      const allowed = roles.some(
        (r) =>
          (r.role === "centerAdmin" || r.role === "uploader") &&
          r.centerId === competition.hostCenterId,
      );
      if (!allowed) throw new Error("Forbidden");
    }

    prefix = `${competitionSlug}/`;
  }

  const s3 = getS3Client();

  return Promise.all(
    filenames.map(async (filename) => {
      const key = `${prefix}${filename}`;
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: "application/octet-stream",
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url = await getSignedUrl(s3 as any, command, { expiresIn: 300 });
      return { filename, key, url };
    }),
  );
}

export async function getJobStatusesAction(s3Keys: string[]) {
  await requireUploadRole();
  return getChomperJobsByS3Keys(s3Keys);
}
