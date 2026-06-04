"use client"

import { useState, useTransition } from "react"
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

type Props = {
  nextRoundNumber: number
  action: (formData: FormData) => Promise<void>
}

export function CompetitionRoundForm({ nextRoundNumber, action }: Props) {
  const [type, setType] = useState<"pool" | "finals">("pool")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("type", type)
    const form = e.currentTarget
    startTransition(async () => {
      await action(formData)
      form.reset()
      setType("pool")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1">
        <Label htmlFor="roundName">Round Name</Label>
        <Input id="roundName" name="name" required placeholder="e.g. Round 1" className="w-40" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="roundNumber">Round #</Label>
        <Input
          id="roundNumber"
          name="roundNumber"
          type="number"
          required
          defaultValue={nextRoundNumber}
          min={1}
          className="w-20"
        />
      </div>
      <div className="space-y-1">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as "pool" | "finals")}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pool">Pool</SelectItem>
            <SelectItem value="finals">Finals</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add Round"}
      </Button>
    </form>
  )
}
