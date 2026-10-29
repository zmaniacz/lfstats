// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ALL_VALUE, type FilterGameType, type Scope } from "@/lib/filter-cookies";
import { EntityCombobox } from "./EntityCombobox";
import { centerGroups, competitionGroups } from "./entity-options";
import { buildFilterUrl, writeFilterCookies } from "./filter-url";

type Option = { slug: string; name: string; gameCount?: number };
// A competition says which game it is for, so a mixed list (standings) can label Laserball ones;
// its state and start date group the picker into Active / Upcoming / past years.
type CompetitionOption = Option & {
  gameType?: "sm5" | "lb";
  state?: "preshow" | "upcoming" | "active" | "completed";
  startDate?: string;
};

export type FilterBarMode = "generic" | "competition-only" | "social-only" | "center-detail";

export function FilterBar({
  basePath,
  mode = "generic",
  scope,
  activeCenterSlug,
  activeCompetitionSlug,
  activeDateFrom = null,
  activeDateTo = null,
  centers,
  competitions,
  extras,
  gameType = "sm5",
  children,
}: {
  basePath: string;
  mode?: FilterBarMode;
  scope: Scope;
  activeCenterSlug: string | null;
  activeCompetitionSlug: string | null;
  /** Date range (YYYY-MM-DD). Only rendered/applied for social/all scope. */
  activeDateFrom?: string | null;
  activeDateTo?: string | null;
  centers: Option[];
  competitions: CompetitionOption[];
  /** Page-specific params (e.g. pool/finals/mercs) to carry across changes. */
  extras?: Record<string, string | null | undefined>;
  /**
   * Which game type's cookie set to persist filter choices into. Game types are
   * displayed separately and keep independent filter state. Defaults to "sm5".
   */
  gameType?: FilterGameType;
  /** Page-specific controls rendered inline next to the selectors. */
  children?: React.ReactNode;
}) {
  const router = useRouter();

  function navigate(next: {
    scope: Scope;
    center: string | null;
    competition: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) {
    router.push(buildFilterUrl(basePath, next, extras));
  }

  function handleScope(value: string) {
    if (value !== "social" && value !== "competition" && value !== "all") return;
    writeFilterCookies({ scope: value }, gameType);
    navigate({
      scope: value,
      center: activeCenterSlug,
      competition: activeCompetitionSlug,
      dateFrom: activeDateFrom,
      dateTo: activeDateTo,
    });
  }

  function handleCenter(value: string) {
    const center = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope, center }, gameType);
    navigate({
      scope,
      center,
      competition: activeCompetitionSlug,
      dateFrom: activeDateFrom,
      dateTo: activeDateTo,
    });
  }

  function handleCompetition(value: string) {
    const competition = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope: "competition", competition }, gameType);
    navigate({ scope: "competition", center: activeCenterSlug, competition });
  }

  function handleDateFrom(e: React.ChangeEvent<HTMLInputElement>) {
    const dateFrom = e.target.value || null;
    writeFilterCookies({ scope, dateFrom }, gameType);
    navigate({
      scope,
      center: activeCenterSlug,
      competition: activeCompetitionSlug,
      dateFrom,
      dateTo: activeDateTo,
    });
  }

  function handleDateTo(e: React.ChangeEvent<HTMLInputElement>) {
    const dateTo = e.target.value || null;
    writeFilterCookies({ scope, dateTo }, gameType);
    navigate({
      scope,
      center: activeCenterSlug,
      competition: activeCompetitionSlug,
      dateFrom: activeDateFrom,
      dateTo,
    });
  }

  const showScopeToggle = mode === "generic" || mode === "center-detail";
  const showCenterSelect =
    mode === "social-only" || (mode === "generic" && scope !== "competition");
  const mixedGameTypes = new Set(competitions.map((c) => c.gameType)).size > 1;
  const showCompetitionSelect = scope === "competition" || mode === "competition-only";
  const showDateRange = (mode === "generic" || mode === "center-detail") && scope !== "competition";
  const allowAllOption = mode === "generic" || mode === "center-detail";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {showScopeToggle && (
        <ToggleGroup
          type="single"
          value={scope}
          onValueChange={handleScope}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="social">Social</ToggleGroupItem>
          <ToggleGroupItem value="competition">Competition</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      )}

      {showCenterSelect && (
        <EntityCombobox
          groups={centerGroups(centers, {
            all: allowAllOption ? { value: ALL_VALUE, label: "All Centers" } : null,
          })}
          value={activeCenterSlug ?? (allowAllOption ? ALL_VALUE : null)}
          onValueChange={handleCenter}
          placeholder="Search centers…"
          emptyText="No centers found"
          aria-label="Center"
          className="w-full sm:w-[240px]"
        />
      )}

      {showCompetitionSelect && (
        <EntityCombobox
          groups={competitionGroups(competitions, {
            all: allowAllOption ? { value: ALL_VALUE, label: "All Competitions" } : null,
            // Only a list mixing both game types (standings) needs to say which is which.
            labelLaserball: mixedGameTypes,
          })}
          value={activeCompetitionSlug ?? (allowAllOption ? ALL_VALUE : null)}
          onValueChange={handleCompetition}
          placeholder="Search competitions…"
          emptyText="No competitions found"
          aria-label="Competition"
          className="w-full sm:w-72"
        />
      )}

      {showDateRange && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={activeDateFrom ?? ""}
            onChange={handleDateFrom}
            max={activeDateTo ?? undefined}
            className="w-36"
            aria-label="From date"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <Input
            type="date"
            value={activeDateTo ?? ""}
            onChange={handleDateTo}
            min={activeDateFrom ?? undefined}
            className="w-36"
            aria-label="To date"
          />
        </div>
      )}

      {children}
    </div>
  );
}
