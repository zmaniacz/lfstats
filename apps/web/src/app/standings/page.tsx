// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { getCompetitionRounds, getCompetitionUnassignedGamesForAdmin } from "@lfstats/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { RoundFilter } from "./RoundFilter";
import { StandingsContent } from "@/components/competitions/StandingsContent";
import { FinalsContent } from "@/components/competitions/FinalsContent";
import { StandingsSkeleton } from "@/components/competitions/StandingsSkeleton";
import { UnassignedGamesBlock } from "@/components/competitions/UnassignedGamesBlock";
import { StandingsTabs } from "./StandingsTabs";
import { resolveFilterContext } from "@/lib/filter-context";
import { auth } from "@/auth";

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; competition?: string; round?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const roundIdParam = sp.round;

  const ctx = await resolveFilterContext(sp, {
    allowedScopes: ["competition"],
    defaultScope: "competition",
  });

  if (ctx.competitions.length === 0 || !ctx.competition) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold">Standings</h2>
        <p className="text-muted-foreground text-sm">No competitive competitions found.</p>
      </div>
    );
  }

  const activeComp = ctx.competition;
  const activeId = activeComp.id;

  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const isAdmin = roles.some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );

  const [allRounds, unassignedGames] = await Promise.all([
    getCompetitionRounds(activeId),
    isAdmin ? getCompetitionUnassignedGamesForAdmin(activeId) : Promise.resolve([]),
  ]);
  const standingsRounds = allRounds
    .filter((r) => r.type === "pool" || r.type === "split-pool" || r.type === "wildcard")
    .sort((a, b) => a.roundNumber - b.roundNumber);
  const finalsRounds = allRounds
    .filter((r) => r.type === "finals")
    .sort((a, b) => a.roundNumber - b.roundNumber);

  const activeRound = standingsRounds.find((r) => r.id === roundIdParam) ?? null;
  const activeRoundId = activeRound?.id ?? null;
  const activeRoundType = activeRound?.type ?? null;

  const contentKey = [activeComp.slug, activeRoundId].join("|");
  const activeTab = sp.tab === "finals" && finalsRounds.length > 0 ? "finals" : "standings";

  return (
    <div className="p-6 space-y-6">
      {isAdmin && <UnassignedGamesBlock games={unassignedGames} />}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold">Standings</h2>
          {isAdmin && (
            <Link
              href={`/admin/competitions/${activeComp.slug}`}
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
          activeCompetitionSlug={activeComp.slug}
          centers={ctx.centers}
          competitions={ctx.competitions}
        />
      </div>

      <StandingsTabs
        defaultTab={activeTab}
        hasFinals={finalsRounds.length > 0}
        standingsContent={
          <>
            {standingsRounds.length > 1 && (
              <RoundFilter
                competitionSlug={activeComp.slug}
                rounds={standingsRounds.map((r) => ({ id: r.id, name: r.name }))}
                activeRoundId={activeRoundId}
              />
            )}

            <Suspense key={contentKey} fallback={<StandingsSkeleton />}>
              <StandingsContent
                activeId={activeId}
                activeRoundId={activeRoundId}
                activeRoundType={activeRoundType}
                competitionSlug={activeComp.slug}
                competitionName={activeComp.name}
              />
            </Suspense>
          </>
        }
        finalsContent={
          <Suspense fallback={<StandingsSkeleton />}>
            <FinalsContent
              activeId={activeId}
              competitionSlug={activeComp.slug}
              challongeLink={activeComp.challongeLink}
              challongeBracketHeight={activeComp.challongeBracketHeight}
            />
          </Suspense>
        }
      />
    </div>
  );
}
