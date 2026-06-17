// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { buildFilterUrl, type FilterUrlState } from "@/components/filters/filter-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

/**
 * Date-substring search for the games list. Preserves the active scope/center/
 * competition filters while updating (and resetting pagination on) the date.
 */
export function GamesDateFilter({
  basePath,
  state,
  date,
  extras,
}: {
  basePath: string;
  state: FilterUrlState;
  date: string;
  /** Extra params to preserve across a date search (e.g. game type). */
  extras?: Record<string, string | null | undefined>;
}) {
  const router = useRouter();

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = (e.currentTarget.elements.namedItem("date") as HTMLInputElement).value;
    router.push(buildFilterUrl(basePath, state, { ...extras, date: value || null }));
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <Input
        name="date"
        placeholder="Search date (e.g. 2026-06)"
        defaultValue={date}
        className="w-56"
      />
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  );
}
