// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import { DateFilter } from "@/components/nightly/DateFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { NightlyStateManager } from "@/components/nightly/NightlyStateManager";
import { NightlyContent } from "@/components/nightly/NightlyContent";
import { NightlySkeleton } from "@/components/nightly/NightlySkeleton";
import {
  getCenterBySlug,
  getCenterList,
  getGameDatesForCenter,
  getMostRecentSocialCenterSlug,
} from "@lfstats/db";
import { CENTER_COOKIE } from "@/lib/filter-cookies";
import { cookies } from "next/headers";

export default async function NightlyPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; date?: string }>;
}) {
  const { center: centerSlugParam, date } = await searchParams;
  const today = new Date().toISOString().split("T")[0];

  const [centers, cookieStore] = await Promise.all([getCenterList(), cookies()]);

  // Resolve center: explicit param > remembered cookie > most recent social center.
  const cookieCenter = cookieStore.get(CENTER_COOKIE)?.value;
  let centerSlug = centerSlugParam;
  if (!centerSlug && cookieCenter && cookieCenter !== "all") {
    if (centers.some((c) => c.slug === cookieCenter)) centerSlug = cookieCenter;
  }
  if (!centerSlug) {
    centerSlug = (await getMostRecentSocialCenterSlug()) ?? undefined;
  }

  if (!centerSlug) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Nightly Stats</h1>
          <div className="flex items-center gap-2">
            <FilterBar
              basePath="/nightly"
              mode="social-only"
              scope="social"
              activeCenterSlug={null}
              activeCompetitionSlug={null}
              centers={centers}
              competitions={[]}
            />
          </div>
        </div>
        <p className="text-muted-foreground">No game data available.</p>
      </div>
    );
  }

  const center = await getCenterBySlug(centerSlug);
  if (!center) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Nightly Stats</h1>
          <div className="flex items-center gap-2">
            <FilterBar
              basePath="/nightly"
              mode="social-only"
              scope="social"
              activeCenterSlug={null}
              activeCompetitionSlug={null}
              centers={centers}
              competitions={[]}
            />
          </div>
        </div>
        <p className="text-muted-foreground">Center not found.</p>
      </div>
    );
  }

  const gameDates = await getGameDatesForCenter(center.id);
  const selectedDate = date ?? gameDates[0] ?? today;

  const contentKey = [centerSlug, selectedDate].join("|");

  return (
    <>
      <NightlyStateManager center={centerSlug} date={selectedDate} />
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Nightly Stats</h1>
          <div className="flex items-center gap-2">
            <FilterBar
              basePath="/nightly"
              mode="social-only"
              scope="social"
              activeCenterSlug={centerSlug}
              activeCompetitionSlug={null}
              centers={centers}
              competitions={[]}
            >
              <DateFilter selected={selectedDate} gameDates={gameDates} />
            </FilterBar>
          </div>
        </div>

        <Suspense key={contentKey} fallback={<NightlySkeleton />}>
          <NightlyContent centerId={center.id} selectedDate={selectedDate} />
        </Suspense>
      </div>
    </>
  );
}
