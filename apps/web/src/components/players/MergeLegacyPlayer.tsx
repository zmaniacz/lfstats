// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MergeSyntheticPlayerResult, PlayerSearchResult } from "@lfstats/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Props = {
  sourceCallsign: string;
  legacyGameCount: number;
  searchAction: (query: string) => Promise<PlayerSearchResult[]>;
  mergeAction: (targetId: string) => Promise<MergeSyntheticPlayerResult>;
};

/**
 * Admin tool on a synthetic legacy player's page: pick the real IPL player they are and
 * fold the legacy games into that profile. On success the source page no longer exists,
 * so this navigates to the target instead of refreshing in place.
 */
export function MergeLegacyPlayer({
  sourceCallsign,
  legacyGameCount,
  searchAction,
  mergeAction,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPendingSearch, setIsPendingSearch] = useState(false);
  const [target, setTarget] = useState<PlayerSearchResult | null>(null);
  const [isPendingMerge, setIsPendingMerge] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!query.trim()) return;
    setIsPendingSearch(true);
    try {
      setResults(await searchAction(query.trim()));
      setSearched(true);
    } finally {
      setIsPendingSearch(false);
    }
  }

  async function handleConfirm(e: React.MouseEvent) {
    // Keep the dialog open so a failure's message stays visible.
    e.preventDefault();
    if (!target) return;
    setIsPendingMerge(true);
    setError(null);
    try {
      const result = await mergeAction(target.id);
      if (!result.ok) {
        setError(result.error);
        setIsPendingMerge(false);
        return;
      }
      router.push(`/players/${result.targetIplId.replace(/^#/, "")}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Merge failed");
      setIsPendingMerge(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge into a real player</CardTitle>
        <CardDescription>
          If you know who {sourceCallsign} is, move their legacy games, callsigns and legacy id onto
          that player&apos;s profile. This legacy profile is then deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
                  onClick={() => {
                    setError(null);
                    setTarget(p);
                  }}
                >
                  Merge into
                </Button>
              </li>
            ))}
          </ul>
        )}

        <AlertDialog
          open={target !== null}
          onOpenChange={(open) => {
            if (!open && !isPendingMerge) setTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Merge {sourceCallsign} into {target?.currentCallsign}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {legacyGameCount} legacy {legacyGameCount === 1 ? "game moves" : "games move"} to{" "}
                {target?.currentCallsign} ({target?.iplId}), and this legacy profile is deleted.
                This cannot be undone from the site.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPendingMerge}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm} disabled={isPendingMerge}>
                {isPendingMerge ? "Merging…" : "Merge"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
