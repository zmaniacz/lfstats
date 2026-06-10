// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
  /** Page-specific controls rendered inline next to the selectors. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(next: { scope: Scope; center: string | null; competition: string | null }) {
    startTransition(() => {
      router.push(buildFilterUrl(basePath, next, extras));
    });
  }

  function handleScope(value: string) {
    if (value !== "social" && value !== "competition" && value !== "all") return;
    writeFilterCookies({ scope: value });
    navigate({ scope: value, center: activeCenterSlug, competition: activeCompetitionSlug });
  }

  function handleCenter(value: string) {
    const center = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope: "social", center });
    navigate({ scope: "social", center, competition: activeCompetitionSlug });
  }

  function handleCompetition(value: string) {
    const competition = value === ALL_VALUE ? null : value;
    writeFilterCookies({ scope: "competition", competition });
    navigate({ scope: "competition", center: activeCenterSlug, competition });
  }

  const showScopeToggle = mode === "generic";
  const showCenterSelect = scope === "social" || mode === "social-only";
  const showCompetitionSelect = scope === "competition" || mode === "competition-only";
  const allowAllOption = mode === "generic";

  return (
    <div
      aria-busy={isPending}
      className={`flex items-center gap-2 flex-wrap transition-opacity ${
        isPending ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
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
