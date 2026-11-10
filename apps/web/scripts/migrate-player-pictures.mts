// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// One-off: moves player profile pictures out of the public images bucket into the private
// PLAYER_PICTURES_BUCKET. Until this has run with --delete-source, every existing picture is
// still world-readable at https://<images bucket>.s3.<region>.amazonaws.com/<roster entry id>.
//
//   DATABASE_URL=postgres://… AWS_REGION=… AWS_ACCESS_KEY_ID=… AWS_SECRET_ACCESS_KEY=… \
//   NEXT_PUBLIC_IMAGES_BUCKET=… PLAYER_PICTURES_BUCKET=… \
//   pnpm --filter web pictures:migrate [--delete-source]
//
// Without --delete-source it only copies, so it is safe to run first and check. It is
// idempotent: a picture already gone from the source is reported and skipped. Team logos share
// the source bucket under bare team ids and are never touched: only ids of roster entries
// with has_profile_picture are read.
//
// The credentials need s3:GetObject and s3:DeleteObject on the images bucket and s3:PutObject
// on the private one. Both buckets are assumed to be in AWS_REGION.

import postgres from "postgres";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { playerPictureKey } from "../src/lib/player-picture-storage";

const source = process.env.NEXT_PUBLIC_IMAGES_BUCKET;
const target = process.env.PLAYER_PICTURES_BUCKET;
if (!process.env.DATABASE_URL || !process.env.AWS_REGION || !source || !target) {
  console.error(
    "Set DATABASE_URL, AWS_REGION, NEXT_PUBLIC_IMAGES_BUCKET and PLAYER_PICTURES_BUCKET.",
  );
  process.exit(1);
}
if (source === target) {
  console.error("PLAYER_PICTURES_BUCKET must be a different, private bucket.");
  process.exit(1);
}
const deleteSource = process.argv.includes("--delete-source");

const pg = postgres(process.env.DATABASE_URL, { max: 1 });
const s3 = new S3Client({ region: process.env.AWS_REGION });

const rows = await pg<{ id: string }[]>`
  SELECT id FROM competition_team_player WHERE has_profile_picture ORDER BY id
`;
console.log(`${rows.length} roster entries have a picture.`);

function isMissing(err: unknown): boolean {
  const name = (err as { name?: string }).name;
  return name === "NotFound" || name === "NoSuchKey";
}

let copied = 0;
let alreadyMoved = 0;
let lost = 0;
let deleted = 0;
for (const { id } of rows) {
  const key = playerPictureKey(id);
  let inSource = true;
  try {
    await s3.send(new HeadObjectCommand({ Bucket: source, Key: id }));
  } catch (err) {
    if (!isMissing(err)) throw err;
    inSource = false;
  }

  if (!inSource) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: target, Key: key }));
      alreadyMoved++;
    } catch (err) {
      if (!isMissing(err)) throw err;
      lost++;
      console.warn(`  ${id}: in neither bucket (has_profile_picture is stale)`);
    }
    continue;
  }

  await s3.send(
    new CopyObjectCommand({
      Bucket: target,
      Key: key,
      CopySource: `${source}/${encodeURIComponent(id)}`,
    }),
  );
  copied++;

  if (deleteSource) {
    // Only after the copy above succeeded; a failed copy throws and stops the run.
    await s3.send(new DeleteObjectCommand({ Bucket: source, Key: id }));
    deleted++;
  }
}

console.log(
  `Copied ${copied}, already moved ${alreadyMoved}, missing ${lost}, ` +
    `deleted from the public bucket ${deleted}.`,
);
if (!deleteSource && copied > 0) {
  console.log("Pictures are still public. Re-run with --delete-source to remove them.");
}
await pg.end();
