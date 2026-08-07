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

export type PresignedUpload = { filename: string; key: string; url: string };

/**
 * Reports rejected uploads instead of throwing: a thrown server action is
 * redacted to a bare digest in production, and the upload zone needs to name
 * the files it turned away.
 */
export type PresignedUrlsResult =
  { ok: true; uploads: PresignedUpload[] } | { ok: false; error: string };

export async function getPresignedUrlsAction(
  filenames: string[],
  competitionSlug: string | null,
): Promise<PresignedUrlsResult> {
  const session = await requireUploadRole();

  const bucket = process.env.INCOMING_BUCKET;
  if (!bucket) throw new Error("INCOMING_BUCKET is not configured");

  if (filenames.length === 0) return { ok: false, error: "No files provided" };

  const invalid = filenames.filter((n) => !n.toLowerCase().endsWith(".tdf"));
  if (invalid.length > 0) {
    return { ok: false, error: `Only .tdf files are allowed: ${invalid.join(", ")}` };
  }

  let prefix = "";
  if (competitionSlug) {
    const competition = await getCompetitionBySlug(competitionSlug);
    if (!competition) return { ok: false, error: "That competition no longer exists." };
    if (competition.state !== "active") {
      return { ok: false, error: "Competition is not currently active" };
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

  const uploads = await Promise.all(
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

  return { ok: true, uploads };
}

export async function getJobStatusesAction(s3Keys: string[]) {
  await requireUploadRole();
  return getChomperJobsByS3Keys(s3Keys);
}
