"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CalendarIcon } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseDate(s: string): Date | undefined {
  const d = new Date(`${s}T00:00:00`)
  return isNaN(d.getTime()) ? undefined : d
}

function formatDisplay(s: string): string {
  const d = parseDate(s)
  if (!d) return "Select date"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function DateFilter({ selected, gameDates }: { selected: string; gameDates: string[] }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const gameDateObjects = gameDates.map((s) => new Date(`${s}T00:00:00`))

  function handleSelect(date: Date | undefined) {
    if (!date) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("date", toDateString(date))
    router.push(`/nightly?${params.toString()}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-start gap-2">
          <CalendarIcon className="size-4" />
          {formatDisplay(selected)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={parseDate(selected)}
          onSelect={handleSelect}
          disabled={(date) => !gameDates.includes(toDateString(date))}
          modifiers={{ hasGames: gameDateObjects }}
          modifiersClassNames={{ hasGames: "font-bold" }}
        />
      </PopoverContent>
    </Popover>
  )
}
