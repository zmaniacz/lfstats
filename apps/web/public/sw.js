// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

// Push only: there is deliberately no fetch handler, so nothing here can serve a stale page.

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url, tag } = event.data.json();
  // Every push must show something: browsers penalise silent ones, and Safari can revoke them.
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows[0];
      if (!open) return self.clients.openWindow(url);
      // navigate() rejects for a page loaded before this worker took control.
      return open
        .focus()
        .then((client) => client.navigate(url))
        .catch(() => self.clients.openWindow(url));
    }),
  );
});
