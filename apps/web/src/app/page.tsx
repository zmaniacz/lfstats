// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRecentSocialEvents,
  getCompetitionsByState,
  type CompetitionListItem,
} from "@lfstats/db";
import { formatDateOnly } from "@/lib/format";

function formatCompetitionDates(competition: CompetitionListItem): string {
  if (competition.endDate && competition.endDate !== competition.startDate) {
    return `${formatDateOnly(competition.startDate)} – ${formatDateOnly(competition.endDate)}`;
  }
  return formatDateOnly(competition.startDate);
}

function CompetitionListCard({
  title,
  competitions,
  emptyMessage,
}: {
  title: string;
  competitions: CompetitionListItem[];
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {competitions.length === 0 ? (
          <p className="text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="space-y-2">
            {competitions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <Link
                  href={`/standings?scope=competition&competition=${c.slug}`}
                  className="hover:underline"
                >
                  {c.name}
                </Link>
                <span className="text-muted-foreground">{formatCompetitionDates(c)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function Home() {
  const [recentSocialEvents, activeCompetitions, upcomingCompetitions, recentlyCompleted] =
    await Promise.all([
      getRecentSocialEvents(10),
      getCompetitionsByState(["active"]),
      getCompetitionsByState(["upcoming"]),
      getCompetitionsByState(["completed"], { order: "desc", limit: 5 }),
    ]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Welcome to LFstats</h1>
      <div className="grid grid-cols-1 max-w-2xl">
        <Card>
          <CardContent>
            <p className="mb-4">
              Over the next few weeks, you'll see this new version of the site more fully come to
              life. Any games uploaded to the current lfstats.com will appear here as well. I'm
              targeting end of June for the full launch, so we'll have time to work out any kinks
              prior to Internats.
            </p>
            <p className="mb-4">
              You'll note the stats here are limited to the TDF (~2020-present) era. Hammering TDF
              data into a system designed to read the old PDFs was no longer feasible. The current
              site will continue as a read-only version until I'm able to migrate the legacy data.
            </p>
            <p>
              For now, enjoy the new site and let me know on Discord what you like or hate. Any site
              admins, please login to the website with your Google account so we can get access set
              up.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Recent Social Events</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSocialEvents.length === 0 ? (
              <p className="text-muted-foreground">No social events yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentSocialEvents.map((event) => (
                  <li key={`${event.centerSlug}-${event.date}`}>
                    <Link
                      href={`/nightly?center=${event.centerSlug}&date=${event.date}`}
                      className="flex items-center justify-between gap-2 hover:underline"
                    >
                      <span>{event.centerName}</span>
                      <span className="text-muted-foreground">{formatDateOnly(event.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {activeCompetitions.length > 0 && (
            <CompetitionListCard title="Active Competitions" competitions={activeCompetitions} />
          )}
          {upcomingCompetitions.length > 0 && (
            <CompetitionListCard title="Upcoming" competitions={upcomingCompetitions} />
          )}
          <CompetitionListCard
            title="Recently Completed"
            competitions={recentlyCompleted}
            emptyMessage="No completed competitions yet."
          />
        </div>
      </div>
    </div>
  );
}
