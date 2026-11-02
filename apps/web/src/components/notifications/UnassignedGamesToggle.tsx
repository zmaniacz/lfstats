// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

type ActionResult = { ok: true } | { ok: false; error: string };
type SubscriptionInput = { endpoint: string; p256dh: string; auth: string };

type DeviceState = "checking" | "unsupported" | "install" | "denied" | "ready";

function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const raw = window.atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac, so touch support tells the two apart.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export function UnassignedGamesToggle({
  vapidPublicKey,
  getEnabled,
  enable,
  disable,
  sendTest,
}: {
  vapidPublicKey: string;
  getEnabled: (endpoint: string) => Promise<boolean>;
  enable: (subscription: SubscriptionInput) => Promise<ActionResult>;
  disable: (endpoint: string) => Promise<void>;
  sendTest: (endpoint: string) => Promise<ActionResult>;
}) {
  const [device, setDevice] = useState<DeviceState>("checking");
  const [enabled, setEnabled] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      if (isIos() && !isInstalled()) return setDevice("install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return setDevice("unsupported");
      }
      if (Notification.permission === "denied") return setDevice("denied");
      const registration = await registerServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) setEnabled(await getEnabled(subscription.endpoint));
      setDevice("ready");
    }
    check().catch(() => setError("Couldn't check this device. Reload to try again."));
  }, [getEnabled]);

  async function turnOn() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      if (permission === "denied") setDevice("denied");
      return;
    }
    const registration = await registerServiceWorker();
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    const keys = subscription.toJSON().keys;
    const result = await enable({
      endpoint: subscription.endpoint,
      p256dh: keys?.p256dh ?? "",
      auth: keys?.auth ?? "",
    });
    if (result.ok) setEnabled(true);
    else setError(result.error);
  }

  async function turnOff() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await disable(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setEnabled(false);
  }

  async function handleChange(next: boolean) {
    setIsPending(true);
    setError(null);
    try {
      await (next ? turnOn() : turnOff());
    } catch {
      setError("Couldn't change this setting. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  async function handleTest() {
    setIsPending(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      const result = subscription
        ? await sendTest(subscription.endpoint)
        : ({ ok: false, error: "This device isn't subscribed any more." } as const);
      if (result.ok) toast.success("Test sent. It should arrive within a few seconds.");
      else setError(result.error);
    } catch {
      setError("Couldn't send the test. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  if (device === "checking" && !error) return <Skeleton className="h-6 w-48" />;

  if (device === "install") {
    return (
      <p className="text-sm text-muted-foreground">
        On iPhone and iPad, notifications only work from the Home Screen. Tap Share, choose Add to
        Home Screen, then open LFstats from there and sign in.
      </p>
    );
  }

  if (device === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        This browser doesn&apos;t support notifications.
      </p>
    );
  }

  if (device === "denied") {
    return (
      <p className="text-sm text-muted-foreground">
        Notifications are blocked for LFstats. Allow them in this device&apos;s settings, then
        reload this page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {device === "ready" && (
        <div className="flex items-center gap-3">
          <Switch
            id="unassigned-games"
            checked={enabled}
            disabled={isPending}
            onCheckedChange={handleChange}
          />
          <Label htmlFor="unassigned-games">Notify this device</Label>
        </div>
      )}
      {device === "ready" && enabled && (
        <div>
          <Button variant="outline" size="sm" disabled={isPending} onClick={handleTest}>
            Send a test
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
