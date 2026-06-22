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

type StatDef = { stat: string; description: string };

const scorecardStats: StatDef[] = [
  {
    stat: "Goals",
    description:
      "Goals scored — the player shot the scoring target while their team held the ball.",
  },
  {
    stat: "Assists",
    description:
      "Primary assists — the last player to pass to the scorer (within a 10-second chain before the goal), excluding clears.",
  },
  {
    stat: "Passes (for / against)",
    description:
      "Normal passes thrown by this player / normal passes received. Passes transfer the ball to a teammate.",
  },
  {
    stat: "Steals (for / against)",
    description:
      "Steals performed by this player / times the ball was stolen from this player. A steal takes the ball directly from an opponent.",
  },
  {
    stat: "Blocks (for / against)",
    description:
      "Blocks made on active (non-reset) opponents / times this player was blocked while active. Blocks temporarily disable an opponent.",
  },
  {
    stat: "Clears (for / against)",
    description:
      "Clears thrown by this player / clears received. A clear is a longer-range pass for quickly moving the ball away from opponents.",
  },
  {
    stat: "Possession Time",
    description: "Total time this player held the ball during the game.",
  },
];

const offensiveStats: StatDef[] = [
  {
    stat: "Goals",
    description:
      "Goals scored — the player shot the scoring target while their team held the ball.",
  },
  {
    stat: "Big Goals",
    description:
      "Goals preceded by at least 3 aggressive actions (steals or blocks) by the scorer within the prior 5 seconds. Rewards finishing off an aggressive run.",
  },
  {
    stat: "Assists (primary)",
    description:
      "The last non-clear passer in the ≤10-second pass chain before a goal. The primary assist goes to the teammate most directly responsible for setting up the score.",
  },
  {
    stat: "Assists (secondary)",
    description:
      "The second-to-last non-clear passer in the pass chain, if distinct from both the scorer and the primary assist holder.",
  },
  {
    stat: "Clear Assists (primary)",
    description:
      "Same as primary assist, but the assisting pass was a clear (long-range pass) rather than a normal pass.",
  },
  {
    stat: "Clear Assists (secondary)",
    description: "Same as secondary assist, but the assisting action was a clear.",
  },
  {
    stat: "Pass Over Opponent",
    description:
      "Credited to a passer when their thrown pass results in a steal-back chain that leads to a goal within 3 seconds. Recognizes passes that create dangerous scoring opportunities by getting the ball through or over the defense.",
  },
  {
    stat: "Turnover Pass",
    description:
      "A pass whose receiver lost the ball to a steal within 1 second of catching it. Indicates a pass thrown into danger.",
  },
  {
    stat: "Futile Attacks",
    description:
      "Times this player stole the ball but the opponent cleared it back within 5 seconds. The steal didn't result in sustained possession.",
  },
  {
    stat: "Futile Attacks → Goal",
    description:
      "A futile attack (steal quickly cleared back) that was also followed by an opponent goal within 5 seconds. The steal attempt directly led to the opponent scoring.",
  },
  {
    stat: "Bad Attacks (failed clear)",
    description:
      "Steals by this player followed by a failed clear attempt within 5 seconds (reduced if a real clear follows). Indicates reckless attacking that left the ball uncontrolled.",
  },
];

const clearingStats: StatDef[] = [
  {
    stat: "Passes (for / against)",
    description:
      "Normal passes thrown by this player / normal passes received. Passes transfer the ball to a teammate.",
  },
  {
    stat: "Clears (for / against)",
    description:
      "Clears thrown by this player / clears received. A clear is a longer-range pass for quickly moving the ball away from opponents.",
  },
  {
    stat: "Clutch Saves",
    description:
      "A clear made within 3 seconds of being blocked, or a block made within 3 seconds of throwing a clear. Recognizes quick recovery plays under pressure.",
  },
  {
    stat: "Failed Clears",
    description:
      "The de-duplicated count of failed clear attempts, adjusted for respawn cooldowns. A failed clear occurs when the ball doesn't reach a teammate.",
  },
  {
    stat: "Inactive Clear Penalty",
    description:
      "A penalty accumulated when a teammate was inactive (down or recently reset) at the time of a failed clear. Indicates cleared into a situation where no teammate was available to catch.",
  },
  {
    stat: "No-Clear Goal",
    description:
      "A goal conceded after a steal that followed this player's failed clear. Directly tracks when a bad clear led to an opponent steal and score.",
  },
  {
    stat: "No-Clear Blocks",
    description:
      "Blocks or steals made on an inactive teammate following their failed clear. Tracks the defensive damage caused by a failed clear leaving a teammate vulnerable.",
  },
  {
    stat: "Defense Score",
    description:
      "Decremented by 1 for each opponent goal scored while this player is on defense. Accumulates as a negative number — a lower (more negative) value means more goals were conceded while this player defended.",
  },
];

