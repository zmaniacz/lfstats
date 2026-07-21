// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import Link from "next/link";
import { getCompetitions } from "@lfstats/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { COMPETITION_STATE_LABELS, competitionStateBadgeVariant } from "@/lib/competition-state";

export const metadata: Metadata = { title: "Admin: Competitions" };

export default async function CompetitionsPage() {
  const competitions = await getCompetitions();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Competitions</h2>
        <Button asChild size="sm">
          <Link href="/admin/competitions/new">New Competition</Link>
        </Button>
      </div>

      {competitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No competitions yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Games</TableHead>
              <TableHead>Host Center</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitions.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/admin/competitions/${c.slug}`}
                    className="hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={c.type === "competitive" ? "default" : "secondary"}>
                    {c.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={competitionStateBadgeVariant(c.state)}>
                    {COMPETITION_STATE_LABELS[c.state]}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">{c.startDate}</TableCell>
                <TableCell className="tabular-nums">{c.endDate ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{c.gameCount}</TableCell>
                <TableCell>{c.hostCenterName ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
