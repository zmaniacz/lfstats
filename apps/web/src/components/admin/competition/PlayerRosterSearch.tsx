// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PlayerSearchResult } from "@lfstats/db"

type Props = {
  teamId: string
  searchAction: (query: string) => Promise<PlayerSearchResult[]>
  addAction: (playerId: string) => Promise<void>
}

export function PlayerRosterSearch({ teamId, searchAction, addAction }: Props) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PlayerSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [isPendingSearch, setIsPendingSearch] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [isPendingAdd, setIsPendingAdd] = useState(false)
  const router = useRouter()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setIsPendingSearch(true)
    try {
      const found = await searchAction(query.trim())
      setResults(found)
      setSearched(true)
    } finally {
      setIsPendingSearch(false)
    }
  }

  async function handleAdd(playerId: string) {
    setAddingId(playerId)
    setIsPendingAdd(true)
    try {
      await addAction(playerId)
      setAddingId(null)
      router.refresh()
    } finally {
      setIsPendingAdd(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by callsign…"
          className="w-60"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={isPendingSearch}>
          {isPendingSearch ? "Searching…" : "Search"}
        </Button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No players found.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y border rounded-md">
          {results.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{p.currentCallsign}</span>{" "}
                <span className="text-muted-foreground">{p.iplId}</span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={isPendingAdd && addingId === p.id}
                onClick={() => handleAdd(p.id)}
              >
                {isPendingAdd && addingId === p.id ? "Adding…" : "Add"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
