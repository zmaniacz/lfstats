// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const COMPETITION_COOKIE = "lastCompetitionId"

export function CompetitionSelector({
  competitions,
  activeId,
  activeParamBase = "/competitions/standings",
}: {
  competitions: { id: string; name: string }[]
  activeId: string
  activeParamBase?: string
}) {
  const router = useRouter()

  function handleChange(id: string) {
    document.cookie = `${COMPETITION_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`
    router.push(`${activeParamBase}?competition=${id}`)
  }

  return (
    <Select
      value={activeId}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {competitions.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
