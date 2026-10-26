// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Reads the start time printed in the header of a legacy PDF scorecard, from the text
 * `pdftotext -raw` extracts. Used by scripts/fix-legacy-pdf-start-times.ts.
 */

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

// Both layouts the arenas printed: `6:10pm Oct-2-2017` and `7:55pm 10-Nov-2019`. The
// colon is required, which keeps out ad copy such as "Thurs 5.45pm - 9.45pm".
const HEADER_TIME =
  /\b(\d{1,2}):(\d{2})\s*([ap]m)\s+(?:([A-Za-z]{3})-(\d{1,2})-(\d{4})|(\d{1,2})-([A-Za-z]{3})-(\d{4}))\b/i;

/** The first printed start time in the page text, as 'YYYY-MM-DD HH:MM:00', or null. */
export function parseHeaderTime(text: string): string | null {
  const m = HEADER_TIME.exec(text);
  if (!m) return null;
  const [, h, min, ampm, monA, dayA, yearA, dayB, monB, yearB] = m;
  const month = MONTHS[(monA ?? monB)!.toLowerCase()];
  const day = Number(dayA ?? dayB);
  const year = Number(yearA ?? yearB);
  let hour = Number(h);
  if (!month || day < 1 || day > 31 || hour < 1 || hour > 12 || Number(min) > 59) return null;
  const pm = ampm!.toLowerCase() === "pm";
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${min}:00`;
}
