// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

/** Browser side of Web Push, shared by every control that subscribes a device. */

export type DevicePushState = "unsupported" | "install" | "denied" | "ready";

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

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

export function getDevicePushState(): DevicePushState {
  if (isIos() && !isInstalled()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return Notification.permission === "denied" ? "denied" : "ready";
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

/** This device's subscription, if it has one. Never prompts. */
export async function getDeviceSubscription(): Promise<PushSubscription | null> {
  const registration = await registerServiceWorker();
  return registration.pushManager.getSubscription();
}

/**
 * Asks for permission if needed, then returns the device's subscription, creating it if needed.
 * Returns the outcome instead when the user didn't allow notifications. Call this from a click.
 */
export async function subscribeDevice(
  vapidPublicKey: string,
): Promise<PushSubscriptionInput | "denied" | "dismissed"> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "dismissed";

  const registration = await registerServiceWorker();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));
  const keys = subscription.toJSON().keys;
  return { endpoint: subscription.endpoint, p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" };
}
