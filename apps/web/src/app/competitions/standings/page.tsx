import { notFound } from "next/navigation"
import Link from "next/link"
import {
  getCompetitiveCompetitions,
  getCompetitionStandings,
  getCompetitionMatchResults,
  type CompetitionMatchResult,
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
import { Badge } from "@/components/ui/badge"
import { CompetitionSelector } from "./CompetitionSelector"
import { getTeamColor } from "@/lib/team-colors"

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

  const [standings, matchResults] = await Promise.all([
    getCompetitionStandings(activeId),
    getCompetitionMatchResults(activeId),
  ])

  // Group matches by round
  const rounds = new Map<string, { roundName: string; roundNumber: number; matches: CompetitionMatchResult[] }>()
  for (const match of matchResults) {
    if (!rounds.has(match.roundId)) {
      rounds.set(match.roundId, {
        roundName: match.roundName,
        roundNumber: match.roundNumber,
        matches: [],
      })
    }
    rounds.get(match.roundId)!.matches.push(match)
  }
  const sortedRounds = [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber)

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
                      <TableCell className="font-medium">
                        {row.teamName}
                        {row.teamShortName && (
                          <span className="text-muted-foreground font-normal ml-1">({row.teamShortName})</span>
                        )}
                      </TableCell>
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

      {sortedRounds.map((round) => (
        <div key={round.roundName} className="space-y-3">
          <h3 className="text-lg font-semibold">{round.roundName}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {round.matches.map((match) => (
              <MatchCard key={match.matchId} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchCard({ match }: { match: CompetitionMatchResult }) {
  const game1 = match.games.find((g) => g.gameNumber === 1)
  const game2 = match.games.find((g) => g.gameNumber === 2)
  const incomplete = match.matchWinner === "incomplete"

  const t1Label = match.team1ShortName ?? match.team1Name
  const t2Label = match.team2ShortName ?? match.team2Name
  const winnerLabel =
    match.matchWinner === "team1" ? t1Label :
    match.matchWinner === "team2" ? t2Label : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Match {match.matchNumber}
          </span>
          {!incomplete && (
            <Badge variant={match.matchWinner === "draw" ? "secondary" : "default"} className="text-xs">
              {match.matchWinner === "draw" ? "Draw" : `${winnerLabel} wins`}
            </Badge>
          )}
          {incomplete && (
            <Badge variant="outline" className="text-xs">In progress</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-x-2 text-sm">
          {/* Header row */}
          <span />
          <span className="text-xs text-muted-foreground text-center">G1</span>
          <span className="text-xs text-muted-foreground text-center">G2</span>
          <span className="text-xs text-muted-foreground text-center">+/-</span>
          <span />

          {/* Compute diff once */}
          {(() => {
            const t1Total = (game1?.team1Score ?? 0) + (game2?.team1Score ?? 0)
            const t2Total = (game1?.team2Score ?? 0) + (game2?.team2Score ?? 0)
            const diff = (game1 || game2) ? t1Total - t2Total : null
            return (
              <>
                {/* Team 1 row */}
                <span className={match.matchWinner === "team1" ? "font-semibold truncate" : "truncate text-muted-foreground"}>
                  {t1Label}
                </span>
                <GameScore score={game1?.team1Score ?? null} result={game1?.team1Result ?? null} colourEnum={game1?.team1ColourEnum} slug={game1?.gameSlug} />
                <GameScore score={game2?.team1Score ?? null} result={game2?.team1Result ?? null} colourEnum={game2?.team1ColourEnum} slug={game2?.gameSlug} />
                <ScoreDiff diff={diff} />
                <span className="tabular-nums text-right font-semibold">
                  {match.team1TotalPoints > 0 ? `+${match.team1TotalPoints}` : ""}
                </span>

                {/* Team 2 row */}
                <span className={match.matchWinner === "team2" ? "font-semibold truncate" : "truncate text-muted-foreground"}>
                  {t2Label}
                </span>
                <GameScore score={game1?.team2Score ?? null} result={game1?.team2Result ?? null} colourEnum={game1?.team2ColourEnum} slug={game1?.gameSlug} />
                <GameScore score={game2?.team2Score ?? null} result={game2?.team2Result ?? null} colourEnum={game2?.team2ColourEnum} slug={game2?.gameSlug} />
                <ScoreDiff diff={diff !== null ? -diff : null} />
                <span className="tabular-nums text-right font-semibold">
                  {match.team2TotalPoints > 0 ? `+${match.team2TotalPoints}` : ""}
                </span>
              </>
            )
          })()}
        </div>
      </CardContent>
    </Card>
  )
}

function ScoreDiff({ diff }: { diff: number | null }) {
  if (diff === null) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>
  }
  const label = diff > 0 ? `+${diff.toLocaleString("en-US")}` : diff.toLocaleString("en-US")
  const colorClass =
    diff > 0 ? "text-green-600 dark:text-green-400" :
    diff < 0 ? "text-destructive" :
    "text-muted-foreground"
  return <span className={`tabular-nums text-center font-medium ${colorClass}`}>{label}</span>
}

function GameScore({
  score,
  result,
  colourEnum,
  slug,
}: {
  score: number | null
  result: string | null
  colourEnum?: number
  slug?: string
}) {
  if (score === null) {
    return <span className="tabular-nums text-center text-muted-foreground">—</span>
  }
  const color = colourEnum != null ? getTeamColor(colourEnum) : undefined
  const colorClass = color?.text ?? "text-muted-foreground"
  const formatted = score.toLocaleString("en-US")
  const cell = (
    <span className={`tabular-nums text-center font-medium ${colorClass}`}>
      {formatted}
    </span>
  )
  if (slug) {
    return (
      <Link href={`/games/${slug}`} className="hover:underline">
        {cell}
      </Link>
    )
  }
  return cell
}
