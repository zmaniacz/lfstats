"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CenterListItem } from "@lfstats/db";
import { useRouter } from "next/navigation";

export function NightlyCenterFilter({
  centers,
  selected,
}: {
  centers: CenterListItem[];
  selected?: string;
}) {
  const router = useRouter();

  function handleChange(value: string) {
    router.push(`/nightly?center=${value}`);
  }

  return (
    <Select value={selected ?? ""} onValueChange={handleChange}>
      <SelectTrigger className="w-full sm:w-[240px]">
        <SelectValue placeholder="Select a center…" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Centers</SelectLabel>
          {centers.map((c) => (
            <SelectItem key={c.id} value={c.slug}>
              {c.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
