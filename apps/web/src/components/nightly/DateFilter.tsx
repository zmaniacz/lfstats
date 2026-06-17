// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { useRouter, useSearchParams } from "next/navigation";

function parseDate(s: string): Date | undefined {
  const d = new Date(`${s}T00:00:00`);
  return isNaN(d.getTime()) ? undefined : d;
}

function formatDisplay(s: string): string {
  const d = parseDate(s);
  if (!d) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateFilter({
  selected,
  gameDates,
  basePath = "/nightly",
}: {
  selected: string;
  gameDates: string[];
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSelect(value: string | null) {
    if (!value) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", value);
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <Combobox value={selected} onValueChange={handleSelect}>
      <ComboboxInput className="w-full sm:w-[200px]" placeholder="Select date…" />
      <ComboboxEmpty>No dates found</ComboboxEmpty>
      <ComboboxContent>
        <ComboboxList>
          {gameDates.map((date) => (
            <ComboboxItem key={date} value={date}>
              {formatDisplay(date)}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
