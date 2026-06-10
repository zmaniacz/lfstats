// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

const PICTURE_BUCKET = "lfstats-modern-images";

export function getPlayerPictureUrl(entryId: string): string {
  return `https://${PICTURE_BUCKET}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${entryId}`;
}
