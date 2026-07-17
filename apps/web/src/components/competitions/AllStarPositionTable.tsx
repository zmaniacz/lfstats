// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMVP, formatPct, formatHitDiff } from "@/lib/format";
import type { AllStarPlayer } from "@lfstats/db";
import Link from "next/link";

export function AllStarPositionTable({
  title,
  players,
}: {
  title: string;
  players: AllStarPlayer[];
}) {
  return (
    <Card className="min-w-0 w-full overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Callsign</TableHead>
                <TableHead>Games</TableHead>
                <TableHead>Avg MVP</TableHead>
                <TableHead>Avg Accuracy</TableHead>
                <TableHead>Avg Hit Diff</TableHead>
                <TableHead>Avg Medic Hits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((p, i) => {
                const iplIdForUrl = p.iplId.startsWith("#") ? p.iplId.slice(1) : p.iplId;
                return (
                  <TableRow key={p.playerId}>
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link href={`/players/${iplIdForUrl}`} className="hover:underline">
                        {p.callsign}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {p.positionGames}/{p.totalGames}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                    <TableCell className="tabular-nums">{formatPct(p.avgAccuracy)}</TableCell>
                    <TableCell className="tabular-nums">{formatHitDiff(p.avgHitDiff)}</TableCell>
                    <TableCell className="tabular-nums">{p.avgMedicHits.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
              {players.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No qualifying players for this competition.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
