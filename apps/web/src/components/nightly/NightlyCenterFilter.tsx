"use client"

import { useRouter } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CenterListItem } from "@lfstats/db"

export function NightlyCenterFilter({
  centers,
  selected,
}: {
  centers: CenterListItem[]
  selected?: string
}) {
  const router = useRouter()

  function handleChange(value: string) {
    router.push(`/nightly?center=${value}`)
  }

  return (
    <Select value={selected ?? ""} onValueChange={handleChange}>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="Select a center…" />
      </SelectTrigger>
      <SelectContent>
        {centers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
