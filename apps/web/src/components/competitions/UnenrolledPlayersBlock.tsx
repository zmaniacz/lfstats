// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EnrollPlayerRow } from "@/components/competitions/EnrollPlayerRow";
import { formatMVP } from "@/lib/format";
import type { BulkEnrollResult, RosterMutationResult, SoloUnenrolledPlayer } from "@lfstats/db";

/**
 * The solo counterpart to UnassignedGamesBlock: players with games in this competition
 * who have not been enrolled and so do not appear in the standings.
 */
export function UnenrolledPlayersBlock({
  players,
  enrollAction,
  enrollAllAction,
}: {
  players: SoloUnenrolledPlayer[];
  enrollAction: (playerId: string, handicap: number | string) => Promise<RosterMutationResult>;
  enrollAllAction: () => Promise<BulkEnrollResult>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (players.length === 0) return null;

  async function handleEnrollAll() {
    setIsPending(true);
    setError(null);
    try {
      const result = await enrollAllAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmOpen(false);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="border-amber-500/50 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex w-full items-center gap-2 px-4 py-3">
          <CollapsibleTrigger className="flex flex-1 items-center gap-2 text-left">
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="font-medium">
              {players.length} player{players.length === 1 ? "" : "s"} not enrolled in this
              competition
            </span>
          </CollapsibleTrigger>
          <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
            Enroll all at 0
          </Button>
        </div>
        <CollapsibleContent>
          <CardContent className="pb-4 pt-0">
            {error && <p className="pb-2 text-xs text-destructive">{error}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Avg MVP</TableHead>
                  <TableHead className="text-right">Handicap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {players.map((p) => (
                  <TableRow key={p.playerId}>
                    <TableCell className="font-medium">
                      {p.iplId ? (
                        <Link
                          href={`/players/${p.iplId.replace("#", "")}`}
                          className="hover:underline"
                        >
                          {p.callsign}
                        </Link>
                      ) : (
                        p.callsign
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {p.iplId ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.gamesPlayed}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMVP(p.avgMvp)}</TableCell>
                    <TableCell>
                      <EnrollPlayerRow playerId={p.playerId} enrollAction={enrollAction} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enroll all players?</AlertDialogTitle>
            <AlertDialogDescription>
              This adds all {players.length} unenrolled player
              {players.length === 1 ? "" : "s"} to the competition with a handicap of 0. They will
              appear in the standings immediately; handicaps can be adjusted afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleEnrollAll();
              }}
            >
              {isPending ? "Enrolling…" : "Enroll all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
