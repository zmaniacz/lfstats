// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getCompetitionById,
  getCompetitionTeamById,
  getCompetitionTeamRoster,
  getTeamGameParticipants,
} from "@lfstats/db"
import { PlayerRosterSearch } from "@/components/admin/competition/PlayerRosterSearch"
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { addPlayerAction, removePlayerAction, searchPlayersAction, updateTeamAction, setMercenaryAction, addParticipantToRosterAction } from "./actions"
import { ParticipantActions } from "./ParticipantActions"
import { TeamLogoUpload } from "./TeamLogoUpload"

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>
}) {
  const { id, teamId } = await params
  const [comp, team, roster, unassigned] = await Promise.all([
    getCompetitionById(id),
    getCompetitionTeamById(teamId),
    getCompetitionTeamRoster(teamId),
    getTeamGameParticipants(teamId),
  ])

  if (!comp || !team) notFound()

  const regularRoster = roster.filter((e) => !e.isMercenary)
  const mercs = roster.filter((e) => e.isMercenary)

  const boundUpdate = updateTeamAction.bind(null, id, teamId)
  const boundAdd = addPlayerAction.bind(null, id, teamId)
  const boundRemove = removePlayerAction.bind(null, id, teamId)
  const boundAddParticipant = addParticipantToRosterAction.bind(null, id, teamId)
  const boundSetMerc = setMercenaryAction.bind(null, id, teamId)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${id}/teams`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Teams
        </Link>
        <h2 className="text-xl font-semibold mt-1">{team.name} — Roster</h2>
        {team.shortName && (
          <p className="text-sm text-muted-foreground">{team.shortName}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Team</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={boundUpdate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="team-name" className="text-xs">Name</Label>
              <Input id="team-name" name="name" defaultValue={team.name} className="h-8 text-sm w-64" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="team-short-name" className="text-xs">Short Name</Label>
              <Input id="team-short-name" name="shortName" defaultValue={team.shortName ?? ""} placeholder="e.g. ALPH" className="h-8 text-sm w-28" />
            </div>
            <Button type="submit" size="sm">Save</Button>
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regularRoster.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/players/${entry.iplId.replace("#", "")}`}
                        className="hover:underline"
                      >
                        {entry.currentCallsign}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.iplId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.gamesPlayed}
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
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mercs.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/players/${entry.iplId.replace("#", "")}`}
                        className="hover:underline"
                      >
                        {entry.currentCallsign}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.iplId}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.gamesPlayed}
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
                      <Link href={`/players/${p.iplId.replace("#", "")}`} className="hover:underline">
                        {p.currentCallsign}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{p.iplId}</TableCell>
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
  )
}
