// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import type { LbGameDetailPlayer } from "@lfstats/db";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { formatMs } from "@/lib/format";
import { WarningIcon } from "@phosphor-icons/react";

type Props = {
  player: LbGameDetailPlayer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-medium">{value}</span>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

export function LbPlayerStatsSheet({ player, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-md overflow-y-auto"
        aria-describedby={undefined}
      >
        {player && (
          <>
            <SheetHeader className="pb-3 border-b mb-4">
              <div className="flex items-center gap-2">
                <SheetTitle>{player.callsign}</SheetTitle>
                {player.playerId === null && (
                  <Badge variant="outline" className="text-xs font-normal text-orange-500">
                    <WarningIcon className="size-3.5 mr-1" />
                    Guest
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              <StatSection title="Offensive">
                <StatRow label="Goals" value={fmt(player.goals)} />
                <StatRow label="Big Goals" value={fmt(player.bigGoals)} />
                <StatRow label="Assists (primary)" value={fmt(player.assists1)} />
                <StatRow label="Assists (secondary)" value={fmt(player.assists2)} />
                <StatRow label="Clear Assists (primary)" value={fmt(player.clearAssists1)} />
                <StatRow label="Clear Assists (secondary)" value={fmt(player.clearAssists2)} />
                <StatRow label="Pass Over Opponent" value={fmt(player.passOverOpponent)} />
                <StatRow label="Turnover Pass" value={fmt(player.turnoverPass)} />
                <StatRow label="Futile Attacks" value={fmt(player.futileAttacks)} />
                <StatRow label="Futile Attacks → Goal" value={fmt(player.futileAttacksGoal)} />
                <StatRow label="Bad Attacks (failed clear)" value={fmt(player.badAttacksFc)} />
              </StatSection>

              <StatSection title="Passing & Clearing (for / against)">
                <StatRow
                  label="Passes"
                  value={`${fmt(player.passesDone)} / ${fmt(player.passesReceived)}`}
                />
                <StatRow
                  label="Clears"
                  value={`${fmt(player.clearsDone)} / ${fmt(player.clearsReceived)}`}
                />
                <StatRow label="Clutch Saves" value={fmt(player.clutchSaves)} />
                <StatRow label="Failed Clears (calc)" value={fmt(player.failedClearsCalc)} />
                <StatRow label="Failed Clears (raw)" value={fmt(player.failedClearsRaw)} />
                <StatRow label="Inactive Clear Penalty" value={fmt(player.inactiveClearPenalty)} />
                <StatRow label="No-Clear Goal" value={fmt(player.noClearGoal)} />
                <StatRow label="No-Clear Blocks" value={fmt(player.noClearBlocks)} />
                <StatRow label="Defense Score" value={fmt(player.defenseScore)} />
              </StatSection>

              <StatSection title="Defensive (for / against)">
                <StatRow
                  label="Steals"
                  value={`${fmt(player.stealsDone)} / ${fmt(player.stealsReceived)}`}
                />
                <StatRow
                  label="Blocks"
                  value={`${fmt(player.blocksDone)} / ${fmt(player.blocksReceived)}`}
                />
                <StatRow
                  label="Reset Blocks"
                  value={`${fmt(player.resetBlocksDone)} / ${fmt(player.resetBlocksReceived)}`}
                />
                <StatRow label="Blocks with Ball" value={fmt(player.blocksWithBall)} />
                <StatRow label="Blocks before Goal" value={fmt(player.blocksBeforeGoal)} />
                <StatRow label="Block Serie Max" value={fmt(player.blockSerieMax)} />
                <StatRow label="Big Mid Combos" value={fmt(player.bigMid)} />
                <StatRow label="Reset Point" value={fmt(player.resetPoint)} />
              </StatSection>

              <StatSection title="Possession & Misc">
                <StatRow label="Possession Time" value={formatMs(player.possessionTimeMs)} />
                <StatRow label="Misses" value={fmt(player.misses)} />
                <StatRow label="Target Reset (self)" value={fmt(player.targetResetSelf)} />
                <StatRow label="Target Reset (player)" value={fmt(player.targetResetPlayer)} />
                <StatRow label="Started Round with Ball" value={fmt(player.startRoundBall)} />
                <StatRow label="Lost Ball First (round)" value={fmt(player.startRoundLoss)} />
                <StatRow label="Ball Timeouts" value={fmt(player.ballTimeout)} />
                <StatRow label="Time Played" value={formatMs(player.timePlayedMs)} />
              </StatSection>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