const defensiveStats: StatDef[] = [
  {
    stat: "Steals (for / against)",
    description:
      "Steals performed by this player / times the ball was stolen from this player. A steal takes the ball directly from an opponent.",
  },
  {
    stat: "Blocks (for / against)",
    description:
      "Blocks made on active (non-reset) opponents / times this player was blocked while active. Blocks temporarily disable an opponent.",
  },
  {
    stat: "Reset Blocks (for / against)",
    description:
      "Blocks made on a player already in reset/down state / times this player was blocked while in reset state. Lower value than blocking an active player.",
  },
  {
    stat: "Blocks with Ball",
    description:
      "Times this player made a block while holding the ball — requires simultaneously holding the ball and tagging an opponent.",
  },
  {
    stat: "Blocks before Goal",
    description:
      "Blocks made by this player's team within the scoring window before a goal. Tracks blocks that helped create or maintain the possession chain leading to a score.",
  },
  {
    stat: "Block Serie Max",
    description:
      "The longest consecutive run of steals and blocks made without losing possession. Measures sustained defensive or aggressive dominance.",
  },
  {
    stat: "Big Mid Combos",
    description:
      "Count of 3-or-more aggressive actions (steals or blocks) within a 3-second sliding window. Rewards short bursts of intense physical play.",
  },
  {
    stat: "Reset Point",
    description:
      "Awarded when a player resets a different reset-state opponent than the last one they reset. Rewards varied defensive play rather than repeatedly hitting the same downed player.",
  },
];

const miscStats: StatDef[] = [
  {
    stat: "Possession Time",
    description: "Total time this player held the ball during the game.",
  },
  {
    stat: "Misses",
    description: "Missed shots — times the player fired at a target but failed to connect.",
  },
  {
    stat: "Target Reset (self)",
    description: "Times this player used a target reset on themselves.",
  },
  {
    stat: "Target Reset (player)",
    description: "Times this player was reset by a target reset event.",
  },
  {
    stat: "Started Round with Ball",
    description: "Times this player began a new round of play holding the ball.",
  },
  {
    stat: "Lost Ball First (round)",
    description:
      "Times this player lost the ball on the very first action after starting a round with it.",
  },
  {
    stat: "Ball Timeouts",
    description:
      "Possessions ended by timeout — times the ball timer expired while this player was holding it.",
  },
  {
    stat: "Time Played",
    description:
      "Duration from this player's first to last recorded action. Players with 30 seconds or less of playtime are excluded from the scorecard entirely.",
  },
];

function StatTable({ rows }: { rows: StatDef[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-1/3">Stat</TableHead>
          <TableHead>Description</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.stat}>
            <TableCell className="font-medium align-top">{row.stat}</TableCell>
            <TableCell className="text-muted-foreground text-sm">{row.description}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function AboutLaserballPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">About Laserball</h1>

      <Card>
        <CardHeader>
          <CardTitle>The Game</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Laserball is a team-based game mode available on Laserforce laser tag systems. Unlike
            Space Marines 5, there are no player roles and no lives — all players on both teams are
            equal, and the game ends when the clock runs out. The team with the most goals wins;
            equal scores result in a draw.
          </p>
          <p>
            One player on the field holds the ball at a time. The ball changes hands through passes,
            clears, and steals. The team holding the ball attacks; the other team defends by
            blocking and stealing. A goal is scored by the ball-holder tagging the scoring target.
          </p>
          <p>
            Play is divided into rounds — a round resets when a goal is scored or the ball goes out
            of play, and a new round starts with the ball assigned to a fresh holder. This creates a
            rhythm of possession, movement, and transition.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scorecard Stats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="text-sm text-muted-foreground mb-4">
            These stats appear on the main game scorecard. Click any player row to open the full
            detailed stats panel.
          </p>
          <StatTable rows={scorecardStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Offensive Stats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <StatTable rows={offensiveStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Passing &amp; Clearing Stats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <StatTable rows={clearingStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defensive Stats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <StatTable rows={defensiveStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Possession &amp; Misc Stats</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <StatTable rows={miscStats} />
        </CardContent>
      </Card>
    </div>
  );
}
