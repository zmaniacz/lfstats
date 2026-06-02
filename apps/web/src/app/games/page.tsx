import { Fragment } from "react"
import Link from "next/link"
import { getGamesPage, getGamesCount, GAMES_PER_PAGE, getCenterList } from "@lfstats/db"
import { GamesFilters } from "@/components/games/games-filters"
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
  searchParams: Promise<{ page?: string; center?: string; date?: string }>
}) {
  const { page: pageParam, center: centerId = "", date: dateSearch = "" } = await searchParams
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1)
  const filters = {
    centerId: centerId || undefined,
    dateSearch: dateSearch || undefined,
  }

  const [games, total, centers] = await Promise.all([
    getGamesPage(page, filters),
    getGamesCount(filters),
    getCenterList(),
  ])
  const totalPages = Math.ceil(total / GAMES_PER_PAGE)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (p > 1) params.set("page", String(p))
    if (centerId) params.set("center", centerId)
    if (dateSearch) params.set("date", dateSearch)
    const qs = params.toString()
    return `/games${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Games</h1>

      <GamesFilters
        centers={centers.map((c) => ({ id: c.id, name: c.name }))}
        centerId={centerId}
        dateSearch={dateSearch}
      />

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
                    href={`/games/${game.slug}`}
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
                          {formatScore((team.score ?? 0) + (team.eliminationBonus ?? 0))}
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
              <Link href={pageUrl(page - 1)}>Previous</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Previous
            </Button>
          )}
          {page < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={pageUrl(page + 1)}>Next</Link>
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
