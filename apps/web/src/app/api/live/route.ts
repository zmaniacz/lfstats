// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/**
 * Server-Sent Events stream of live events (see packages/db/src/queries/live-events.ts).
 * Public and read-only: the events carry only ids and text that the site already shows.
 */

import { subscribeLiveEvents } from "@/lib/live-events-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Below the idle timeouts of common proxies, so a quiet stream isn't cut.
const HEARTBEAT_MS = 25_000;
// How long the browser waits before reconnecting after the stream drops.
const RETRY_MS = 10_000;

export function GET(request: Request): Response {
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      send(`retry: ${RETRY_MS}\n\n`);
      const unsubscribe = subscribeLiveEvents((event) => {
        send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };
      request.signal.addEventListener("abort", () => cleanup(), { once: true });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Stops nginx-style proxies from buffering the stream.
      "X-Accel-Buffering": "no",
    },
  });
}
