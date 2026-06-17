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
import { ALL_VALUE, type Scope } from "@/lib/filter-cookies";
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
  persistCookies = true,
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
   * Persist filter choices to shared cookies so other pages inherit them.
   * Set false for game types displayed separately (e.g. Laserball) so their
   * selections don't leak into SM5's remembered filters. Defaults to true.
   */
  persistCookies?: boolean;
  /** Page-specific controls rendered inline next to the selectors. */
  children?: React.ReactNode;
}) {
  const router = useRouter();

  function navigate(next: { scope: Scope; center: string | null; competition: string | null }) {
    router.push(buildFilterUrl(basePath, next, extras));
  }

  function handleScope(value: string) {
    if (value !== "social" && value !== "competition" && value !== "all") return;
    if (persistCookies) writeFilterCookies({ scope: value });
    navigate({ scope: value, center: activeCenterSlug, competition: activeCompetitionSlug });
  }

  function handleCenter(value: string) {
    const center = value === ALL_VALUE ? null : value;
    if (persistCookies) writeFilterCookies({ scope: "social", center });
    navigate({ scope: "social", center, competition: activeCompetitionSlug });
  }

  function handleCompetition(value: string) {
    const competition = value === ALL_VALUE ? null : value;
    if (persistCookies) writeFilterCookies({ scope: "competition", competition });
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
