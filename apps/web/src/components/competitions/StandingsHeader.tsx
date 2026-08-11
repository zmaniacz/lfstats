// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Settings } from "lucide-react";
import { FilterBar } from "@/components/filters/FilterBar";
import type { FilterContext } from "@/lib/filter-context";

/** Title, admin cog, and competition picker. Shared by the team and solo standings views. */
export function StandingsHeader({
  ctx,
  competitionSlug,
  isAdmin,
}: {
  ctx: FilterContext;
  competitionSlug: string;
  isAdmin: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold">Standings</h2>
        {isAdmin && (
          <Link
            href={`/admin/competitions/${competitionSlug}`}
            className="text-muted-foreground hover:text-foreground"
            title="Manage competition"
          >
            <Settings className="h-4 w-4" />
          </Link>
        )}
      </div>
      <FilterBar
        basePath="/standings"
        mode="competition-only"
        scope="competition"
        activeCenterSlug={null}
        activeCompetitionSlug={competitionSlug}
        centers={ctx.centers}
        competitions={ctx.competitions}
      />
    </div>
  );
}
