// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

/**
 * The toast for a game added to a match: a small scoreboard with a row per side, a column per
 * game in its team colours, and the match points. Rendered with `toast.custom`, so it carries
 * its own card styling.
 */

import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { cn } from "@/lib/utils";
import type { LiveMatchScoreboard, LiveMatchSide } from "@lfstats/db";
import { TrophyIcon, XIcon } from "@phosphor-icons/react";

type Side = "team1" | "team2";

function outcomeText(board: LiveMatchScoreboard): string {
  const name = (side: LiveMatchSide) => side.names.join(" & ");
  if (board.winner === "team1") return `${name(board.team1)} won the match`;
  if (board.winner === "team2") return `${name(board.team2)} won the match`;
  if (board.winner === "draw") return board.gameType === "lb" ? "Match tied" : "Match drawn";
  return "Match in progress";
}

function SideName({ side, won }: { side: LiveMatchSide; won: boolean }) {
  const [first, ...partners] = side.names;
  return (
    <div className="min-w-0">
      <div className={cn("flex items-center gap-1 truncate", won && "font-semibold")}>
        <span className="truncate" title={side.names.join(" & ")}>
          {first}
        </span>
        {won && <TrophyIcon weight="fill" className="size-3.5 shrink-0 text-amber-500" />}
      </div>
      {partners.map((partner) => (
        <div key={partner} className="text-muted-foreground truncate text-xs" title={partner}>
          & {partner}
        </div>
      ))}
    </div>
  );
}

export function MatchToast({
  board,
  onView,
  onDismiss,
}: {
  board: LiveMatchScoreboard;
  onView?: () => void;
  onDismiss: () => void;
}) {
  const columns = `minmax(0,1fr) repeat(${board.games.length}, auto) auto`;
  const pointsLabel = board.gameType === "lb" ? "Goals" : "Pts";

  const row = (side: Side) => {
    const team = board[side];
    const scoreKey = side === "team1" ? "team1Score" : "team2Score";
    const colourKey = side === "team1" ? "team1Colour" : "team2Colour";
    return (
      <>
        <SideName side={team} won={board.winner === side} />
        {board.games.map((game, i) => {
          const won = game.winner === side;
          return (
            <div
              key={game.label}
              className={cn(
                "flex items-center justify-end gap-1.5 rounded px-1.5 py-0.5 tabular-nums",
                i === board.latestIndex && "bg-muted",
                won ? "text-foreground font-semibold" : "text-muted-foreground",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  getTeamColor(game[colourKey])?.bg ?? "bg-muted",
                )}
              />
              {formatScore(game[scoreKey])}
            </div>
          );
        })}
        <div
          className={cn(
            "pl-1 text-right text-base tabular-nums",
            board.winner === side ? "font-bold" : "font-medium",
          )}
        >
          {team.points}
        </div>
      </>
    );
  };

  return (
    <div className="bg-popover text-popover-foreground w-full rounded-lg border p-3 text-sm shadow-lg">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-muted-foreground truncate text-xs tracking-wide uppercase">
            {board.competitionName}
          </div>
          <div className="truncate font-semibold">
            {board.roundName} · Match {board.matchNumber}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 rounded p-0.5"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      <div className="grid items-center gap-x-1 gap-y-1.5" style={{ gridTemplateColumns: columns }}>
        <div />
        {board.games.map((game, i) => (
          <div
            key={game.label}
            className={cn(
              "text-muted-foreground text-right text-xs",
              i === board.latestIndex && "text-foreground font-medium",
            )}
          >
            {game.label}
          </div>
        ))}
        <div className="text-muted-foreground pl-1 text-right text-xs">{pointsLabel}</div>
        {row("team1")}
        {row("team2")}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-2">
        <div className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {outcomeText(board)}
        </div>
        {onView && (
          <Button size="sm" onClick={onView}>
            View
          </Button>
        )}
      </div>
    </div>
  );
}
