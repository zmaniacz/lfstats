// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import type { CompetitionTeamRosterEntry, LbCompetitionPlayerStat } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMs } from "@/lib/format";

/**
 * A Laserball team's roster with each player's totals over the competition's halves. Mercenary
 * appearances are left out of the totals, so a merc usually shows no games here.
 */
export function LbTeamRosterTable({
  roster,
  stats,
}: {
  roster: CompetitionTeamRosterEntry[];
  stats: LbCompetitionPlayerStat[];
}) {
  if (roster.length === 0) {
    return <p className="text-sm text-muted-foreground">No players on the roster yet.</p>;
  }
  const byPlayer = new Map(stats.map((s) => [s.playerId, s]));
  const rows = [...roster].sort(
    (a, b) =>
      (byPlayer.get(b.playerId)?.goals ?? -1) - (byPlayer.get(a.playerId)?.goals ?? -1) ||
      a.currentCallsign.localeCompare(b.currentCallsign),
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Player</TableHead>
          <TableHead className="text-right">Halves</TableHead>
          <TableHead className="text-right">Goals</TableHead>
          <TableHead className="text-right">Assists</TableHead>
          <TableHead className="text-right">Steals</TableHead>
          <TableHead className="text-right">Blocks</TableHead>
          <TableHead className="text-right">Passes</TableHead>
          <TableHead className="text-right">Clears</TableHead>
          <TableHead className="text-right">Possession</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const s = byPlayer.get(r.playerId);
          // A rostered player with no counted halves played none (or only as a merc): a dash,
          // not a row of zeros.
          const cell = (n: number | undefined) => (s && n !== undefined ? n : "—");
          return (
            <TableRow key={r.playerId}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {r.iplId ? (
                    <Link
                      href={`/players/${r.iplId.replace(/^#/, "")}?game=lb`}
                      className="hover:underline"
                    >
                      {r.currentCallsign}
                    </Link>
                  ) : (
                    r.currentCallsign
                  )}
                  {r.isMercenary && <Badge variant="outline">Merc</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{s?.gamesPlayed ?? 0}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.goals)}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.assists)}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.steals)}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.blocks)}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.passes)}</TableCell>
              <TableCell className="text-right tabular-nums">{cell(s?.clears)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatMs(s ? s.possessionMs : null)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
