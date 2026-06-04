import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getCompetitionMatchById,
  getMatchGameAssignments,
  getUnassignedCompetitionGames,
} from "@lfstats/db"
import { MatchGameAssignForm } from "@/components/admin/competition/MatchGameAssignForm"
import { DeleteEntityButton } from "@/components/admin/competition/DeleteEntityButton"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TEAM_COLORS } from "@/lib/team-colors"
import { formatGameName, formatDateTime } from "@/lib/format"
import { assignGameAction, removeGameAction } from "./actions"

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string; roundId: string; matchId: string }>
}) {
  const { id, roundId, matchId } = await params
  const [match, assignments, unassignedGames] = await Promise.all([
    getCompetitionMatchById(matchId),
    getMatchGameAssignments(matchId),
    getUnassignedCompetitionGames(id),
  ])

  if (!match) notFound()

  const assignedNumbers = new Set(assignments.map((a) => a.gameNumber))
  const availableGameNumbers = [1, 2].filter((n) => !assignedNumbers.has(n))

  const boundAssign = assignGameAction.bind(null, id, matchId)
  const boundRemove = removeGameAction.bind(null, id, matchId)

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/competitions/${id}/rounds`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Rounds & Matches
        </Link>
        <h2 className="text-xl font-semibold mt-1">
          {match.team1Name} vs {match.team2Name}
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assigned Games</CardTitle>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No games assigned yet.</p>
          ) : (
            <div className="divide-y border rounded-md">
              {assignments.map((a) => {
                const t1Color = TEAM_COLORS[a.team1ColourEnum]
                const t2Color = TEAM_COLORS[a.team2ColourEnum]
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">Game {a.gameNumber}</Badge>
                      <span className="font-medium">
                        {formatGameName(a.gameDescription, a.gameStartTime)}
                      </span>
                      <span className="text-muted-foreground">
                        {formatDateTime(a.gameStartTime)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {match.team1Name}={t1Color?.label ?? "?"} / {match.team2Name}=
                        {t2Color?.label ?? "?"}
                      </span>
                    </div>
                    <DeleteEntityButton
                      id={a.id}
                      label={`Game ${a.gameNumber}`}
                      description="This unlinks the game from the match. The game itself is not affected."
                      action={boundRemove}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {availableGameNumbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assign Game</CardTitle>
          </CardHeader>
          <CardContent>
            {unassignedGames.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No unassigned competition games available.{" "}
                <Link href={`/admin/competitions/${id}`} className="underline">
                  Assign more games to this competition
                </Link>{" "}
                first.
              </p>
            ) : (
              <MatchGameAssignForm
                team1Name={match.team1Name}
                team2Name={match.team2Name}
                availableGameNumbers={availableGameNumbers}
                unassignedGames={unassignedGames}
                action={boundAssign}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
