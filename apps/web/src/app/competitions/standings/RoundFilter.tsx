// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useRouter } from "next/navigation"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

export function RoundFilter({
  competitionSlug,
  rounds,
  activeRoundId,
}: {
  competitionSlug: string
  rounds: { id: string; name: string }[]
  activeRoundId: string | null
}) {
  const router = useRouter()
  const value = activeRoundId ?? "all"

  function handleChange(next: string) {
    if (!next) return
    const params = new URLSearchParams({ competition: competitionSlug })
    if (next !== "all") params.set("round", next)
    router.push(`/competitions/standings?${params.toString()}`)
  }

  return (
    <ToggleGroup type="single" value={value} onValueChange={handleChange} variant="outline">
      <ToggleGroupItem value="all">All</ToggleGroupItem>
      {rounds.map((r) => (
        <ToggleGroupItem key={r.id} value={r.id}>
          {r.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
