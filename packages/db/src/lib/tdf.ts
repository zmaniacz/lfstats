// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

const TDF_ARCHIVE_BASE_URL = "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com";

/** Public URL of a game's raw TDF file in the archive bucket. */
export function getTdfArchiveUrl(tdfFilename: string): string {
  return `${TDF_ARCHIVE_BASE_URL}/${tdfFilename}`;
}

const LEGACY_PDF_BASE_URL = "https://lfstats-scorecards.s3.amazonaws.com";

/** Public URL of a legacy PDF-era game's printed scorecard (`sm5_pdf_game.pdf_id`). */
export function getLegacyPdfUrl(pdfId: string): string {
  return `${LEGACY_PDF_BASE_URL}/${pdfId}.pdf`;
}
