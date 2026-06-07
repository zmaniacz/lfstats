// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link"
import {
  getCompetitiveCompetitions,
  getCompetitionStandings,
  getCompetitionMatchResults,
  getCompetitionRounds,
  getCompetitionTeams,
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
import { CompetitionSelector } from "./CompetitionSelector"
import { RoundFilter } from "./RoundFilter"
import { TeamLogo } from "@/components/teams/TeamLogo"
import { MatchCard } from "@/components/competitions/MatchCard"
import { resolveActiveCompetition } from "@/lib/active-competition"

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ competition?: string; round?: string }>
}) {
  const { competition: competitionSlug, round: roundIdParam } = await searchParams

  const competitions = await getCompetitiveCompetitions()

  if (competitions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Standings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    )
  }

  const activeComp = await resolveActiveCompetition(competitions, competitionSlug)
  const activeId = activeComp.id

  const allRounds = await getCompetitionRounds(activeId)
  const poolRounds = allRounds
    .filter((r) => r.type === "pool")
    .sort((a, b) => a.roundNumber - b.roundNumber)

  const activeRoundId = poolRounds.some((r) => r.id === roundIdParam) ? roundIdParam! : null

  const [standings, matchResults, teams] = await Promise.all([
    getCompetitionStandings(activeId, activeRoundId ?? undefined),
    getCompetitionMatchResults(activeId, activeRoundId ?? undefined),
    getCompetitionTeams(activeId),
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
        <CompetitionSelector competitions={competitions} activeSlug={activeComp.slug} />
      </div>

      {poolRounds.length > 1 && (
        <RoundFilter
          competitionSlug={activeComp.slug}
          rounds={poolRounds.map((r) => ({ id: r.id, name: r.name }))}
          activeRoundId={activeRoundId}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{activeComp.name}</CardTitle>
        </CardHeader>
        <CardContent>
          {standings.length === 0 ? (
            teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No teams have been added yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8 text-right">#</TableHead>
                    <TableHead>Team</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((team, i) => (
                    <TableRow key={team.id}>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <TeamLogo teamId={team.id} hasLogo={team.hasLogo} name={team.name} size={24} />
                          <Link href={`/competitions/${activeComp.slug}/teams/${team.slug}`} className="hover:underline">
                            {team.name}
                            {team.shortName && (
                              <span className="text-muted-foreground font-normal ml-1">({team.shortName})</span>
                            )}
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
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
                        <div className="flex items-center gap-2">
                          <TeamLogo teamId={row.teamId} hasLogo={row.teamHasLogo} name={row.teamName} size={24} />
                          <Link href={`/competitions/${activeComp.slug}/teams/${row.teamSlug}`} className="hover:underline">
                            {row.teamName}
                            {row.teamShortName && (
                              <span className="text-muted-foreground font-normal ml-1">({row.teamShortName})</span>
                            )}
                          </Link>
                        </div>
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
              <MatchCard key={match.matchId} match={match} competitionSlug={activeComp.slug} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
