// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildFilterUrl, type FilterUrlState } from "@/components/filters/filter-url";

/**
 * Date-substring search for the games list. Preserves the active scope/center/
 * competition filters while updating (and resetting pagination on) the date.
 */
export function GamesDateFilter({
  basePath,
  state,
  date,
}: {
  basePath: string;
  state: FilterUrlState;
  date: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = (e.currentTarget.elements.namedItem("date") as HTMLInputElement).value;
    startTransition(() => {
      router.push(buildFilterUrl(basePath, state, { date: value || null }));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <Input
        name="date"
        placeholder="Search date (e.g. 2026-06)"
        defaultValue={date}
        disabled={isPending}
        className="w-56"
      />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : "Search"}
      </Button>
    </form>
  );
}
