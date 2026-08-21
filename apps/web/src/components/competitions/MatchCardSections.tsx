// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useMemo, useState } from "react";
import type { CompetitionMatchResult } from "@lfstats/db";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MatchCard } from "@/components/competitions/MatchCard";

export type MatchSection = {
  /** Stable key and heading for the group (a round name, or a pool name). */
  key: string;
  title: string;
  /** Round point multiplier; a badge is shown when it is anything other than 1. */
  multiplier?: number;
  matches: CompetitionMatchResult[];
};

function matchesQuery(match: CompetitionMatchResult, q: string): boolean {
  if (String(match.matchNumber).includes(q)) return true;
  const names = [match.team1Name, match.team2Name, match.team1ShortName, match.team2ShortName];
  return names.some((name) => name != null && name.toLowerCase().includes(q));
}

/**
 * The match cards for the round (or finals bracket) being viewed, grouped into sections and
 * filtered live by match number, team name, or team short name. Sections that lose every card
 * to the filter drop out entirely so the headings never sit over an empty grid.
 */
export function MatchCardSections({
  sections,
  competitionSlug,
}: {
  sections: MatchSection[];
  competitionSlug: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        matches: section.matches.filter((match) => matchesQuery(match, q)),
      }))
      .filter((section) => section.matches.length > 0);
  }, [sections, search]);

  const totalMatches = sections.reduce((sum, section) => sum + section.matches.length, 0);
  if (totalMatches === 0) return null;

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search matches…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches found.</p>
      ) : (
        filtered.map((section) => (
          <div key={section.key} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{section.title}</h3>
              {section.multiplier != null && section.multiplier !== 1 && (
                <Badge variant="outline">{section.multiplier}× points</Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.matches.map((match) => (
                <MatchCard key={match.matchId} match={match} competitionSlug={competitionSlug} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
