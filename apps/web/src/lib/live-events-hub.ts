// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * One LISTEN connection per server process, fanned out to every open `/api/live` stream.
 * It starts on the first subscriber and stays up after that, so tabs that reconnect don't
 * churn database connections.
 */

import { listenLiveEvents, type LiveEvent } from "@lfstats/db";

type Subscriber = (event: LiveEvent) => void;

const hub = globalThis as typeof globalThis & {
  _liveSubscribers?: Set<Subscriber>;
  _liveListening?: Promise<void>;
};

function subscribers(): Set<Subscriber> {
  hub._liveSubscribers ??= new Set();
  return hub._liveSubscribers;
}

function ensureListening(): void {
  hub._liveListening ??= listenLiveEvents((event) => {
    for (const subscriber of subscribers()) subscriber(event);
  }).catch((err: unknown) => {
    // Let the next subscriber try again rather than leaving the hub dead until a restart.
    hub._liveListening = undefined;
    console.error(`Live events LISTEN failed: ${(err as Error).message}`);
  });
}

/** Returns the unsubscribe function. */
export function subscribeLiveEvents(subscriber: Subscriber): () => void {
  ensureListening();
  subscribers().add(subscriber);
  return () => subscribers().delete(subscriber);
}
