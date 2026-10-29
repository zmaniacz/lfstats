// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LbResultsByColorTable } from "@/components/players/LbResultsByColorTable";
import { formatAvg, formatMs, formatPct } from "@/lib/format";
import { getLbCenterSummaries, getLbResultsByColor, type GameScopeFilter } from "@lfstats/db";

export async function LbCentersContent({ scopeFilter }: { scopeFilter: GameScopeFilter }) {
  const [centers, colorResults] = await Promise.all([
    getLbCenterSummaries(scopeFilter),
    getLbResultsByColor(scopeFilter),
  ]);

  if (centers.length === 0) {
    return <p className="text-muted-foreground text-sm">No laserball games in this view.</p>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Centers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Center</TableHead>
                <TableHead className="text-right">Games</TableHead>
                <TableHead className="text-right">Players</TableHead>
                <TableHead className="text-right">Avg Goals / Game</TableHead>
                <TableHead className="text-right">Draw Rate</TableHead>
                <TableHead className="text-right">Avg Length</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centers.map((c) => (
                <TableRow key={c.centerId}>
                  <TableCell>
                    <Link
                      href={`/centers/${c.centerSlug}?game=lb`}
                      className="hover:underline font-medium"
                    >
                      {c.centerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.games.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.players.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAvg(c.avgGoalsPerGame)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPct(c.draws / c.games)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMs(c.avgDurationMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Results by Team Colour (All Centers)</CardTitle>
        </CardHeader>
        <CardContent>
          <LbResultsByColorTable results={colorResults} />
        </CardContent>
      </Card>
    </div>
  );
}
