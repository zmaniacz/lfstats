// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatWinRate } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import type { LbPlayerGameListItem } from "@lfstats/db";

type ColorRow = { colourEnum: number; wins: number; losses: number; draws: number };

/** The player's record on each team colour they played as. */
export function LbResultsByColorTable({ games }: { games: LbPlayerGameListItem[] }) {
  const byColor = new Map<number, ColorRow>();
  for (const g of games) {
    const row = byColor.get(g.teamColourEnum) ?? {
      colourEnum: g.teamColourEnum,
      wins: 0,
      losses: 0,
      draws: 0,
    };
    if (g.result === "win") row.wins++;
    else if (g.result === "loss") row.losses++;
    else if (g.result === "draw") row.draws++;
    byColor.set(g.teamColourEnum, row);
  }
  const rows = [...byColor.values()].sort(
    (a, b) => b.wins + b.losses + b.draws - (a.wins + a.losses + a.draws),
  );

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No laserball games in this view.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Colour</TableHead>
          <TableHead className="text-right">Games</TableHead>
          <TableHead className="text-right">W</TableHead>
          <TableHead className="text-right">L</TableHead>
          <TableHead className="text-right">D</TableHead>
          <TableHead className="text-right">Win Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const color = getTeamColor(r.colourEnum);
          const total = r.wins + r.losses + r.draws;
          return (
            <TableRow key={r.colourEnum}>
              <TableCell className={`font-medium ${color?.text ?? ""}`}>
                {color?.label ?? `Colour ${r.colourEnum}`}
              </TableCell>
              <TableCell className="text-right tabular-nums">{total}</TableCell>
              <TableCell className="text-right tabular-nums">{r.wins}</TableCell>
              <TableCell className="text-right tabular-nums">{r.losses}</TableCell>
              <TableCell className="text-right tabular-nums">{r.draws}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatWinRate(r.wins, total)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
