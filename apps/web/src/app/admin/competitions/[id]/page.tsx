import { notFound } from "next/navigation"
import Link from "next/link"
import { getCompetitionById, getCompetitionGames, getCenterList, getCompetitionTeams, getCompetitionRounds } from "@lfstats/db"
import { CompetitionForm } from "@/components/admin/CompetitionForm"
import { BulkAssignForm } from "@/components/admin/BulkAssignForm"
import { DeleteCompetitionButton } from "@/components/admin/DeleteCompetitionButton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatDateTime, formatGameName } from "@/lib/format"
import {
  updateCompetitionAction,
  deleteCompetitionAction,
  bulkAssignGamesAction,
} from "../actions"

export default async function CompetitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [comp, games, centers, teams, rounds] = await Promise.all([
    getCompetitionById(id),
    getCompetitionGames(id),
    getCenterList(),
    getCompetitionTeams(id),
    getCompetitionRounds(id),
  ])

  if (!comp) notFound()

  const boundUpdate = updateCompetitionAction.bind(null, id)

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/competitions"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Competitions
          </Link>
          <h2 className="text-xl font-semibold mt-1">{comp.name}</h2>
        </div>
        <DeleteCompetitionButton
          competitionId={comp.id}
          competitionName={comp.name}
          action={deleteCompetitionAction}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionForm
            competition={comp}
            centers={centers}
            action={boundUpdate}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk Assign Games</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Assign all games from a center within a date range to this competition.
          </p>
          <BulkAssignForm
            competitionId={comp.id}
            centers={centers}
            action={bulkAssignGamesAction}
          />
        </CardContent>
      </Card>

      {comp.type === "competitive" && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-2xl font-bold tabular-nums">{teams.length}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/competitions/${id}/teams`}>Manage Teams</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rounds</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-2xl font-bold tabular-nums">{rounds.length}</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/competitions/${id}/rounds`}>Manage Rounds</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Assigned Games ({games.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {games.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games assigned yet.</p>
          ) : (
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
                      <Link
                        href={`/games/${g.slug}`}
                        className="hover:underline font-medium"
                      >
                        {formatGameName(g.description, g.startTime)}
                      </Link>
                    </TableCell>
                    <TableCell>{g.centerName}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatDateTime(g.startTime)}
                    </TableCell>
                    <TableCell className="capitalize">{g.outcome}</TableCell>
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
