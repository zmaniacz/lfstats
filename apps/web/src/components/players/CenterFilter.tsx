"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CenterListItem } from "@lfstats/db"

export function CenterFilter({
  centers,
  selected,
}: {
  centers: CenterListItem[]
  selected?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete("center")
    } else {
      params.set("center", value)
    }
    const query = params.toString()
    router.push(`/players${query ? `?${query}` : ""}`)
  }

  return (
    <Select value={selected ?? "all"} onValueChange={handleChange}>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="All Centers" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Centers</SelectItem>
        {centers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
