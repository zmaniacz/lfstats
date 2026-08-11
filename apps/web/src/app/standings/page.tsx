// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import {
  getCompetitionRounds,
  getCompetitionUnassignedGamesForAdmin,
  getSoloCompetitionUnenrolledPlayers,
} from "@lfstats/db";
import { RoundFilter } from "./RoundFilter";
import { StandingsContent } from "@/components/competitions/StandingsContent";
import { SoloStandingsContent } from "@/components/competitions/SoloStandingsContent";
import { FinalsContent } from "@/components/competitions/FinalsContent";
import { StandingsHeader } from "@/components/competitions/StandingsHeader";
import { StandingsSkeleton } from "@/components/competitions/StandingsSkeleton";
import { UnassignedGamesBlock } from "@/components/competitions/UnassignedGamesBlock";
import { UnenrolledPlayersBlock } from "@/components/competitions/UnenrolledPlayersBlock";
import { StandingsTabs } from "./StandingsTabs";
import { resolveFilterContext } from "@/lib/filter-context";
import {
  enrollAllSoloPlayersAction,
  enrollSoloPlayerAction,
} from "@/app/admin/competitions/[slug]/players/actions";
import { auth } from "@/auth";

export const metadata: Metadata = { title: "Standings" };

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

  // A solo competition has no rounds, matches or finals, so none of the tab/round
  // machinery below applies — `?round` and `?tab` are simply inert. In place of the
  // unassigned-games block (every game counts, so none are ever unassigned) it shows the
  // players who have games here but have not been enrolled.
  if (activeComp.format === "solo") {
    const unenrolled = isAdmin ? await getSoloCompetitionUnenrolledPlayers(activeId) : [];

    return (
      <div className="p-6 space-y-6">
        {isAdmin && (
          <UnenrolledPlayersBlock
            players={unenrolled}
            enrollAction={enrollSoloPlayerAction.bind(null, activeId)}
            enrollAllAction={enrollAllSoloPlayersAction.bind(null, activeId)}
          />
        )}
        <StandingsHeader ctx={ctx} competitionSlug={activeComp.slug} isAdmin={isAdmin} />

        <Suspense key={activeComp.slug} fallback={<StandingsSkeleton />}>
          <SoloStandingsContent activeId={activeId} competitionName={activeComp.name} />
        </Suspense>
      </div>
    );
  }

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
      <StandingsHeader ctx={ctx} competitionSlug={activeComp.slug} isAdmin={isAdmin} />

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
