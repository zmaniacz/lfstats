// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

/**
 * Listens to `/api/live`. A game added to a match shows a toast with the same text as the push
 * notification, and any new data refreshes the page in place. See
 * packages/db/src/queries/live-events.ts.
 *
 * This is a background refresh, not a server-action follow-up, so the advice against
 * `router.refresh()` in apps/web/CLAUDE.md doesn't apply: nothing waits on it or shows a pending
 * state.
 */

import type { LiveEvent } from "@lfstats/db";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

// Several games can land together at the end of a session, so refreshes are coalesced.
const MIN_REFRESH_INTERVAL_MS = 15_000;
// Spread the refreshes out so every open tab doesn't hit the server in the same instant.
const MAX_JITTER_MS = 3_000;
const TOAST_DURATION_MS = 15_000;

/** Only same-origin paths, so an event can never navigate to another site or a script URL. */
function isLocalPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

export function LiveUpdates() {
  // The App Router's instance is stable, so this doesn't reconnect on navigation.
  const router = useRouter();

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    let lastRefresh = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // A hidden tab defers its refresh until it is shown again.
    let pendingWhileHidden = false;

    const refreshNow = () => {
      timer = undefined;
      if (document.visibilityState !== "visible") {
        pendingWhileHidden = true;
        return;
      }
      lastRefresh = Date.now();
      router.refresh();
    };

    const scheduleRefresh = () => {
      if (timer !== undefined) return;
      const wait = Math.max(0, lastRefresh + MIN_REFRESH_INTERVAL_MS - Date.now());
      timer = setTimeout(refreshNow, wait + Math.random() * MAX_JITTER_MS);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && pendingWhileHidden) {
        pendingWhileHidden = false;
        scheduleRefresh();
      }
    };

    const parse = (message: MessageEvent<string>): LiveEvent | null => {
      try {
        return JSON.parse(message.data) as LiveEvent;
      } catch {
        return null;
      }
    };

    const source = new EventSource("/api/live");
    source.addEventListener("game", () => scheduleRefresh());
    source.addEventListener("match_game", (message: MessageEvent<string>) => {
      const event = parse(message);
      if (event?.type !== "match_game") return;
      toast(event.title, {
        // A newer toast for the same game replaces this one rather than stacking.
        id: event.tag,
        description: <span className="whitespace-pre-line">{event.body}</span>,
        duration: TOAST_DURATION_MS,
        action: isLocalPath(event.url)
          ? { label: "View", onClick: () => router.push(event.url) }
          : undefined,
      });
      scheduleRefresh();
    });
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      source.close();
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  return null;
}
