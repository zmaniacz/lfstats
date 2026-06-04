import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getCompetitionById,
  getCompetitionTeamById,
  getCompetitionTeamRoster,
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
import { addPlayerAction, removePlayerAction, searchPlayersAction } from "./actions"

export default async function TeamRosterPage({
  params,
}: {
  params: Promise<{ id: string; teamId: string }>
}) {
  const { id, teamId } = await params
  const [comp, team, roster] = await Promise.all([
    getCompetitionById(id),
    getCompetitionTeamById(teamId),
    getCompetitionTeamRoster(teamId),
  ])

  if (!comp || !team) notFound()

  const boundAdd = addPlayerAction.bind(null, id, teamId)
  const boundRemove = removePlayerAction.bind(null, id, teamId)

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
          <CardTitle>Roster ({roster.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players on roster yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Callsign</TableHead>
                  <TableHead>IPL ID</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.playerId ? (
                        <Link
                          href={`/players/${entry.iplId.replace("#", "")}`}
                          className="hover:underline"
                        >
                          {entry.currentCallsign}
                        </Link>
                      ) : (
                        entry.currentCallsign
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {entry.iplId}
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
    </div>
  )
}
