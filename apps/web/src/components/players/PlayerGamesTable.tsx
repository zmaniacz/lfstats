// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Fragment, useState, useMemo } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronDown } from "lucide-react";
import type { PlayerGameListItem } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime, formatGameName, formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { POSITIONS } from "@/lib/positions";
import { MvpBreakdownDialog } from "@/components/games/MvpBreakdownDialog";

const PAGE_SIZE = 10;

const OUTCOME_ORDER = [
  "Win — Score",
  "Win — Elimination",
  "Loss — Score",
  "Loss — Elimination",
  "Draw",
];

type SortColumn =
  | "game"
  | "center"
  | "started"
  | "outcome"
  | "position"
  | "teamScore"
  | "mvp"
  | "score";

type SortState = { column: SortColumn; dir: "asc" | "desc" } | null;

type EnrichedGame = PlayerGameListItem & {
  outcomeLabel: string;
  playerTeamTotal: number;
};

function enrichGame(g: PlayerGameListItem): EnrichedGame {
  const playerTeam = g.teams.find((t) => t.colourEnum === g.teamColourEnum);
  const playerTeamResult = playerTeam?.result;
  const outcomeLabel =
    g.outcome === "draw"
      ? "Draw"
      : playerTeamResult === "win"
        ? `Win — ${g.outcome === "elimination" ? "Elimination" : "Score"}`
        : playerTeamResult === "loss"
          ? `Loss — ${g.outcome === "elimination" ? "Elimination" : "Score"}`
          : g.outcome;
  const playerTeamTotal = (playerTeam?.score ?? 0) + (playerTeam?.eliminationBonus ?? 0);
  return { ...g, outcomeLabel, playerTeamTotal };
}

function getSortValue(item: EnrichedGame, col: SortColumn): string | number {
  switch (col) {
    case "game":
    case "started":
      return item.startTime.getTime();
    case "center":
      return item.centerName.toLowerCase();
    case "outcome":
      return OUTCOME_ORDER.indexOf(item.outcomeLabel);
    case "position":
      return item.position;
    case "teamScore":
      return item.playerTeamTotal;
    case "mvp":
      return item.mvpPoints;
    case "score":
      return item.score;
  }
}

