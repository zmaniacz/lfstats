// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { auth } from "@/auth";
import { FilterBar } from "@/components/filters/FilterBar";
import { PenaltiesContent } from "./PenaltiesContent";
import { PenaltiesSkeleton } from "./PenaltiesSkeleton";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";

export default async function PenaltiesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; center?: string; competition?: string }>;
}) {
  const sp = await searchParams;
  const [ctx, session] = await Promise.all([resolveFilterContext(sp), auth()]);

  const roles = session?.user?.roles ?? [];
  // Editing rewrites competition results, so only enable it for a specific competition.
  const canEdit =
    ctx.scope === "competition" &&
    ctx.competition !== null &&
    roles.some((r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin");

  const heading =
    ctx.scope === "competition" && ctx.competition
      ? ctx.competition.name
      : ctx.scope === "social" && ctx.center
        ? ctx.center.name
        : "All Penalties";

  const contentKey = [ctx.scope, ctx.center?.slug ?? null, ctx.competition?.slug ?? null].join("|");

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

      <Suspense key={contentKey} fallback={<PenaltiesSkeleton />}>
        <PenaltiesContent
          scopeFilter={toGameScopeFilter(ctx)}
          competitionId={ctx.competition?.id ?? ""}
          canEdit={canEdit}
          heading={heading}
        />
      </Suspense>
    </div>
  );
}
