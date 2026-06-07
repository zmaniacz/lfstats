// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { cookies } from "next/headers"
import { COMPETITION_COOKIE } from "@/app/competitions/standings/CompetitionSelector"

/**
 * Resolves which competition a competitions/* page should display:
 * explicit query param > last competition remembered via cookie > first available.
 */
export async function resolveActiveCompetitionId(
  competitions: { id: string }[],
  competitionIdParam: string | undefined,
): Promise<string> {
  if (competitionIdParam) return competitionIdParam

  const cookieStore = await cookies()
  const rememberedId = cookieStore.get(COMPETITION_COOKIE)?.value
  if (rememberedId && competitions.some((c) => c.id === rememberedId)) {
    return rememberedId
  }

  return competitions[0].id
}
