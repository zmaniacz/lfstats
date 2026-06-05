// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { notFound } from "next/navigation"
import {
  getCenterBySlug,
  getCenterGameCount,
  getCenterWinsByColor,
  getCenterMvpBoxPlot,
  getCenterMvpComponents,
} from "@lfstats/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { WinsByColorChart } from "@/components/centers/WinsByColorChart"
import { MvpBoxPlotChart } from "@/components/centers/MvpBoxPlotChart"
import { MvpComponentsChart } from "@/components/centers/MvpComponentsChart"

export default async function CenterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const centerDetail = await getCenterBySlug(slug)
  if (!centerDetail) notFound()

  const [gameCount, winsByColor, mvpBoxPlot, mvpComponents] =
    await Promise.all([
      getCenterGameCount(centerDetail.id),
      getCenterWinsByColor(centerDetail.id),
      getCenterMvpBoxPlot(centerDetail.id),
      getCenterMvpComponents(centerDetail.id),
    ])

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{centerDetail.name}</h1>
        <div className="text-sm text-muted-foreground space-y-0.5">
          {centerDetail.city && (
            <p>
              {centerDetail.city}
              {centerDetail.countryName ? `, ${centerDetail.countryName}` : ""}
            </p>
          )}
          <p>{gameCount.toLocaleString("en-US")} games</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Wins by Team Color</CardTitle>
          </CardHeader>
          <CardContent>
            <WinsByColorChart data={winsByColor} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>MVP Distribution by Position</CardTitle>
          </CardHeader>
          <CardContent>
            <MvpBoxPlotChart data={mvpBoxPlot} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Average MVP Composition by Position</CardTitle>
        </CardHeader>
        <CardContent>
          <MvpComponentsChart data={mvpComponents} />
        </CardContent>
      </Card>
    </div>
  )
}
