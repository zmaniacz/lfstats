// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { Suspense } from "react";
import Link from "next/link";
import { getCenterList } from "@lfstats/db";
import { FilterBar } from "@/components/filters/FilterBar";
import { GameTypeToggle } from "@/components/filters/GameTypeToggle";
import { LaserballStub } from "@/components/laserball/LaserballStub";
import { resolveFilterContext, toGameScopeFilter } from "@/lib/filter-context";
import { CentersContent } from "@/components/centers/CentersContent";
import { CentersSkeleton } from "@/components/centers/CentersSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function CentersPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; center?: string; competition?: string; game?: string }>;
}) {
  const sp = await searchParams;
  const gameType: "sm5" | "lb" = sp.game === "lb" ? "lb" : "sm5";
  const ctx = await resolveFilterContext(sp, { gameType });
  const scopeFilter = toGameScopeFilter(ctx);

  const centers = await getCenterList();

  const contentKey = [
    gameType,
    ctx.scope,
    ctx.center?.slug ?? null,
    ctx.competition?.slug ?? null,
  ].join("|");

  return (
    <div className="p-6 space-y-8">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Centers</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <GameTypeToggle active={gameType} />
          <FilterBar
            basePath="/centers"
            gameType={gameType}
            scope={ctx.scope}
            activeCenterSlug={ctx.center?.slug ?? null}
            activeCompetitionSlug={ctx.competition?.slug ?? null}
            centers={ctx.centers}
            competitions={ctx.competitions}
            extras={{ game: gameType === "lb" ? "lb" : null }}
          />
        </div>
      </div>

      {gameType === "lb" ? (
        <LaserballStub feature="center stats" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Center</TableHead>
                <TableHead className="text-right">Games</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {centers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/centers/${c.slug}`} className="hover:underline font-medium">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.gameCount.toLocaleString("en-US")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Suspense key={contentKey} fallback={<CentersSkeleton />}>
            <CentersContent scopeFilter={scopeFilter} />
          </Suspense>
        </>
      )}
    </div>
  );
}
