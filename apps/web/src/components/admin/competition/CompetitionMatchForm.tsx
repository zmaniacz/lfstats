"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CompetitionTeamListItem } from "@lfstats/db"

type Props = {
  roundId: string
  teams: CompetitionTeamListItem[]
  action: (roundId: string, formData: FormData) => Promise<void>
}

export function CompetitionMatchForm({ roundId, teams, action }: Props) {
  const [team1Id, setTeam1Id] = useState("")
  const [team2Id, setTeam2Id] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("team1Id", team1Id)
    formData.set("team2Id", team2Id)
    startTransition(async () => {
      await action(roundId, formData)
      setTeam1Id("")
      setTeam2Id("")
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap">
      <div className="space-y-1">
        <Label>Team 1</Label>
        <Select value={team1Id} onValueChange={setTeam1Id}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled={t.id === team2Id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-sm text-muted-foreground pb-2">vs</span>
      <div className="space-y-1">
        <Label>Team 2</Label>
        <Select value={team2Id} onValueChange={setTeam2Id}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id} disabled={t.id === team1Id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button
        type="submit"
        disabled={isPending || !team1Id || !team2Id}
      >
        {isPending ? "Adding…" : "Add Match"}
      </Button>
    </form>
  )
}
