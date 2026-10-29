// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { getLbCompetitionMatchResults, getLbGamesList } from "@lfstats/db";
import { LbMatchCardSections } from "@/components/competitions/LbMatchCardSections";
import { lbMatchSections } from "@/components/competitions/LbStandingsContent";
import { LaserballGamesTable } from "@/components/laserball/LaserballGamesTable";
import { toGameScopeFilter, type FilterContext } from "@/lib/filter-context";

export async function LaserballGamesContent({ ctx }: { ctx: FilterContext }) {
  if (ctx.scope === "competition" && ctx.competition) {
    return <LbCompetitionGames competitionId={ctx.competition.id} slug={ctx.competition.slug} />;
  }

  const filters = { scopeFilter: toGameScopeFilter(ctx) };
  const games = await getLbGamesList(filters);

  if (games.length === 0) {
    return <p className="text-muted-foreground text-sm">No laserball games found.</p>;
  }

  return (
    <div className="space-y-4">
      <LaserballGamesTable games={games} />
    </div>
  );
}

/**
 * One competition's games as its matches (both halves, by round), the counterpart of SM5's
 * match-aware competition table, then any of its games that fill no match yet.
 */
async function LbCompetitionGames({
  competitionId,
  slug,
}: {
  competitionId: string;
  slug: string;
}) {
  const [matches, games] = await Promise.all([
    getLbCompetitionMatchResults(competitionId),
    getLbGamesList({ scopeFilter: { scope: "competition", competitionId } }),
  ]);

  // A games list shows what was played: scheduled matches with no halves yet are left out.
  const played = matches.filter((m) => m.halves.length > 0);
  const inMatch = new Set(played.flatMap((m) => m.halves.map((h) => h.gameId)));
  const unassigned = games.filter((g) => !inMatch.has(g.id));

  if (played.length === 0 && unassigned.length === 0) {
    return <p className="text-muted-foreground text-sm">No games found for this competition.</p>;
  }

  return (
    <div className="space-y-8">
      <LbMatchCardSections sections={lbMatchSections(played)} competitionSlug={slug} />
      {unassigned.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Not in a Match</h3>
          <LaserballGamesTable games={unassigned} />
        </div>
      )}
    </div>
  );
}
