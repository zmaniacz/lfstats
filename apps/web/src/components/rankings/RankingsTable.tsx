// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Fragment } from "react";
import type { RankingRow } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPct } from "@/lib/format";

/**
 * The ranked board.
 *
 * Ranks are exact and sequential. Across the leading rows the table also breaks
 * the list into fixed rating bands — plain slices of the rating scale, labelled
 * with their range so a rule at an arbitrary row explains itself.
 *
 * The bands are a reading aid, not a claim that players either side of a rule
 * are meaningfully different: adjacent players are typically separated by far
 * less than the uncertainty in their ratings. The label says "1.25 – 1.50", a
 * statement about the scale, rather than "Tier 2", a statement about them.
 */
export function RankingsTable({
  rows,
  bandWidth,
  groupedHead,
}: {
  rows: RankingRow[];
  bandWidth: number;
  groupedHead: number;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14 text-right">#</TableHead>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Rating</TableHead>
          <TableHead className="text-right">Games</TableHead>
          <TableHead className="text-right">W–L–D</TableHead>
          <TableHead className="text-right">Win %</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const inBandedHead = i < groupedHead;
          const prev = i > 0 ? rows[i - 1] : null;
          const startsBand =
            inBandedHead && (prev === null || row.ratingGroup !== prev.ratingGroup);

          const bandFloor = row.ratingGroup * bandWidth;
          const bandCeiling = bandFloor + bandWidth;

          return (
            <Fragment key={row.playerId}>
              {startsBand && (
                <TableRow className="hover:bg-transparent border-0">
                  <TableCell colSpan={6} className="py-1">
                    <div className="flex items-center gap-3 pt-2">
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">
                        {bandFloor.toFixed(2)} – {bandCeiling.toFixed(2)}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {row.rank}
                </TableCell>
                <TableCell className="font-medium">
                  {/* The route segment carries the id without its leading '#'. */}
                  <Link
                    href={`/players/${row.iplId.replace(/^#/, "")}`}
                    className="hover:underline"
                  >
                    {row.callsign}
                  </Link>
                </TableCell>
                <TableCell className="text-right font-mono">{row.rating.toFixed(3)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.gamesPlayed}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.wins}–{row.losses}–{row.draws}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPct(row.winRate)}</TableCell>
              </TableRow>
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
