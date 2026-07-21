// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import { Suspense } from "react";
import { DateFilter } from "@/components/nightly/DateFilter";
import { FilterBar } from "@/components/filters/FilterBar";
import { ResetFilterCookies } from "@/components/filters/ResetFilterCookies";
import { NightlyLbContent } from "@/components/laserball/NightlyLbContent";
import { NightlySkeleton } from "@/components/nightly/NightlySkeleton";
import {
  getCenterBySlug,
  getCenterList,
  getLbGameDatesForCenter,
  getMostRecentLbCenterSlug,
} from "@lfstats/db";
import { filterCookieNames } from "@/lib/filter-cookies";
import { cookies } from "next/headers";

const { center: CENTER_COOKIE } = filterCookieNames("lb");

export const metadata: Metadata = { title: "Nightly Laserball" };

export default async function NightlyLbPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; date?: string }>;
}) {
  const { center: centerSlugParam, date } = await searchParams;
  const today = new Date().toISOString().split("T")[0];

  const [centers, cookieStore] = await Promise.all([getCenterList(), cookies()]);

  // Resolve center: explicit param > lb center cookie > most recent lb center.
  const cookieCenter = cookieStore.get(CENTER_COOKIE)?.value;
  let centerSlug = centerSlugParam;
  if (!centerSlug && cookieCenter && cookieCenter !== "all") {
    if (centers.some((c) => c.slug === cookieCenter)) centerSlug = cookieCenter;
  }
  if (!centerSlug) {
    centerSlug = (await getMostRecentLbCenterSlug()) ?? undefined;
  }

  const filterBar = (activeCenterSlug: string | null) => (
    <FilterBar
      basePath="/nightly-lb"
      mode="social-only"
      scope="social"
      activeCenterSlug={activeCenterSlug}
      activeCompetitionSlug={null}
      centers={centers}
      competitions={[]}
      gameType="lb"
    />
  );

  if (!centerSlug) {
    return (
      <>
        <ResetFilterCookies scope="social" gameType="lb" />
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold">Nightly Laserball</h1>
            <div className="flex items-center gap-2">{filterBar(null)}</div>
          </div>
          <p className="text-muted-foreground">No game data available.</p>
        </div>
      </>
    );
  }

  const center = await getCenterBySlug(centerSlug);
  if (!center) {
    return (
      <>
        <ResetFilterCookies scope="social" gameType="lb" />
        <div className="p-6 space-y-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold">Nightly Laserball</h1>
            <div className="flex items-center gap-2">{filterBar(null)}</div>
          </div>
          <p className="text-muted-foreground">Center not found.</p>
        </div>
      </>
    );
  }

  const gameDates = await getLbGameDatesForCenter(center.id);
  const selectedDate = date ?? gameDates[0] ?? today;
  const contentKey = [centerSlug, selectedDate].join("|");

  return (
    <>
      <ResetFilterCookies scope="social" gameType="lb" />
      <div className="p-6 space-y-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold">Nightly Laserball</h1>
          <div className="flex items-center gap-2">
            <FilterBar
              basePath="/nightly-lb"
              mode="social-only"
              scope="social"
              activeCenterSlug={centerSlug}
              activeCompetitionSlug={null}
              centers={centers}
              competitions={[]}
              gameType="lb"
            >
              <DateFilter selected={selectedDate} gameDates={gameDates} basePath="/nightly-lb" />
            </FilterBar>
          </div>
        </div>

        <Suspense key={contentKey} fallback={<NightlySkeleton />}>
          <NightlyLbContent centerId={center.id} selectedDate={selectedDate} />
        </Suspense>
      </div>
    </>
  );
}
