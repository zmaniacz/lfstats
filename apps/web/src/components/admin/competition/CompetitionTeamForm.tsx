// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  action: (formData: FormData) => Promise<void>
}

export function CompetitionTeamForm({ action }: Props) {
  const [isPending, setIsPending] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const form = e.currentTarget
    setIsPending(true)
    try {
      await action(formData)
      form.reset()
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="name">Team Name</Label>
        <Input id="name" name="name" required placeholder="e.g. Team Alpha" className="w-48" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="shortName">Short Name</Label>
        <Input id="shortName" name="shortName" placeholder="e.g. ALPHA" className="w-28" />
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add Team"}
      </Button>
    </form>
  )
}
