// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Player profile pictures live in a PRIVATE bucket and are only ever handed out as short-lived
// signed URLs: to admins on the roster page, and to API keys holding `picture:read`. Team logos
// stay in the public images bucket (packages/db/src/lib/images.ts).
//
// Server-only: never import this from a client component. Nothing here may be NEXT_PUBLIC_.
//
// Do not pass a signed URL through next/image. The optimizer would fetch the picture once and
// then serve its cached copy from /_next/image to anyone, outliving the signature.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** How long a signed picture URL stays valid. Documented in docs/API.md. */
export const PLAYER_PICTURE_URL_TTL_SECONDS = 3600;

const UPLOAD_URL_TTL_SECONDS = 300;

/** Null when unset, in which case pictures are simply unavailable (never served publicly). */
export function getPlayerPicturesBucket(): string | null {
  return process.env.PLAYER_PICTURES_BUCKET || null;
}

/** The object key for a roster entry's picture. Shared with scripts/migrate-player-pictures.mts. */
export function playerPictureKey(entryId: string): string {
  return `player-pictures/${entryId}`;
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Signed GET URLs for the given roster entries, keyed by entry id. Signing is local (no
 * network call), so this is cheap for a whole competition. Empty when no bucket is configured.
 */
export async function signPlayerPictureUrls(entryIds: string[]): Promise<Map<string, string>> {
  const bucket = getPlayerPicturesBucket();
  if (!bucket || entryIds.length === 0) return new Map();

  const s3 = getS3Client();
  const entries = await Promise.all(
    entryIds.map(async (entryId) => {
      const command = new GetObjectCommand({ Bucket: bucket, Key: playerPictureKey(entryId) });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const url = await getSignedUrl(s3 as any, command, {
        expiresIn: PLAYER_PICTURE_URL_TTL_SECONDS,
      });
      return [entryId, url] as const;
    }),
  );
  return new Map(entries);
}

/** A signed PUT URL for uploading one picture, or null when no bucket is configured. */
export async function signPlayerPictureUploadUrl(
  entryId: string,
  contentType: string,
): Promise<string | null> {
  const bucket = getPlayerPicturesBucket();
  if (!bucket) return null;

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: playerPictureKey(entryId),
    ContentType: contentType,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getSignedUrl(getS3Client() as any, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export async function deletePlayerPicture(entryId: string): Promise<void> {
  const bucket = getPlayerPicturesBucket();
  if (!bucket) return;
  await getS3Client().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: playerPictureKey(entryId) }),
  );
}
