// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { getBrowsableCompetitions, type BrowsableCompetition } from "@lfstats/db";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COMPETITION_STATE_LABELS, competitionStateBadgeVariant } from "@/lib/competition-state";
import {
  COMPETITION_CATEGORY_DESCRIPTIONS,
  COMPETITION_CATEGORY_LABELS,
  COMPETITION_CATEGORY_ORDER,
} from "@/lib/competition-category";
import { formatDateOnly } from "@/lib/format";

export const metadata: Metadata = { title: "Competitions" };

function formatDateRange(competition: BrowsableCompetition): string {
  if (competition.endDate && competition.endDate !== competition.startDate) {
    return `${formatDateOnly(competition.startDate)} – ${formatDateOnly(competition.endDate)}`;
  }
  return formatDateOnly(competition.startDate);
}

/**
 * The legacy migration filled `description` with the competition's own name on a couple of
 * events, which would render as a duplicate line under the name. Only show a description
 * that says something the name doesn't.
 */
function subtitle(competition: BrowsableCompetition): string | null {
  const description = competition.description?.trim();
  if (!description) return null;
  return description.toLowerCase() === competition.name.trim().toLowerCase() ? null : description;
}

/** "12 teams" / "34 players" — a team competition has no enrollments, and vice versa. */
function participantLabel(competition: BrowsableCompetition): string | null {
  if (competition.participantCount === 0) return null;
  const noun = competition.format === "solo" ? "player" : "team";
  return `${competition.participantCount} ${noun}${competition.participantCount === 1 ? "" : "s"}`;
}

function CompetitionTable({
  competitions,
  isAdmin,
}: {
  competitions: BrowsableCompetition[];
  isAdmin: boolean;
}) {
  return (
    <Table>
      {/* Each category renders its own table, so the columns are pinned to the same widths
          to keep the three sections aligned down the page. */}
      <TableHeader>
        <TableRow>
          <TableHead className="w-[34%]">Competition</TableHead>
          <TableHead className="w-[20%]">Dates</TableHead>
          <TableHead className="w-[16%]">Host Center</TableHead>
          <TableHead className="w-[12%]">Teams / Players</TableHead>
          <TableHead className="w-[8%] text-right">Games</TableHead>
          <TableHead className="w-[10%]">State</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {competitions.map((competition) => {
          const description = subtitle(competition);
          const participants = participantLabel(competition);

          return (
            <TableRow key={competition.id}>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/standings?scope=competition&competition=${competition.slug}`}
                    className="font-medium hover:underline"
                  >
                    {competition.name}
                  </Link>
                  {isAdmin && (
                    <Link
                      href={`/admin/competitions/${competition.slug}`}
                      className="text-muted-foreground hover:text-foreground"
                      title={`Manage ${competition.name}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Link>
                  )}
                  {competition.format === "solo" && <Badge variant="outline">Solo</Badge>}
                </div>
                {description && <p className="text-muted-foreground">{description}</p>}
              </TableCell>
              <TableCell className="whitespace-nowrap">{formatDateRange(competition)}</TableCell>
              <TableCell>{competition.hostCenterName ?? "Multiple centers"}</TableCell>
              {/* No enrollments yet on a migrated solo league, and no teams before the
                  roster is built — an em dash rather than a misleading "0". */}
              <TableCell className="whitespace-nowrap">{participants ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {competition.gameCount.toLocaleString("en-US")}
              </TableCell>
              <TableCell>
                <Badge variant={competitionStateBadgeVariant(competition.state)}>
                  {COMPETITION_STATE_LABELS[competition.state]}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default async function CompetitionsBrowsePage() {
  const [competitions, session] = await Promise.all([getBrowsableCompetitions(), auth()]);

  // Same three roles the admin section itself lets in, so a cog never leads somewhere the
  // viewer can't open. A centerAdmin sees a cog on every competition, matching the standings
  // page — the per-center check is enforced by the admin actions, not by hiding the link.
  const isAdmin = (session?.user?.roles ?? []).some(
    (r) => r.role === "superAdmin" || r.role === "admin" || r.role === "centerAdmin",
  );

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Competitions</h1>
        <p className="text-sm text-muted-foreground">
          Every competitive event on LFstats, newest first. Pick one to open its standings.
        </p>
      </div>

      {COMPETITION_CATEGORY_ORDER.map((category) => {
        const inCategory = competitions.filter((c) => c.category === category);

        return (
          <section key={category} className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{COMPETITION_CATEGORY_LABELS[category]}</h2>
              <p className="text-sm text-muted-foreground">
                {COMPETITION_CATEGORY_DESCRIPTIONS[category]}
              </p>
            </div>

            {inCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : (
              <CompetitionTable competitions={inCategory} isAdmin={isAdmin} />
            )}
          </section>
        );
      })}
    </div>
  );
}
