// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
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

export const metadata: Metadata = { title: "About the Rating" };

/**
 * Player-facing explanation of the global rating.
 *
 * Written for someone who plays laser tag, not someone who does statistics: the
 * goal is that a player can tell what the number does and does not claim about
 * them. The engineering detail — schema, recompute, how the model was chosen —
 * lives in docs/Player_Rating.md instead.
 */
export default function AboutRatingPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">How the rating works</h1>
        <p className="text-sm text-muted-foreground">
          What the number on the{" "}
          <Link href="/rankings" className="underline underline-offset-2">
            rankings board
          </Link>{" "}
          means, and what it does not.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The short version</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Your rating estimates how much you add to your team&apos;s chance of winning. It is
            worked out from results alone: who was on each side, and who won.
          </p>
          <p>
            Every game is a piece of evidence. Beating a strong team is stronger evidence than
            beating a weak one, and losing to a strong team is weaker evidence against you than
            losing to a weak one. The rating is the number for each player that best explains every
            result at once.
          </p>
          <p className="text-muted-foreground">
            Roughly 0 is an average rated player. Higher is better. The scale has no ceiling, but in
            practice almost everyone sits between −1 and +1.5.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why not just win percentage?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Because win percentage cannot tell the difference between a good player and a player
            with good teammates. Someone who plays every game alongside the strongest people at
            their center will have a high win rate whether or not they contribute.
          </p>
          <p>
            Solving for every player simultaneously fixes that. If you consistently win more than
            your teammates alone would explain, the credit lands on you; if your side wins despite
            you, it does not. We tested this directly against win percentage, and win percentage was
            by far the worst method at telling a player apart from their team.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What counts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factor</TableHead>
                <TableHead>Effect</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Who you beat</TableCell>
                <TableCell>
                  The main input. Results against strong opposition move your rating most.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Margin of victory</TableCell>
                <TableCell>
                  A comfortable win is slightly stronger evidence than a narrow one. The effect is
                  deliberately damped so one blowout cannot define a season.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Game type</TableCell>
                <TableCell>
                  Competition games count in full, weighted by the round&apos;s own multiplier.
                  Social and nightly games count for a quarter — casual rosters make them noisy.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Position</TableCell>
                <TableCell>
                  Not used. Commanders and Medics are rated on the same scale, since the rating only
                  asks whether your side won.
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">MVP points</TableCell>
                <TableCell>Not used — see below.</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why MVP is not part of it</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            This is the most common objection, and we tested it thoroughly rather than assuming.
            Several versions of the rating were built that shared out credit within a team according
            to each player&apos;s MVP, so a strong individual performance in a loss would cost you
            less.
          </p>
          <p>
            Every one of them predicted future results <em>worse</em> than the version that ignores
            MVP, at every strength we tried. Pushed harder, they became unstable — the ratings
            drifted apart without limit, because a player who reliably scores well gets pushed up
            game after game whether or not their team is actually winning.
          </p>
          <p>
            The fairness concern behind the objection is real, though, and it is handled a different
            way. Because every player is solved for at once, the rating already accounts for who
            your teammates were: if you lose alongside weak teammates, the model expected you to
            lose, and the result barely moves you. That mechanism turned out to protect players from
            bad teammates better than MVP-sharing did.
          </p>
          <p className="text-muted-foreground">
            MVP remains the right stat for what it was designed for — measuring individual
            contribution within a game. It is on every scorecard and drives the leaderboards. It is
            just not a good ingredient for a win-based rating.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who appears</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            The board covers <strong>SM5 games from the last 24 months</strong>, and you need{" "}
            <strong>50 games</strong> in that window to be rated. Older results drop out over time,
            so the board reflects current form rather than career history.
          </p>
          <p>
            Guest players — anyone without a Laserforce member ID — cannot be tracked between games,
            so they are not rated. They are still counted as part of their team&apos;s strength, so
            their presence does not distort anyone else&apos;s number.
          </p>
          <p className="text-muted-foreground">
            Laserball is not rated. It is a different game with different stats and would need its
            own model.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What the bands mean</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            The labelled rules near the top of the board mark slices of the rating scale. They are
            there to make the scale readable — they are <em>not</em> tiers, and crossing one is not
            evidence that two players are meaningfully different.
          </p>
          <p>
            This matters more than it sounds. Ratings are estimates with uncertainty attached, and
            across the top of the board the typical gap between neighbouring players is several
            times smaller than that uncertainty. Ranks are printed exactly because a leaderboard
            needs an order, but the honest reading of #14 and #17 is that they are about the same.
            Only clear separations — a player well ahead of the field, or a large jump between bands
            — are real.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits worth knowing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Ratings are only comparable between players connected by a chain of games. Almost
              everyone is connected through travelling players and tournaments, but a center whose
              players never face outsiders is weakly anchored to the rest.
            </li>
            <li>
              A player with exactly 50 games has a much less certain rating than one with 500. Both
              appear; the first should be read with more caution.
            </li>
            <li>
              The rating says nothing about <em>how</em> you win. A player who wins through
              positioning and a player who wins through accuracy look identical to it. The
              scorecards and leaderboards are where that lives.
            </li>
            <li>
              It is a measure of results, not of skill in the abstract. Playing well and losing
              anyway will, over enough games, still show up — but not from any single night.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it was chosen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            The method was not picked on preference. Thirty-four candidate models — including Elo,
            TrueSkill-style ratings, and the MVP-weighted variants above — were run against every
            recorded SM5 game and scored on how well they predicted the results of games they had
            not seen.
          </p>
          <p>
            The model in use won that comparison, and separately did best at telling a player apart
            from their teammates. It is versioned, so if it is ever replaced, historical numbers
            stay attributable to the model that produced them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
