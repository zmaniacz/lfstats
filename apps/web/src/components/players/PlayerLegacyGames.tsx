// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMVP, formatPct, formatScore } from "@/lib/format";
import { getPosition } from "@/lib/positions";
import { getTeamColor } from "@/lib/team-colors";
import type { PlayerPdfGame } from "@lfstats/db";
import Link from "next/link";

const SHOWN = 100;
const SIDE_COLOUR = { red: 1, green: 2 } as const;

/**
 * A player's legacy PDF-era games — listed for reference only, never folded into the
 * career stats above.
 */
export function PlayerLegacyGames({ games }: { games: PlayerPdfGame[] }) {
  if (games.length === 0) return null;
  const shown = games.slice(0, SHOWN);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Legacy games</CardTitle>
        <CardDescription>
          {formatScore(games.length)} games from printed scorecards (end-of-game totals only). They
          don&apos;t count toward career stats or the rating, and MVP uses the legacy formula.
          {games.length > SHOWN && ` Showing the ${SHOWN} most recent.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Center</TableHead>
              <TableHead>Callsign</TableHead>
              <TableHead>Pos</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Acc</TableHead>
              <TableHead className="text-right">MVP*</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((g) => (
              <TableRow key={g.slug}>
                <TableCell className="tabular-nums">
                  <Link href={`/games/${g.slug}`} className="hover:underline">
                    {formatDateTime(g.startTime)}
                  </Link>
                </TableCell>
                <TableCell>{g.centerName}</TableCell>
                <TableCell className={getTeamColor(SIDE_COLOUR[g.side])?.text ?? ""}>
                  {g.callsign}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {getPosition(g.position)?.abbr ?? g.position}
                </TableCell>
                <TableCell>
                  {g.result === null ? (
                    "—"
                  ) : (
                    <Badge
                      variant={g.result === "win" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {g.result}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatScore(g.score)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPct(g.accuracy)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMVP(g.legacyMvpPoints)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
