import { notFound } from "next/navigation"
import Link from "next/link"
import { getCompetitionById, getCompetitionTeams } from "@lfstats/db"
import { CompetitionTeamForm } from "@/components/admin/competition/CompetitionTeamForm"
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton"
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
import { createCompetitionTeamAction, deleteCompetitionTeamAction } from "./actions"

export default async function CompetitionTeamsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [comp, teams] = await Promise.all([
    getCompetitionById(id),
    getCompetitionTeams(id),
  ])

  if (!comp) notFound()

  const boundCreate = createCompetitionTeamAction.bind(null, id)
  const boundDelete = deleteCompetitionTeamAction.bind(null, id)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {comp.name}
        </Link>
        <h2 className="text-xl font-semibold mt-1">Teams</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Team</CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionTeamForm action={boundCreate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teams ({teams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Short Name</TableHead>
                  <TableHead>Players</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/admin/competitions/${id}/teams/${team.id}`}
                        className="hover:underline"
                      >
                        {team.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {team.shortName ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{team.playerCount}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm" className="mr-2">
                        <Link href={`/admin/competitions/${id}/teams/${team.id}`}>
                          Manage Roster
                        </Link>
                      </Button>
                      <DeleteEntityButton
                        id={team.id}
                        label={`"${team.name}"`}
                        description="This removes the team and its roster from this competition."
                        action={boundDelete}
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
