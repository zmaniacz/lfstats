import { Fragment } from "react"
import Link from "next/link"
import { getGamesPage, getGamesCount, GAMES_PER_PAGE } from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { formatDateTime, formatGameName, formatScore } from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)

  const [games, total] = await Promise.all([getGamesPage(page), getGamesCount()])
  const totalPages = Math.ceil(total / GAMES_PER_PAGE)

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Games</h1>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Game</TableHead>
            <TableHead>Center</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {games.map((game) => {
            const winner = game.teams.find((t) => t.result === "win")
            const winnerColor = winner ? getTeamColor(winner.colourEnum) : undefined
            const sortedTeams = [...game.teams].sort((a, b) =>
              a.result === "win" ? -1 : b.result === "win" ? 1 : 0
            )
            return (
              <TableRow key={game.id}>
                <TableCell>
                  <Link
                    href={`/games/${game.id}`}
                    className={`hover:underline font-medium ${winnerColor?.text ?? "text-muted-foreground"}`}
                  >
                    {formatGameName(game.description, game.startTime)}
                  </Link>
                </TableCell>
                <TableCell>{game.centerName}</TableCell>
                <TableCell className="tabular-nums">
                  {formatDateTime(game.startTime)}
                </TableCell>
                <TableCell className="capitalize">{game.outcome}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    {sortedTeams.map((team, i) => (
                      <Fragment key={i}>
                        {i > 0 && (
                          <span className="text-muted-foreground">–</span>
                        )}
                        <span className={getTeamColor(team.colourEnum)?.text ?? ""}>
                          {formatScore(team.score)}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} games · page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/games?page=${page - 1}`}>Previous</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/games?page=${page + 1}`}>Next</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
