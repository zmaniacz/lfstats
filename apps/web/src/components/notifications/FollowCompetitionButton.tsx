// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

"use client";

import { useEffect, useState } from "react";
import { BellIcon, BellRingingIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getDevicePushState,
  getDeviceSubscription,
  subscribeDevice,
  type DevicePushState,
  type PushSubscriptionInput,
} from "@/lib/push-client";

type ActionResult = { ok: true } | { ok: false; error: string };

const BLOCKED_MESSAGE =
  "Notifications are blocked for LFstats. Allow them in this device's settings, then reload.";

/** Sends this device a notification for every game added to a match in the competition. */
export function FollowCompetitionButton({
  vapidPublicKey,
  getFollowing,
  follow,
  unfollow,
}: {
  vapidPublicKey: string;
  getFollowing: (endpoint: string) => Promise<boolean>;
  follow: (subscription: PushSubscriptionInput) => Promise<ActionResult>;
  // Resolves true when the server deleted the subscription, so the browser should drop it too.
  unfollow: (endpoint: string) => Promise<boolean>;
}) {
  const [device, setDevice] = useState<DevicePushState | null>(null);
  const [following, setFollowing] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    async function check() {
      const state = getDevicePushState();
      setDevice(state);
      if (state !== "ready") return;
      const subscription = await getDeviceSubscription();
      if (subscription) setFollowing(await getFollowing(subscription.endpoint));
    }
    // The button still works if this fails: it just starts out showing Follow.
    check().catch(() => {});
  }, [getFollowing]);

  async function turnOn() {
    const subscription = await subscribeDevice(vapidPublicKey);
    if (subscription === "denied") {
      setDevice("denied");
      toast.error(BLOCKED_MESSAGE);
      return;
    }
    if (subscription === "dismissed") return;
    const result = await follow(subscription);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setFollowing(true);
    toast.success("You'll be notified when games are added to matches.");
  }

  async function turnOff() {
    const subscription = await getDeviceSubscription();
    if (subscription && (await unfollow(subscription.endpoint))) await subscription.unsubscribe();
    setFollowing(false);
  }

  async function handleClick() {
    if (device === "install") {
      toast.info("Add LFstats to your Home Screen first", {
        description:
          "On iPhone and iPad, notifications only work from the Home Screen. Tap Share, choose Add to Home Screen, then open LFstats from there.",
        duration: 10_000,
      });
      return;
    }
    if (device === "denied") {
      toast.error(BLOCKED_MESSAGE);
      return;
    }

    setIsPending(true);
    try {
      await (following ? turnOff() : turnOn());
    } catch {
      toast.error("Couldn't change this setting. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  // Render nothing until the device is known, and on a browser that can never do this.
  if (device === null || device === "unsupported") return null;

  return (
    <Button
      variant={following ? "secondary" : "outline"}
      size="sm"
      disabled={isPending}
      aria-pressed={following}
      onClick={handleClick}
    >
      {following ? (
        <BellRingingIcon data-icon="inline-start" />
      ) : (
        <BellIcon data-icon="inline-start" />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  );
}
