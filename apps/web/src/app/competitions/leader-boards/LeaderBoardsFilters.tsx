// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useRouter } from "next/navigation"
import { Toggle } from "@/components/ui/toggle"

export function LeaderBoardsFilters({
  showPool,
  showFinals,
  showMercs,
  competitionSlug,
}: {
  showPool: boolean
  showFinals: boolean
  showMercs: boolean
  competitionSlug: string
}) {
  const router = useRouter()

  function update(patch: Partial<{ showPool: boolean; showFinals: boolean; showMercs: boolean }>) {
    const params = new URLSearchParams()
    params.set("competition", competitionSlug)
    const next = { showPool, showFinals, showMercs, ...patch }
    if (!next.showPool) params.set("pool", "0")
    if (next.showFinals) params.set("finals", "1")
    if (next.showMercs) params.set("mercs", "1")
    router.push(`/competitions/leader-boards?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Toggle
        pressed={showPool}
        onPressedChange={(v) => update({ showPool: v })}
        variant="outline"
        size="sm"
      >
        Show Rounds
      </Toggle>
      <Toggle
        pressed={showFinals}
        onPressedChange={(v) => update({ showFinals: v })}
        variant="outline"
        size="sm"
      >
        Show Finals
      </Toggle>
      <Toggle
        pressed={showMercs}
        onPressedChange={(v) => update({ showMercs: v })}
        variant="outline"
        size="sm"
      >
        Show Mercs
      </Toggle>
    </div>
  )
}
