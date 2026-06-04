import { Fragment } from "react"
import Link from "next/link"
import type { GameListItem } from "@lfstats/db"
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

export function GamesTable({ games }: { games: GameListItem[] }) {
  return (
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
                      {i > 0 && <span className="text-muted-foreground">–</span>}
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
  )
}
