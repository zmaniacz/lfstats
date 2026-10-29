// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateOnly } from "@/lib/format";
import {
  getCompetitionsByState,
  getRecentSocialEvents,
  getRecentSocialLbEvents,
  type CompetitionListItem,
} from "@lfstats/db";
import Link from "next/link";

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
  const [
    recentSocialEvents,
    recentLbEvents,
    activeCompetitions,
    upcomingCompetitions,
    recentlyCompleted,
  ] = await Promise.all([
    getRecentSocialEvents(10),
    getRecentSocialLbEvents(10),
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
              <b>October 2026 Updates</b>
              <ul>
                <li>
                  Big Laserball Update: Player aggregate stats, center stats, player detail pages,
                  game details including momentum graphs. provide feedback or ask for new stuff on
                  Discord
                </li>
                <li>Syracuse Laserball 2026 Tournament added</li>
                <li>
                  Legacy Site Migration: All data from the pre-TDF era (2020 and earlier) has been
                  migrated to this site and the legacy site is officially offline. Let me know if
                  see any weirdness or errors in the legacy data.
                </li>
              </ul>
            </p>
            <p className="mb-4">
              <b>Need access to upload stats?</b> Login with a Google account and let me know on{" "}
              <a
                href="https://discord.com/channels/1345551651238576189/1378169370144149504"
                className="underline"
              >
                the Discord
              </a>
              , Facebook Messenger, Text, or pigeon.
            </p>
            <p className="mb-4">
              <b>Interested in automated uploads?</b> Now available via Google Drive - requires
              installing on the local LaserForce computer at your site.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Recent SM5 Social Events</CardTitle>
          </CardHeader>
          <CardContent>
            {recentSocialEvents.length === 0 ? (
              <p className="text-muted-foreground">No SM5 social events yet.</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Recent Laserball Social Events</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLbEvents.length === 0 ? (
              <p className="text-muted-foreground">No Laserball social events yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentLbEvents.map((event) => (
                  <li key={`lb-${event.centerSlug}-${event.date}`}>
                    <Link
                      href={`/nightly-lb?center=${event.centerSlug}&date=${event.date}`}
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
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
  );
}