function SortableHead({
  column,
  sort,
  onSort,
  children,
}: {
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  children: React.ReactNode;
}) {
  const isActive = sort?.column === column;
  const Icon = isActive ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead>
      <button
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        <Icon className={`h-3 w-3 ${isActive ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const triggerLabel =
    selected.length === 0
      ? label
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? label)
        : `${selected.length} selected`;

  function toggle(value: string, checked: boolean) {
    onChange(checked ? [...selected, value] : selected.filter((v) => v !== value));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={selected.length > 0 ? "border-primary" : ""}>
          {triggerLabel}
          <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked)}
            onSelect={(e) => e.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PlayerGamesTable({ games }: { games: PlayerGameListItem[] }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(null);
  const [centerFilter, setCenterFilter] = useState<string[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState<string[]>([]);
  const [positionFilter, setPositionFilter] = useState<string[]>([]);

  const enriched = useMemo(() => games.map(enrichGame), [games]);

  const centerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const g of enriched) seen.set(g.centerId, g.centerName);
    return [...seen.entries()]
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enriched]);

  const outcomeOptions = useMemo(
    () =>
      OUTCOME_ORDER.filter((o) => enriched.some((g) => g.outcomeLabel === o)).map((o) => ({
        value: o,
        label: o,
      })),
    [enriched],
  );

  const positionOptions = useMemo(() => {
    const positions = [...new Set(enriched.map((g) => g.position))].sort((a, b) => a - b);
    return positions.map((p) => ({
      value: String(p),
      label: POSITIONS[p]?.abbr ?? String(p),
    }));
  }, [enriched]);

  const hasActiveFilters =
    centerFilter.length > 0 || outcomeFilter.length > 0 || positionFilter.length > 0;

  function handleSort(col: SortColumn) {
    setSort((prev) =>
      prev?.column === col
        ? { column: col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column: col, dir: "asc" },
    );
    setPage(1);
  }

  function handleFilterChange(setter: (v: string[]) => void) {
    return (values: string[]) => {
      setter(values);
      setPage(1);
    };
  }

  function clearFilters() {
    setCenterFilter([]);
    setOutcomeFilter([]);
    setPositionFilter([]);
    setPage(1);
  }

  const filtered = useMemo(() => {
    return enriched.filter((g) => {
      if (centerFilter.length > 0 && !centerFilter.includes(g.centerId)) return false;
      if (outcomeFilter.length > 0 && !outcomeFilter.includes(g.outcomeLabel)) return false;
      if (positionFilter.length > 0 && !positionFilter.includes(String(g.position))) return false;
      return true;
    });
  }, [enriched, centerFilter, outcomeFilter, positionFilter]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sort.column);
      const vb = getSortValue(b, sort.column);
      const cmp =
        typeof va === "number" ? va - (vb as number) : (va as string).localeCompare(vb as string);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageGames = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (games.length === 0) {
    return <p className="text-muted-foreground">No games found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="All Centers"
          options={centerOptions}
          selected={centerFilter}
          onChange={handleFilterChange(setCenterFilter)}
        />
        <MultiSelectFilter
          label="All Outcomes"
          options={outcomeOptions}
          selected={outcomeFilter}
          onChange={handleFilterChange(setOutcomeFilter)}
        />
        <MultiSelectFilter
          label="All Positions"
          options={positionOptions}
          selected={positionFilter}
          onChange={handleFilterChange(setPositionFilter)}
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead column="game" sort={sort} onSort={handleSort}>
              Game
            </SortableHead>
            <SortableHead column="center" sort={sort} onSort={handleSort}>
              Center
            </SortableHead>
            <SortableHead column="started" sort={sort} onSort={handleSort}>
              Started
            </SortableHead>
            <SortableHead column="outcome" sort={sort} onSort={handleSort}>
              Outcome
            </SortableHead>
            <SortableHead column="position" sort={sort} onSort={handleSort}>
              Position
            </SortableHead>
            <SortableHead column="teamScore" sort={sort} onSort={handleSort}>
              Team Score
            </SortableHead>
            <SortableHead column="mvp" sort={sort} onSort={handleSort}>
              MVP
            </SortableHead>
            <SortableHead column="score" sort={sort} onSort={handleSort}>
              Score
            </SortableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageGames.map((game) => {
            const winner = game.teams.find((t) => t.result === "win");
            const winnerColor = winner ? getTeamColor(winner.colourEnum) : undefined;
            const sortedTeams = [...game.teams].sort((a, b) =>
              a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
            );
            const positionColor = getTeamColor(game.teamColourEnum);
            const positionAbbr = POSITIONS[game.position]?.abbr ?? String(game.position);

            return (
              <TableRow key={game.id}>
                <TableCell>
                  <Link
                    href={`/games/${game.gameSlug}`}
                    className={`hover:underline font-medium ${winnerColor?.text ?? "text-muted-foreground"}`}
                  >
                    {formatGameName(game.description, game.startTime)}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/centers/${game.centerSlug}`} className="hover:underline">
                    {game.centerName}
                  </Link>
                </TableCell>
                <TableCell className="tabular-nums">{formatDateTime(game.startTime)}</TableCell>
                <TableCell>{game.outcomeLabel}</TableCell>
                <TableCell className={positionColor?.text ?? ""}>{positionAbbr}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    {sortedTeams.map((team, i) => (
                      <Fragment key={i}>
                        {i > 0 && <span className="text-muted-foreground">–</span>}
                        <span className={getTeamColor(team.colourEnum)?.text ?? ""}>
                          {formatScore((team.score ?? 0) + (team.eliminationBonus ?? 0))}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                </TableCell>
                <TableCell>
                  <MvpBreakdownDialog
                    callsign={game.callsign}
                    totalMvp={game.mvpPoints}
                    components={game.mvpComponents}
                  />
                </TableCell>
                <TableCell className="tabular-nums">{formatScore(game.score)}</TableCell>
              </TableRow>
            );
          })}
          {pageGames.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No games match the current filters.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sorted.length === games.length
            ? `${games.length} games`
            : `${sorted.length} of ${games.length} games`}{" "}
          · page {page} of {Math.max(1, totalPages)}
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
    </div>
  );
}
