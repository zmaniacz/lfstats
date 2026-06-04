import { Fragment } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getUserFavorites, getUserFavoritePlayers } from "@lfstats/db"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatGameName, formatScore } from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"

export default async function FavoritesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/")

  const [games, favoritePlayers] = await Promise.all([
    getUserFavorites(session.user.id),
    getUserFavoritePlayers(session.user.id),
  ])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Favorites</h1>

      {games.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No favorites yet. Heart a game on its detail page to save it here.
        </p>
      ) : (
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
                a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
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
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Favorite Players</h2>

        {favoritePlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No favorite players yet. Heart a player on their profile page to save them here.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Callsign</TableHead>
                <TableHead>Games</TableHead>
                <TableHead>Last Played</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {favoritePlayers.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link
                      href={`/players/${p.iplId}`}
                      className="hover:underline font-medium"
                    >
                      {p.currentCallsign}
                    </Link>
                  </TableCell>
                  <TableCell className="tabular-nums">{p.totalGames}</TableCell>
                  <TableCell className="tabular-nums">
                    {p.lastGameAt ? formatDateTime(p.lastGameAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
