// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link"
import { getCenterList, getCenterPositionStats, getGlobalMvpComponents, getGlobalMvpBoxPlot } from "@lfstats/db"
import { MvpComponentsChart } from "@/components/centers/MvpComponentsChart"
import { MvpBoxPlotChart } from "@/components/centers/MvpBoxPlotChart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatScore, formatMVP } from "@/lib/format"
import { POSITIONS } from "@/lib/positions"

export default async function CentersPage() {
  const [centers, positionStats, mvpComponents, mvpBoxPlot] = await Promise.all([
    getCenterList(),
    getCenterPositionStats(),
    getGlobalMvpComponents(),
    getGlobalMvpBoxPlot(),
  ])

  const statsByPosition = new Map<number, typeof positionStats>()
  for (const stat of positionStats) {
    const list = statsByPosition.get(stat.position) ?? []
    list.push(stat)
    statsByPosition.set(stat.position, list)
  }

  for (const [, list] of statsByPosition) {
    list.sort((a, b) => b.avgMvp - a.avgMvp)
  }

  const positionEntries = ([1, 2, 3, 4, 5] as const)
    .map((pos) => ({ pos, stats: statsByPosition.get(pos) ?? [] }))
    .filter(({ stats }) => stats.length > 0)

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Centers</h1>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Center</TableHead>
              <TableHead className="text-right">Games</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {centers.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    href={`/centers/${c.slug}`}
                    className="hover:underline font-medium"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.gameCount.toLocaleString("en-US")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Position Comparison</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {positionEntries.map(({ pos, stats }) => (
            <Card key={pos}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {POSITIONS[pos].label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Center</TableHead>
                      <TableHead className="text-right">Avg MVP</TableHead>
                      <TableHead className="text-right">Avg Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((s) => (
                      <TableRow key={s.centerId}>
                        <TableCell>
                          <Link
                            href={`/centers/${s.centerSlug}`}
                            className="hover:underline"
                          >
                            {s.centerName}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMVP(s.avgMvp)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatScore(Math.round(s.avgScore))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>MVP Distribution by Position (All Centers)</CardTitle>
          </CardHeader>
          <CardContent>
            <MvpBoxPlotChart data={mvpBoxPlot} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average MVP Composition by Position (All Centers)</CardTitle>
          </CardHeader>
          <CardContent>
            <MvpComponentsChart data={mvpComponents} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
