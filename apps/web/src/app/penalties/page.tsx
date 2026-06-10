// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { auth } from "@/auth";
import { getPenalties } from "@lfstats/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FilterBar } from "@/components/filters/FilterBar";
import { CompetitionPenaltyTable } from "./CompetitionPenaltyTable";
import {
  updateCompetitionPenaltyAction,
  rescindCompetitionPenaltyAction,
  deleteCompetitionPenaltyAction,
} from "./actions";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; center?: string; competition?: string }>;
}) {
  const sp = await searchParams;
  const [ctx, session] = await Promise.all([resolveFilterContext(sp), auth()]);

  const penalties = await getPenalties(toGameScopeFilter(ctx));

  const roles = session?.user?.roles ?? [];
  // Editing rewrites competition results, so only enable it for a specific competition.
  const canEdit =
    ctx.scope === "competition" &&
    ctx.competition !== null &&
    roles.some((r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin");

  const actions = {
    updateAction: updateCompetitionPenaltyAction,
    rescindAction: rescindCompetitionPenaltyAction,
    deleteAction: deleteCompetitionPenaltyAction,
  };

  const heading =
    ctx.scope === "competition" && ctx.competition
      ? ctx.competition.name
      : ctx.scope === "social" && ctx.center
        ? ctx.center.name
        : "All Penalties";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Penalties</h1>
        <FilterBar
          basePath="/penalties"
          scope={ctx.scope}
          activeCenterSlug={ctx.center?.slug ?? null}
          activeCompetitionSlug={ctx.competition?.slug ?? null}
          centers={ctx.centers}
          competitions={ctx.competitions}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {heading} · {penalties.length} {penalties.length === 1 ? "penalty" : "penalties"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompetitionPenaltyTable
            competitionId={ctx.competition?.id ?? ""}
            penalties={penalties}
            canEdit={canEdit}
            actions={actions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
