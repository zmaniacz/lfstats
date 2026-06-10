// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useRouter } from "next/navigation";
import { Toggle } from "@/components/ui/toggle";
import { buildFilterUrl } from "./filter-url";

/**
 * Pool / Finals / Mercs toggles for competition-scope pages. Consolidates the
 * previously duplicated TopPlayersFilters / LeaderBoardsFilters / AllStarFilters.
 * Only meaningful when a specific competition is selected.
 */
export function ScopeExtraToggles({
  basePath,
  competitionSlug,
  showPool,
  showFinals,
  showMercs,
}: {
  basePath: string;
  competitionSlug: string;
  showPool: boolean;
  showFinals: boolean;
  showMercs: boolean;
}) {
  const router = useRouter();

  function update(patch: Partial<{ showPool: boolean; showFinals: boolean; showMercs: boolean }>) {
    const next = { showPool, showFinals, showMercs, ...patch };
    router.push(
      buildFilterUrl(
        basePath,
        { scope: "competition", center: null, competition: competitionSlug },
        {
          pool: next.showPool ? null : "0",
          finals: next.showFinals ? "1" : null,
          mercs: next.showMercs ? "1" : null,
        },
      ),
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Toggle
        pressed={showPool}
        onPressedChange={(v) => update({ showPool: v })}
        variant="outline"
        size="sm"
      >
        Show Rounds
      </Toggle>
      <Toggle
        pressed={showFinals}
        onPressedChange={(v) => update({ showFinals: v })}
        variant="outline"
        size="sm"
      >
        Show Finals
      </Toggle>
      <Toggle
        pressed={showMercs}
        onPressedChange={(v) => update({ showMercs: v })}
        variant="outline"
        size="sm"
      >
        Show Mercs
      </Toggle>
    </div>
  );
}
