// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton";
import { PlayerRosterSearch } from "@/components/admin/competition/PlayerRosterSearch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getCompetitionBySlug,
  getCompetitionTeamBySlug,
  getCompetitionTeamRoster,
  getTeamGameParticipants,
} from "@lfstats/db";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addParticipantToRosterAction,
  addPlayerAction,
  removePlayerAction,
  searchPlayersAction,
  setMercenaryAction,
  updateTeamAction,
} from "./actions";
import { ParticipantActions } from "./ParticipantActions";
import { PlayerPictureUpload } from "./PlayerPictureUpload";
import { TeamLogoUpload } from "./TeamLogoUpload";

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ slug: string; teamSlug: string }>;
}) {
  const { slug, teamSlug } = await params;
  const comp = await getCompetitionBySlug(slug);
  if (!comp) notFound();

  const team = await getCompetitionTeamBySlug(comp.id, teamSlug);
  if (!team) notFound();

  const [roster, unassigned] = await Promise.all([
    getCompetitionTeamRoster(team.id),
    getTeamGameParticipants(team.id),
  ]);

  const regularRoster = roster.filter((e) => !e.isMercenary);
  const mercs = roster.filter((e) => e.isMercenary);

  const id = comp.id;
  const teamId = team.id;
  const boundUpdate = updateTeamAction.bind(null, id, teamId);
  const boundAdd = addPlayerAction.bind(null, id, teamId);
  const boundRemove = removePlayerAction.bind(null, id, teamId);
  const boundAddParticipant = addParticipantToRosterAction.bind(null, id, teamId);
  const boundSetMerc = setMercenaryAction.bind(null, id, teamId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${comp.slug}/teams`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Teams
        </Link>
        <h2 className="text-xl font-semibold mt-1">{team.name} — Roster</h2>
        {team.shortName && <p className="text-sm text-muted-foreground">{team.shortName}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Team</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={boundUpdate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="team-name" className="text-xs">
                Name
              </Label>
              <Input
                id="team-name"
                name="name"
                defaultValue={team.name}
                className="h-8 text-sm w-64"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-short-name" className="text-xs">
                Short Name
              </Label>
              <Input
                id="team-short-name"
                name="shortName"
                defaultValue={team.shortName ?? ""}
                placeholder="e.g. ALPH"
                className="h-8 text-sm w-28"
              />
            </div>
            <Button type="submit" size="sm">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
        </CardHeader>
        <CardContent>
          <TeamLogoUpload
            competitionId={id}
            teamId={teamId}
            teamName={team.name}
            hasLogo={team.hasLogo}
            logoVersion={team.logoVersion}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add Player</CardTitle>
        </CardHeader>
        <CardContent>
          <PlayerRosterSearch
            teamId={teamId}
            searchAction={searchPlayersAction}
            addAction={boundAdd}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roster ({regularRoster.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {regularRoster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players on roster yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead>Picture</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularRoster.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.iplId !== null ? (
                        <Link
                          href={`/players/${entry.iplId.replace(/^#/, "")}`}
                          className="hover:underline"
                        >
                          {entry.currentCallsign}
                        </Link>
                      ) : (
                        entry.currentCallsign
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.iplId !== null ? (
                        <a
                          href={`https://www.iplaylaserforce.com/mission-stats/?t=${entry.iplId.replace(/^#/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {entry.iplId}
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.gamesPlayed}</TableCell>
                    <TableCell>
                      <PlayerPictureUpload
                        competitionId={id}
                        teamId={teamId}
                        entryId={entry.id}
                        callsign={entry.currentCallsign}
                        hasProfilePicture={entry.hasProfilePicture}
                        pictureVersion={entry.pictureVersion}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteEntityButton
                        id={entry.id}
                        label={entry.currentCallsign}
                        description="Remove this player from the roster."
                        action={boundRemove}
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
          <CardTitle>Mercenaries ({mercs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {mercs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mercenaries recorded.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead>Picture</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mercs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.iplId !== null ? (
                        <Link
                          href={`/players/${entry.iplId.replace(/^#/, "")}`}
                          className="hover:underline"
                        >
                          {entry.currentCallsign}
                        </Link>
                      ) : (
                        entry.currentCallsign
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.iplId !== null ? (
                        <a
                          href={`https://www.iplaylaserforce.com/mission-stats/?t=${entry.iplId.replace(/^#/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {entry.iplId}
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{entry.gamesPlayed}</TableCell>
                    <TableCell>
                      <PlayerPictureUpload
                        competitionId={id}
                        teamId={teamId}
                        entryId={entry.id}
                        callsign={entry.currentCallsign}
                        hasProfilePicture={entry.hasProfilePicture}
                        pictureVersion={entry.pictureVersion}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <DeleteEntityButton
                        id={entry.id}
                        label={entry.currentCallsign}
                        description="Remove this player from the mercenary list."
                        action={boundRemove}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned ({unassigned.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Players who appeared in games for this team but have not been classified.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead className="text-right">Games</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassigned.map((p) => (
                  <TableRow key={p.playerId}>
                    <TableCell className="font-medium">
                      {p.iplId !== null ? (
                        <Link
                          href={`/players/${p.iplId.replace(/^#/, "")}`}
                          className="hover:underline"
                        >
                          {p.currentCallsign}
                        </Link>
                      ) : (
                        p.currentCallsign
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {p.iplId !== null ? (
                        <a
                          href={`https://www.iplaylaserforce.com/mission-stats/?t=${p.iplId.replace(/^#/, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        >
                          {p.iplId}
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.gamesPlayed}</TableCell>
                    <TableCell className="text-right">
                      <ParticipantActions
                        playerId={p.playerId}
                        isMercenary={p.isMercenary}
                        addAction={boundAddParticipant}
                        mercAction={boundSetMerc}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
