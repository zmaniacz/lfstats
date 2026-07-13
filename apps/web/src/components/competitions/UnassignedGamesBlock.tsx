// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatGameName } from "@/lib/format";
import type { CompetitionUnassignedGame } from "@lfstats/db";

export function UnassignedGamesBlock({ games }: { games: CompetitionUnassignedGame[] }) {
  const [open, setOpen] = useState(false);

  if (games.length === 0) return null;

  return (
    <Card className="border-amber-500/50 py-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="font-medium">
            {games.length} unassigned game{games.length === 1 ? "" : "s"} in this competition
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pb-4 pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {games.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell>
                      <Link href={`/games/${g.slug}`} className="hover:underline font-medium">
                        {formatGameName(g.description, g.startTime)}
                      </Link>
                    </TableCell>
                    <TableCell>{g.centerName}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(g.startTime)}</TableCell>
                    <TableCell className="capitalize">{g.outcome}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
