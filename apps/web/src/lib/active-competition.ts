// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { cookies } from "next/headers"
import { COMPETITION_COOKIE } from "@/app/competitions/standings/CompetitionSelector"

/**
 * Resolves which competition a competitions/* page should display:
 * explicit query param > last competition remembered via cookie > first available.
 */
export async function resolveActiveCompetition<T extends { slug: string }>(
  competitions: T[],
  competitionSlugParam: string | undefined,
): Promise<T> {
  if (competitionSlugParam) {
    const found = competitions.find((c) => c.slug === competitionSlugParam)
    if (found) return found
  }

  const cookieStore = await cookies()
  const rememberedSlug = cookieStore.get(COMPETITION_COOKIE)?.value
  if (rememberedSlug) {
    const found = competitions.find((c) => c.slug === rememberedSlug)
    if (found) return found
  }

  return competitions[0]
}
