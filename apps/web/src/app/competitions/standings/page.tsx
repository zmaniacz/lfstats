import { notFound } from "next/navigation"
import {
  getCompetitiveCompetitions,
  getCompetitionStandings,
} from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { CompetitionSelector } from "./CompetitionSelector"

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string }>
}) {
  const { competition: competitionId } = await searchParams

  const competitions = await getCompetitiveCompetitions()

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Standings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeId = competitionId ?? competitions[0].id

  const activeComp = competitions.find((c) => c.id === activeId)
  if (!activeComp) notFound()

  const standings = await getCompetitionStandings(activeId)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-xl font-semibold">Standings</h2>
        <CompetitionSelector competitions={competitions} activeId={activeId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{activeComp.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {standings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No match data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 text-right">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead className="text-right">M W-L-D</TableHead>
                  <TableHead className="text-right">G W-L-D</TableHead>
                  <TableHead className="text-right">Elims</TableHead>
                  <TableHead className="text-right">Score Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((row, i) => {
                  const ratio =
                    row.scoreAgainst === 0
                      ? row.scoreFor === 0
                        ? "—"
                        : "∞"
                      : (row.scoreFor / row.scoreAgainst).toFixed(3)
                  return (
                    <TableRow key={row.teamId}>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">{row.teamName}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {row.matchPoints}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.matchWins}-{row.matchLosses}-{row.matchDraws}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.gameWins}-{row.gameLosses}-{row.gameDraws}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.teamEliminations}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {ratio}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

