// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Team logos and player pictures share one public S3 bucket. The URL builders run in client
// components too, so both values are NEXT_PUBLIC_ and must be present when `next build` runs:
// Next inlines them into the browser bundle then, and a variable missing at build time stays a
// runtime `process.env` lookup that is always undefined in the browser. next.config.ts refuses
// a production build without them. Each must be read as a literal `process.env.NEXT_PUBLIC_*`
// expression or Next cannot inline it.

export function getImagesBucket(): string {
  const bucket = process.env.NEXT_PUBLIC_IMAGES_BUCKET;
  if (!bucket) throw new Error("NEXT_PUBLIC_IMAGES_BUCKET is not configured");
  return bucket;
}

function getImagesRegion(): string {
  const region = process.env.NEXT_PUBLIC_AWS_REGION;
  if (!region) throw new Error("NEXT_PUBLIC_AWS_REGION is not configured");
  return region;
}

export function getImagesHost(): string {
  return `${getImagesBucket()}.s3.${getImagesRegion()}.amazonaws.com`;
}

/** Public URL of an image object; `version` is a cache-buster appended only when > 0. */
export function getImageUrl(key: string, version: number): string {
  const base = `https://${getImagesHost()}/${key}`;
  return version > 0 ? `${base}?v=${version}` : base;
}
