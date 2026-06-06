// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

const EM_DASH = "—";

export function formatScore(n: number | null): string {
  if (n === null) return EM_DASH;
  return n.toLocaleString("en-US");
}

export function formatPct(n: number | null): string {
  if (n === null) return EM_DASH;
  return `${(n * 100).toFixed(1)}%`;
}

export function formatMs(ms: number | null): string {
  if (ms === null) return EM_DASH;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatMsDuration(ms: number | null): string {
  if (ms === null) return EM_DASH;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatHitDiff(n: number | null): string {
  if (n === null) return EM_DASH;
  return n.toFixed(2);
}

export function formatMVP(n: number | null): string {
  if (n === null) return EM_DASH;
  return n.toFixed(3);
}

export function formatWinRate(wins: number, total: number): string {
  if (total === 0) return "— (0/0)";
  const pct = ((wins / total) * 100).toFixed(1);
  return `${pct}% (${wins}/${total})`;
}

export function formatGameName(
  description: string | null,
  startTime: Date,
): string {
  if (description) return description;
  const h = String(startTime.getUTCHours()).padStart(2, "0");
  const m = String(startTime.getUTCMinutes()).padStart(2, "0");
  return `Game @ ${h}:${m}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDateTime(d: Date | null): string {
  if (d === null) return EM_DASH;
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${h}:${m}`;
}
