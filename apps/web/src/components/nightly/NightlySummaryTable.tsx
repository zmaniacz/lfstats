"use client";

import type { NightlyScorecardRow } from "@/components/nightly/NightlyStatsTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  formatHitDiff,
  formatMVP,
  formatPct,
  formatScore,
  formatWinRate,
} from "@/lib/format";
import type { PlayerSocialAverages } from "@lfstats/db";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type PlayerSummary = {
  playerId: string | null;
  iplId: string | null;
  callsign: string;
  gameCount: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  avgMvp: number;
  minMvp: number;
  maxMvp: number;
  avgAccuracy: number;
  avgHitDiff: number;
  totalMedicHits: number;
  wins: number;
};

const PAGE_SIZE = 10;

type SortKey =
  | "callsign"
  | "avgScore"
  | "avgMvp"
  | "avgAccuracy"
  | "avgHitDiff"
  | "totalMedicHits"
  | "winRate";

function getSortValue(s: PlayerSummary, key: SortKey): string | number {
  switch (key) {
    case "callsign":
      return s.callsign.toLowerCase();
    case "avgScore":
      return s.avgScore;
    case "avgMvp":
      return s.avgMvp;
    case "avgAccuracy":
      return s.avgAccuracy;
    case "avgHitDiff":
      return s.avgHitDiff;
    case "totalMedicHits":
      return s.totalMedicHits;
    case "winRate":
      return s.gameCount === 0 ? -1 : s.wins / s.gameCount;
  }
}

function SortableHead({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  className,
  center = false,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (col: SortKey) => void;
  className?: string;
  center?: boolean;
}) {
  const isActive = sortKey === col;
  const Icon = isActive
    ? sortDir === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        className={`flex items-center gap-1 w-full hover:text-foreground transition-colors ${center ? "justify-center" : ""}`}
        onClick={() => onSort(col)}
      >
        {label}
        <Icon className={`h-3 w-3 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

function TrendIndicator({
  current,
  lifetime,
  label,
}: {
  current: number;
  lifetime: number | undefined;
  label: string | undefined;
}) {
  if (lifetime === undefined) return null;
  const Icon =
    current > lifetime ? TrendingUp : current < lifetime ? TrendingDown : null;
  if (!Icon) return null;
  const color = current > lifetime ? "text-green-600" : "text-red-600";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Icon className={`inline h-3 w-3 ${color} ml-1 cursor-default`} />
      </TooltipTrigger>
      <TooltipContent>Lifetime avg: {label}</TooltipContent>
    </Tooltip>
  );
}

function aggregate(rows: NightlyScorecardRow[]): PlayerSummary[] {
  const map = new Map<
    string,
    {
      entries: NightlyScorecardRow[];
      playerId: string | null;
      iplId: string | null;
      callsign: string;
    }
  >();

  for (const row of rows) {
    const key = row.player.playerId ?? `guest:${row.player.callsign}`;
    if (!map.has(key)) {
      map.set(key, {
        entries: [],
        playerId: row.player.playerId,
        iplId: row.player.iplId,
        callsign: row.player.callsign,
      });
    }
    map.get(key)!.entries.push(row);
  }

  return Array.from(map.values()).map(
    ({ entries, playerId, iplId, callsign }) => {
      const gameCount = entries.length;
      const scores = entries.map((r) => r.player.score);
      const mvps = entries.map((r) => r.player.mvpPoints);
      const accuracies = entries.map((r) => r.player.accuracy);
      const hitDiffs = entries.map((r) => r.player.hitDiff);

      return {
        playerId,
        iplId,
        callsign,
        gameCount,
        avgScore: scores.reduce((a, b) => a + b, 0) / gameCount,
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        avgMvp: mvps.reduce((a, b) => a + b, 0) / gameCount,
        minMvp: Math.min(...mvps),
        maxMvp: Math.max(...mvps),
        avgAccuracy: accuracies.reduce((a, b) => a + b, 0) / gameCount,
        avgHitDiff: hitDiffs.reduce((a, b) => a + b, 0) / gameCount,
        totalMedicHits: entries.reduce(
          (sum, r) => sum + r.player.shotsHitOpponentMedic,
          0,
        ),
        wins: entries.filter((r) => r.teamResult === "win").length,
      };
    },
  );
}

type Props = {
  rows: NightlyScorecardRow[];
  lifetimeAvgs: Map<string, PlayerSocialAverages>;
};

export function NightlySummaryTable({ rows, lifetimeAvgs }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("avgMvp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
    setPage(1);
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  const summaries = useMemo(() => aggregate(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? summaries.filter((s) => s.callsign.toLowerCase().includes(q))
      : summaries;
  }, [summaries, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortHeadProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary Stats</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Input
          placeholder="Search players…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="max-w-xs"
        />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  label="Callsign"
                  col="callsign"
                  className="w-[18%]"
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Score (Min–Max)"
                  col="avgScore"
                  className="w-[16%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg MVP (Min–Max)"
                  col="avgMvp"
                  className="w-[16%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Accuracy"
                  col="avgAccuracy"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Avg Hit Diff"
                  col="avgHitDiff"
                  className="w-[10%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Total Medic Hits"
                  col="totalMedicHits"
                  className="w-[12%]"
                  center
                  {...sortHeadProps}
                />
                <SortableHead
                  label="Win Rate"
                  col="winRate"
                  className="w-[12%]"
                  center
                  {...sortHeadProps}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-8"
                  >
                    {search
                      ? "No players match the search."
                      : "No players found."}
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((s) => {
                  const lt = s.playerId
                    ? lifetimeAvgs.get(s.playerId)
                    : undefined;
                  return (
                    <TableRow key={s.playerId ?? `guest:${s.callsign}`}>
                      <TableCell className="font-medium">
                        {s.playerId !== null ? (
                          <Link
                            href={`/players/${s.iplId?.replace(/^#/, "")}`}
                            className="hover:underline"
                          >
                            {s.callsign}
                          </Link>
                        ) : (
                          s.callsign
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        <span>{formatScore(Math.round(s.avgScore))}</span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({formatScore(s.minScore)}–{formatScore(s.maxScore)})
                        </span>
                        {lt && (
                          <TrendIndicator
                            current={s.avgScore}
                            lifetime={lt.avgScore}
                            label={formatScore(Math.round(lt.avgScore))}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        <span>{formatMVP(s.avgMvp)}</span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({formatMVP(s.minMvp)}–{formatMVP(s.maxMvp)})
                        </span>
                        {lt && (
                          <TrendIndicator
                            current={s.avgMvp}
                            lifetime={lt.avgMvp}
                            label={formatMVP(lt.avgMvp)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatPct(s.avgAccuracy)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatHitDiff(s.avgHitDiff)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {s.totalMedicHits}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        {formatWinRate(s.wins, s.gameCount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {filtered.length === summaries.length
              ? `${summaries.length} players`
              : `${filtered.length} of ${summaries.length} players`}{" "}
            · page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
