// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CenterListItem } from "@lfstats/db"

type Props = {
  competitionId: string
  centers: CenterListItem[]
  action: (competitionId: string, formData: FormData) => Promise<number>
}

export function BulkAssignForm({ competitionId, centers, action }: Props) {
  const [isPending, setIsPending] = useState(false)
  const [centerId, setCenterId] = useState("")
  const [result, setResult] = useState<number | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("centerId", centerId)
    setResult(null)
    setIsPending(true)
    try {
      const count = await action(competitionId, formData)
      setResult(count)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Center</Label>
        <Select value={centerId} onValueChange={setCenterId} name="centerId" required>
          <SelectTrigger>
            <SelectValue placeholder="Select a center" />
          </SelectTrigger>
          <SelectContent>
            {centers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-4">
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="dateFrom">From</Label>
          <Input id="dateFrom" name="dateFrom" type="date" required />
        </div>
        <div className="space-y-1.5 flex-1">
          <Label htmlFor="dateTo">To</Label>
          <Input id="dateTo" name="dateTo" type="date" required />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button type="submit" disabled={isPending || !centerId}>
          {isPending ? "Assigning…" : "Assign Games"}
        </Button>
        {result !== null && (
          <span className="text-sm text-muted-foreground">
            {result} game{result !== 1 ? "s" : ""} assigned.
          </span>
        )}
      </div>
    </form>
  )
}
