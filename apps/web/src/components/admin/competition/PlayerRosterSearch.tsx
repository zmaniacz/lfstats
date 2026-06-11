// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlayerSearchResult } from "@lfstats/db";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Props = {
  teamId: string;
  searchAction: (query: string) => Promise<PlayerSearchResult[]>;
  addAction: (playerId: string) => Promise<void>;
};

export function PlayerRosterSearch({ teamId, searchAction, addAction }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const router = useRouter();
  const isPendingAdd = isSubmittingAdd || isRefreshing;

  async function handleSearch(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;
    setIsPendingSearch(true);
    try {
      const found = await searchAction(query.trim());
      setResults(found);
      setSearched(true);
    } finally {
      setIsPendingSearch(false);
    }
  }

  async function handleAdd(playerId: string) {
    setAddingId(playerId);
    setIsSubmittingAdd(true);
    setAddError(null);
    try {
      await addAction(playerId);
      setAddingId(null);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add player");
      return;
    } finally {
      setIsSubmittingAdd(false);
    }
    startRefreshTransition(() => {
      router.refresh();
    });
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

      {addError && <p className="text-sm text-destructive">{addError}</p>}

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
  );
}
