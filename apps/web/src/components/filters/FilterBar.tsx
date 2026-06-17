// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ALL_VALUE, type FilterGameType, type Scope } from "@/lib/filter-cookies";
import { buildFilterUrl, writeFilterCookies } from "./filter-url";

type Option = { slug: string; name: string };

export type FilterBarMode = "generic" | "competition-only" | "social-only";

export function FilterBar({
  basePath,
  mode = "generic",
  scope,
  activeCenterSlug,
  activeCompetitionSlug,
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
  centers: Option[];
  competitions: Option[];
  /** Page-specific params (e.g. pool/finals/mercs, date) to carry across changes. */
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

  function navigate(next: { scope: Scope; center: string | null; competition: string | null }) {
    router.push(buildFilterUrl(basePath, next, extras));
  }

  function handleScope(value: string) {
    if (value !== "social" && value !== "competition" && value !== "all") return;
    writeFilterCookies({ scope: value }, gameType);
    navigate({ scope: value, center: activeCenterSlug, competition: activeCompetitionSlug });
  }

  function handleCenter(value: string) {
    const center = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope: "social", center }, gameType);
    navigate({ scope: "social", center, competition: activeCompetitionSlug });
  }

  function handleCompetition(value: string) {
    const competition = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope: "competition", competition }, gameType);
    navigate({ scope: "competition", center: activeCenterSlug, competition });
  }

  const showScopeToggle = mode === "generic";
  const showCenterSelect = scope === "social" || mode === "social-only";
  const showCompetitionSelect = scope === "competition" || mode === "competition-only";
  const allowAllOption = mode === "generic";

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
        <Select value={activeCenterSlug ?? ALL_VALUE} onValueChange={handleCenter}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="Select a center…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Centers</SelectLabel>
              {allowAllOption && <SelectItem value={ALL_VALUE}>All Centers</SelectItem>}
              {centers.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      {showCompetitionSelect && (
        <Select value={activeCompetitionSlug ?? ALL_VALUE} onValueChange={handleCompetition}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select a competition…" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Competitions</SelectLabel>
              {allowAllOption && <SelectItem value={ALL_VALUE}>All Competitions</SelectItem>}
              {competitions.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}

      {children}
    </div>
  );
}
