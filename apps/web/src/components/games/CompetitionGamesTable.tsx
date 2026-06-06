// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime, formatScore } from "@/lib/format"
import { getTeamColor } from "@/lib/team-colors"
import type { CompetitionGameListItem } from "@lfstats/db"
import Link from "next/link"
import { Fragment } from "react"

export function CompetitionGamesTable({ games }: { games: CompetitionGameListItem[] }) {
  return (
    <Card>
      <CardContent className="space-y-4">
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
              const sortedTeams = [...game.teams].sort((a, b) =>
                a.result === "win" ? -1 : b.result === "win" ? 1 : 0,
              )
              const t1Color = getTeamColor(game.team1ColourEnum)
              const t2Color = getTeamColor(game.team2ColourEnum)
              return (
                <TableRow key={game.id}>
                  <TableCell>
                    <Link href={`/games/${game.slug}`} className="hover:underline font-medium flex items-center gap-1">
                      <span className="text-muted-foreground">{game.prefix}</span>
                      <span
                        className={`${t1Color?.text ?? "text-muted-foreground"} ${game.team1Result === "win" ? "font-bold" : "font-normal"}`}
                      >
                        {game.team1Label}
                      </span>
                      <span className="text-muted-foreground">v</span>
                      <span
                        className={`${t2Color?.text ?? "text-muted-foreground"} ${game.team2Result === "win" ? "font-bold" : "font-normal"}`}
                      >
                        {game.team2Label}
                      </span>
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
      </CardContent>
    </Card>
  )
}
