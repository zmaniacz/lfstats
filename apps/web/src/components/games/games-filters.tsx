// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Center = { id: string; name: string };

export function GamesFilters({
  centers,
  centerId,
  dateSearch,
}: {
  centers: Center[];
  centerId: string;
  dateSearch: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("page");
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      router.push(`/games?${params.toString()}`);
    },
    [router, searchParams],
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const date = (form.elements.namedItem("date") as HTMLInputElement).value;
    updateParams({ date });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <Select
        value={centerId || "all"}
        onValueChange={(val) => updateParams({ center: val === "all" ? "" : val })}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All centers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All centers</SelectItem>
          {centers.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        name="date"
        placeholder="Search date (e.g. 2026-06)"
        defaultValue={dateSearch}
        className="w-56"
      />
      <Button type="submit" variant="outline" size="sm">
        Search
      </Button>
    </form>
  );
}
