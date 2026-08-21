// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { CompetitionTeamPlayerStat } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatPicker } from "@/components/competitions/StatPicker";
import { POSITIONS } from "@/lib/positions";
import { DEFAULT_STAT_KEYS, TEAM_STATS, resolveStatKeys } from "@/lib/team-stat-catalog";

const POSITION_IDS = [1, 2, 3, 4, 5];
const VALID_STAT_KEYS = new Set(TEAM_STATS.map((s) => s.key));

// With five positions and up to fourteen stats the table is far wider than the viewport, so the
// callsign is frozen — a stat column is meaningless once you've lost track of whose row it is.
// It carries its own background because the row's hover fill scrolls beneath it.
const STICKY_PLAYER_COL = "sticky left-0 bg-card";

export type ComparisonRosterRow = {
  playerId: string;
  iplId: string | null;
  currentCallsign: string;
  isMercenary: boolean;
  isUnassigned: boolean;
  gamesPlayed: number;
};

function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

export function TeamPlayerComparisonTable({
  rows,
  stats,
}: {
  rows: ComparisonRosterRow[];
  stats: CompetitionTeamPlayerStat[];
}) {
  const searchParams = useSearchParams();

  // Read the URL once for the initial view, then own the state locally. Every stat is already
  // on the client, so changing the view is pure rendering — the URL is updated in place with
  // replaceState rather than navigated, so there is nothing to refetch.
  const [pivot, setPivot] = useState(() => searchParams.get("pivot") !== "0");
  const [statKeys, setStatKeys] = useState<string[]>(() => {
    const raw = searchParams.get("stats");
    if (raw === null) return DEFAULT_STAT_KEYS;
    // Drop unrecognised tokens so a stale or hand-edited link degrades rather than breaking.
    return raw.split(",").filter((k) => VALID_STAT_KEYS.has(k));
  });

  const writeUrl = useCallback((nextPivot: boolean, nextStatKeys: string[]) => {
    const params = new URLSearchParams(window.location.search);
    if (nextPivot) params.delete("pivot");
    else params.set("pivot", "0");
    if (sameKeys(nextStatKeys, DEFAULT_STAT_KEYS)) params.delete("stats");
    else params.set("stats", nextStatKeys.join(","));
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, []);

  function handlePivotChange(next: boolean) {
    setPivot(next);
    writeUrl(next, statKeys);
  }

  function handleStatsChange(next: string[]) {
    setStatKeys(next);
    writeUrl(pivot, next);
  }

  const selectedStats = useMemo(() => resolveStatKeys(statKeys), [statKeys]);

  // position null is the across-all-positions rollup row for that player.
  const statsByPlayer = useMemo(() => {
    const map = new Map<string, Map<number | null, CompetitionTeamPlayerStat>>();
    for (const stat of stats) {
      if (!map.has(stat.playerId)) map.set(stat.playerId, new Map());
      map.get(stat.playerId)!.set(stat.position, stat);
    }
    return map;
  }, [stats]);

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Switch id="position-pivot" checked={pivot} onCheckedChange={handlePivotChange} />
        <Label htmlFor="position-pivot" className="text-sm font-normal">
          Break out by position
        </Label>
      </div>
      <StatPicker selected={statKeys} onChange={handleStatsChange} />
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {controls}
        <p className="text-sm text-muted-foreground">No players have appeared for this team yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {controls}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {pivot ? (
              <>
                <TableRow>
                  <TableHead rowSpan={2} className={`align-bottom ${STICKY_PLAYER_COL}`}>
                    Player
                  </TableHead>
                  <TableHead rowSpan={2} className="text-right align-bottom">
                    Games
                  </TableHead>
                  {POSITION_IDS.map((p) => (
                    <TableHead
                      key={p}
                      colSpan={1 + selectedStats.length}
                      className="text-center border-l"
                    >
                      {POSITIONS[p]?.abbr}
                    </TableHead>
                  ))}
                </TableRow>
                <TableRow>
                  {POSITION_IDS.flatMap((p) => [
                    <TableHead
                      key={`${p}-gp`}
                      className="text-right text-xs text-muted-foreground border-l"
                    >
                      GP
                    </TableHead>,
                    ...selectedStats.map((stat) => (
                      <TableHead
                        key={`${p}-${stat.key}`}
                        className="text-right text-xs text-muted-foreground"
                      >
                        {stat.short}
                      </TableHead>
                    )),
                  ])}
                </TableRow>
              </>
            ) : (
              <TableRow>
                <TableHead className={STICKY_PLAYER_COL}>Player</TableHead>
                <TableHead className="text-right">Games</TableHead>
                {selectedStats.map((stat) => (
                  <TableHead key={stat.key} className="text-right">
                    {stat.label}
                  </TableHead>
                ))}
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const byPosition = statsByPlayer.get(r.playerId);
              return (
                <TableRow key={r.playerId}>
                  <TableCell className={`font-medium ${STICKY_PLAYER_COL}`}>
                    <PlayerName row={r} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.gamesPlayed}</TableCell>
                  {pivot
                    ? POSITION_IDS.flatMap((p) => {
                        const stat = byPosition?.get(p);
                        return [
                          <TableCell
                            key={`${p}-gp`}
                            className="text-right tabular-nums text-muted-foreground border-l"
                          >
                            {stat ? stat.gamesPlayed : "—"}
                          </TableCell>,
                          ...selectedStats.map((def) => (
                            <TableCell key={`${p}-${def.key}`} className="text-right tabular-nums">
                              {stat ? def.format(stat[def.field] as number | null) : "—"}
                            </TableCell>
                          )),
                        ];
                      })
                    : selectedStats.map((def) => {
                        const overall = byPosition?.get(null);
                        return (
                          <TableCell key={def.key} className="text-right tabular-nums">
                            {overall ? def.format(overall[def.field] as number | null) : "—"}
                          </TableCell>
                        );
                      })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <TriangleAlert className="h-3.5 w-3.5 text-amber-500" /> Mercenary
        </span>
        <span className="inline-flex items-center gap-1">
          <CircleAlert className="h-3.5 w-3.5 text-destructive" /> Not on official roster
        </span>
      </div>
    </div>
  );
}

function PlayerName({ row }: { row: ComparisonRosterRow }) {
  const body = (
    <Fragment>
      {row.currentCallsign}
      {row.isMercenary && (
        <TriangleAlert className="h-3.5 w-3.5 text-amber-500" aria-label="Mercenary" />
      )}
      {row.isUnassigned && (
        <CircleAlert className="h-3.5 w-3.5 text-destructive" aria-label="Unassigned" />
      )}
    </Fragment>
  );

  // Guests have no profile page, so only link when there's an iplId to link to.
  if (row.iplId === null) {
    return <span className="inline-flex items-center gap-1.5">{body}</span>;
  }
  return (
    <Link
      href={`/players/${row.iplId.replace(/^#/, "")}`}
      className="hover:underline inline-flex items-center gap-1.5"
    >
      {body}
    </Link>
  );
}
