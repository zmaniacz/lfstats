// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import type { LbCompetitionMatchHalf, LbCompetitionMatchResult } from "@lfstats/db";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateIso, formatDateOnly, formatDateTime, formatHourMinute } from "@/lib/format";
import { getTeamColor } from "@/lib/team-colors";
import { TeamLogo } from "@/components/teams/TeamLogo";

// "H1" / "H2" for regulation, "OT1", "OT2", … for overtime halves.
function halfShortLabel(half: number): string {
  return half > 2 ? `OT${half - 2}` : `H${half}`;
}

/**
 * A Laserball match as a card, the counterpart of SM5's MatchCard: both teams with logos, each
 * half's goals in the colour that side played, the goal difference, and the result. Overtime
 * halves get their own rows and the card an OT badge. Excluded halves are shown but marked, as
 * they don't count.
 */
export function LbMatchCard({
  match,
  competitionSlug,
}: {
  match: LbCompetitionMatchResult;
  competitionSlug: string;
}) {
  const { outcome } = match;
  const upcoming = match.halves.length === 0;
  const t1Label = match.team1 ? (match.team1.shortName ?? match.team1.name) : "TBD";
  const t2Label = match.team2 ? (match.team2.shortName ?? match.team2.name) : "TBD";
  const resultLabel =
    outcome.winner === "tie"
      ? "Tie"
      : outcome.winner === 1
        ? `${t1Label} wins`
        : outcome.winner === 2
          ? `${t2Label} wins`
          : null;
  const diff = upcoming ? null : outcome.team1Goals - outcome.team2Goals;
  // Regulation halves always get a row, so an unplayed one reads as a dash.
  const rows: (LbCompetitionMatchHalf | { half: number })[] = [1, 2].map(
    (n) => match.halves.find((h) => h.half === n) ?? { half: n },
  );
  rows.push(...match.halves.filter((h) => h.half > 2));
  // "Jul 13, 2026 · H1 09:44 · H2 09:51": the date once when both halves share it.
  const played = match.halves.filter((h) => h.half <= 2);
  const sameDay = new Set(played.map((h) => formatDateIso(h.startTime))).size === 1;
  const playedAt = sameDay
    ? [
        formatDateOnly(formatDateIso(played[0]!.startTime)),
        ...played.map((h) => `${halfShortLabel(h.half)} ${formatHourMinute(h.startTime)}`),
      ].join(" · ")
    : played.map((h) => `${halfShortLabel(h.half)}: ${formatDateTime(h.startTime)}`).join(" · ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Match {match.matchNumber}
          </span>
          <span className="tabular-nums font-bold text-lg">
            {upcoming ? "vs" : `${outcome.team1Goals} - ${outcome.team2Goals}`}
          </span>
          <div className="flex items-center gap-1 min-w-0 max-w-[50%] justify-end">
            {outcome.overtime && (
              <Badge variant="outline" className="text-xs">
                OT
              </Badge>
            )}
            {resultLabel ? (
              <Badge
                variant={outcome.winner === "tie" ? "secondary" : "default"}
                className="text-xs truncate"
              >
                {resultLabel}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                {upcoming ? "Upcoming" : "In progress"}
              </Badge>
            )}
          </div>
        </div>
        {playedAt && <div className="text-xs text-muted-foreground text-right">{playedAt}</div>}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3">
          <MatchSide
            team={match.team1}
            label={t1Label}
            won={outcome.winner === 1}
            competitionSlug={competitionSlug}
          />

          <div className="grid grid-cols-[auto_auto_auto] items-center gap-x-3 gap-y-1.5 text-sm">
            {rows.map((row) => {
              const h = "gameSlug" in row ? row : null;
              return [
                <HalfGoals
                  key={`${row.half}-1`}
                  goals={h ? h.team1Goals : null}
                  colourEnum={h?.team1ColourEnum}
                  half={h}
                />,
                row.half > 2 ? (
                  <Badge
                    key={`${row.half}-label`}
                    variant="outline"
                    className="px-1 py-0 text-[10px] justify-self-center"
                  >
                    {halfShortLabel(row.half)}
                  </Badge>
                ) : (
                  <span
                    key={`${row.half}-label`}
                    className="text-xs text-muted-foreground text-center"
                  >
                    {halfShortLabel(row.half)}
                  </span>
                ),
                <HalfGoals
                  key={`${row.half}-2`}
                  goals={h ? h.team2Goals : null}
                  colourEnum={h?.team2ColourEnum}
                  half={h}
                />,
              ];
            })}

            <GoalDiff diff={diff} />
            <span />
            <GoalDiff diff={diff !== null ? -diff : null} />
          </div>

          <MatchSide
            team={match.team2}
            label={t2Label}
            won={outcome.winner === 2}
            competitionSlug={competitionSlug}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function MatchSide({
  team,
  label,
  won,
  competitionSlug,
}: {
  team: LbCompetitionMatchResult["team1"];
  label: string;
  won: boolean;
  competitionSlug: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 w-20 flex-shrink-0">
      {team ? (
        <Link
          href={`/competitions/${competitionSlug}/teams/${team.slug}`}
          className={`text-sm text-center truncate w-full hover:underline ${won ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
        </Link>
      ) : (
        <span className="text-sm text-center truncate w-full text-muted-foreground italic">
          {label}
        </span>
      )}
      <TeamLogo
        teamId={team?.id}
        hasLogo={team?.hasLogo ?? false}
        logoVersion={team?.logoVersion}
        name={team?.name ?? label}
        size={48}
      />
    </div>
  );
}

function GoalDiff({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>;
  }
  const label = diff > 0 ? `+${diff}` : String(diff);
  const colorClass =
    diff > 0
      ? "text-green-600 dark:text-green-400"
      : diff < 0
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={`tabular-nums text-center font-medium ${colorClass}`}>{label}</span>;
}

function HalfGoals({
  goals,
  colourEnum,
  half,
}: {
  goals: number | null;
  colourEnum?: number;
  half: LbCompetitionMatchHalf | null;
}) {
  if (goals === null || !half) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>;
  }
  const colorClass =
    (colourEnum != null ? getTeamColor(colourEnum)?.text : undefined) ?? "text-muted-foreground";
  return (
    <Link
      href={`/laserball/games/${half.gameSlug}`}
      className="hover:underline text-center"
      title={half.excluded ? "Excluded — doesn't count" : undefined}
    >
      <span
        className={`tabular-nums font-medium ${colorClass} ${half.excluded ? "line-through opacity-60" : ""}`}
      >
        {goals}
      </span>
    </Link>
  );
}
