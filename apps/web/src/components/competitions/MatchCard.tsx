// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import type { CompetitionMatchResult } from "@lfstats/db";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { TeamLogo } from "@/components/teams/TeamLogo";

export function MatchCard({
  match,
  competitionSlug,
}: {
  match: CompetitionMatchResult;
  competitionSlug: string;
}) {
  const game1 = match.games.find((g) => g.gameNumber === 1);
  const game2 = match.games.find((g) => g.gameNumber === 2);
  const incomplete = match.matchWinner === "incomplete";
  const upcoming = match.games.length === 0;

  const t1Label = match.team1ShortName ?? match.team1Name;
  const t2Label = match.team2ShortName ?? match.team2Name;
  const winnerLabel =
    match.matchWinner === "team1" ? t1Label : match.matchWinner === "team2" ? t2Label : null;

  const t1Total = (game1?.team1Score ?? 0) + (game2?.team1Score ?? 0);
  const t2Total = (game1?.team2Score ?? 0) + (game2?.team2Score ?? 0);
  const hasScore = Boolean(game1 || game2);
  const diff = hasScore ? t1Total - t2Total : null;

  const gamesPlayed = match.games.length;

  let scheduleLabel: string | null = null;
  if (gamesPlayed === 0) {
    if (match.game1ScheduledStartTime) {
      scheduleLabel = `G1: ${formatDateTime(match.game1ScheduledStartTime)}`;
      if (match.game2ScheduledStartTime) {
        scheduleLabel += ` · G2: ${formatDateTime(match.game2ScheduledStartTime)}`;
      }
    }
  } else if (gamesPlayed === 1) {
    const g1Actual = game1?.startTime;
    scheduleLabel = g1Actual ? `G1: ${formatDateTime(g1Actual)}` : null;
    if (match.game2ScheduledStartTime) {
      scheduleLabel =
        (scheduleLabel ? scheduleLabel + " · " : "") +
        `G2: ${formatDateTime(match.game2ScheduledStartTime)}`;
    }
  } else {
    const g1Actual = game1?.startTime;
    const g2Actual = game2?.startTime;
    if (g1Actual) {
      scheduleLabel = `G1: ${formatDateTime(g1Actual)}`;
      if (g2Actual) scheduleLabel += ` · G2: ${formatDateTime(g2Actual)}`;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Match {match.matchNumber}
          </span>
          <span className="tabular-nums font-bold text-lg">
            {hasScore ? `${match.team1TotalPoints} - ${match.team2TotalPoints}` : "vs"}
          </span>
          {!incomplete && (
            <Badge
              variant={match.matchWinner === "draw" ? "secondary" : "default"}
              className="text-xs"
            >
              {match.matchWinner === "draw" ? "Draw" : `${winnerLabel} wins`}
            </Badge>
          )}
          {incomplete && (
            <Badge variant="outline" className="text-xs">
              {upcoming ? "Upcoming" : "In progress"}
            </Badge>
          )}
        </div>
        {scheduleLabel && (
          <div className="text-xs text-muted-foreground text-right">{scheduleLabel}</div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col items-center gap-1.5 w-20 flex-shrink-0">
            {match.team1Id && match.team1Slug ? (
              <Link
                href={`/competitions/${competitionSlug}/teams/${match.team1Slug}`}
                className={`text-sm text-center truncate w-full hover:underline ${match.matchWinner === "team1" ? "font-semibold" : "text-muted-foreground"}`}
              >
                {t1Label}
              </Link>
            ) : (
              <span className="text-sm text-center truncate w-full text-muted-foreground italic">
                {t1Label}
              </span>
            )}
            <TeamLogo
              teamId={match.team1Id ?? undefined}
              hasLogo={match.team1HasLogo}
              name={match.team1Name}
              size={48}
            />
          </div>

          <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
            <GameScore
              score={game1?.team1Score ?? null}
              colourEnum={game1?.team1ColourEnum}
              slug={game1?.gameSlug}
            />
            <span className="text-xs text-muted-foreground text-center">G1</span>
            <GameScore
              score={game1?.team2Score ?? null}
              colourEnum={game1?.team2ColourEnum}
              slug={game1?.gameSlug}
            />

            <GameScore
              score={game2?.team1Score ?? null}
              colourEnum={game2?.team1ColourEnum}
              slug={game2?.gameSlug}
            />
            <span className="text-xs text-muted-foreground text-center">G2</span>
            <GameScore
              score={game2?.team2Score ?? null}
              colourEnum={game2?.team2ColourEnum}
              slug={game2?.gameSlug}
            />

            <ScoreDiff diff={diff} />
            <span />
            <ScoreDiff diff={diff !== null ? -diff : null} />
          </div>

          <div className="flex flex-col items-center gap-1.5 w-20 flex-shrink-0">
            {match.team2Id && match.team2Slug ? (
              <Link
                href={`/competitions/${competitionSlug}/teams/${match.team2Slug}`}
                className={`text-sm text-center truncate w-full hover:underline ${match.matchWinner === "team2" ? "font-semibold" : "text-muted-foreground"}`}
              >
                {t2Label}
              </Link>
            ) : (
              <span className="text-sm text-center truncate w-full text-muted-foreground italic">
                {t2Label}
              </span>
            )}
            <TeamLogo
              teamId={match.team2Id ?? undefined}
              hasLogo={match.team2HasLogo}
              name={match.team2Name}
              size={48}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreDiff({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>;
  }
  const label = diff > 0 ? `+${diff.toLocaleString("en-US")}` : diff.toLocaleString("en-US");
  const colorClass =
    diff > 0
      ? "text-green-600 dark:text-green-400"
      : diff < 0
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={`tabular-nums text-center font-medium ${colorClass}`}>{label}</span>;
}

function GameScore({
  score,
  colourEnum,
  slug,
}: {
  score: number | null;
  colourEnum?: number;
  slug?: string;
}) {
  if (score === null) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>;
  }
  const color = colourEnum != null ? getTeamColor(colourEnum) : undefined;
  const colorClass = color?.text ?? "text-muted-foreground";
  const formatted = score.toLocaleString("en-US");
  const cell = (
    <span className={`tabular-nums text-center font-medium ${colorClass}`}>{formatted}</span>
  );
  if (slug) {
    return (
      <Link href={`/games/${slug}`} className="hover:underline">
        {cell}
      </Link>
    );
  }
  return cell;
}
