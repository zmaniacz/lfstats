// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  getCompetitionBySlug,
  getSoloCompetitionEnrollments,
  getSoloCompetitionUnenrolledPlayers,
} from "@lfstats/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import { HandicapEditor } from "@/components/admin/competition/HandicapEditor";
import { PlayerRosterSearch } from "@/components/admin/competition/PlayerRosterSearch";
import { EnrollPlayerRow } from "@/components/competitions/EnrollPlayerRow";
import { formatMVP } from "@/lib/format";
import {
  enrollSoloPlayerAction,
  removeSoloPlayerAction,
  searchPlayersAction,
  setSoloHandicapAction,
} from "./actions";

const getCompetition = cache(getCompetitionBySlug);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const comp = await getCompetition(slug);
  if (!comp) return { title: "Admin: Competition Not Found" };
  return { title: `Admin: ${comp.name} Players` };
}

export default async function SoloPlayersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const comp = await getCompetition(slug);
  if (!comp) notFound();
  // Enrollment only exists for solo competitions; a team competition manages its
  // players through team rosters instead.
  if (comp.format !== "solo") notFound();

  const [enrolled, unenrolled] = await Promise.all([
    getSoloCompetitionEnrollments(comp.id),
    getSoloCompetitionUnenrolledPlayers(comp.id),
  ]);

  const boundEnroll = enrollSoloPlayerAction.bind(null, comp.id);
  const boundSetHandicap = setSoloHandicapAction.bind(null, comp.id);
  const boundRemove = removeSoloPlayerAction.bind(null, comp.id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/admin/competitions/${comp.slug}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {comp.name}
        </Link>
        <h2 className="text-xl font-semibold mt-1">Players</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Only enrolled players appear in the standings. A handicap is a whole number of MVP points
          added to each of a player&apos;s counted games; it may be negative.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Player</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Search for any player to enroll them at a handicap of 0. Players who already have games
            in this competition are listed below and can be added with a handicap directly.
          </p>
          <PlayerRosterSearch
            searchAction={searchPlayersAction}
            addAction={(playerId) => boundEnroll(playerId, 0)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrolled ({enrolled.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {enrolled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players enrolled yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Handicap</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolled.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {e.iplId ? (
                          <>
                            <Link
                              href={`/players/${e.iplId.replace("#", "")}`}
                              className="hover:underline"
                            >
                              {e.callsign}
                            </Link>
                            <a
                              href={`https://www.iplaylaserforce.com/mission-stats/?t=${e.iplId.replace("#", "")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-foreground"
                              title="iPlayLaserforce profile"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        ) : (
                          e.callsign
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.gamesPlayed}</TableCell>
                    <TableCell>
                      <HandicapEditor
                        entryId={e.id}
                        handicap={e.handicap}
                        action={boundSetHandicap}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteEntityButton
                        id={e.id}
                        label={e.callsign}
                        description="This removes the player from the competition standings. Their games and scorecards are untouched, and they will reappear in the not-enrolled list."
                        action={boundRemove}
                        confirmLabel="Remove"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Not Enrolled ({unenrolled.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {unenrolled.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Everyone with games in this competition is enrolled.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead className="text-right">Avg MVP</TableHead>
                  <TableHead className="text-right">Handicap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unenrolled.map((p) => (
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
                      <EnrollPlayerRow playerId={p.playerId} enrollAction={boundEnroll} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
