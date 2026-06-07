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

export const COMPETITION_COOKIE = "lastCompetitionSlug"

export function CompetitionSelector({
  competitions,
  activeSlug,
  activeParamBase = "/competitions/standings",
}: {
  competitions: { slug: string; name: string }[]
  activeSlug: string
  activeParamBase?: string
}) {
  const router = useRouter()

  function handleChange(slug: string) {
    document.cookie = `${COMPETITION_COOKIE}=${slug}; path=/; max-age=31536000; samesite=lax`
    router.push(`${activeParamBase}?competition=${slug}`)
  }

  return (
    <Select
      value={activeSlug}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {competitions.map((c) => (
          <SelectItem key={c.slug} value={c.slug}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
