// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

const TDF_ARCHIVE_BASE_URL = "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com";

export function getTdfArchiveUrl(tdfFilename: string): string {
  return `${TDF_ARCHIVE_BASE_URL}/${tdfFilename}`;
}
