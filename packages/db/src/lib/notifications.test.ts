// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canReceiveUnassignedGames,
  isAllowedPushEndpoint,
  pushFailureAction,
  unassignedGamesMessage,
} from "./notifications";

test("isAllowedPushEndpoint accepts the known push services", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://web.push.apple.com/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  }
});

test("isAllowedPushEndpoint rejects anything else", () => {
  for (const endpoint of [
    "not a url",
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://fcm.googleapis.com:8443/fcm/send/abc",
    "https://10.10.10.40:5432/",
    "https://localhost/",
    "https://evilpush.apple.com/abc",
    "https://fcm.googleapis.com.example.com/abc",
    "https://web.push.apple.com.example.com/abc",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  }
});

test("canReceiveUnassignedGames covers the admin roles but not uploaders", () => {
  assert.equal(canReceiveUnassignedGames([{ role: "superAdmin" }]), true);
  assert.equal(canReceiveUnassignedGames([{ role: "admin" }]), true);
  assert.equal(canReceiveUnassignedGames([{ role: "centerAdmin" }]), true);
  assert.equal(canReceiveUnassignedGames([{ role: "uploader" }]), false);
  assert.equal(canReceiveUnassignedGames([]), false);
});

test("unassignedGamesMessage counts games and links to the admin page", () => {
  const competition = { id: "c1", name: "Summer League", slug: "summer-league" };
  assert.deepEqual(unassignedGamesMessage({ ...competition, count: 1 }), {
    title: "Summer League",
    body: "1 game ready to assign",
    url: "/admin/competitions/summer-league",
    tag: "unassigned:c1",
  });
  assert.equal(
    unassignedGamesMessage({ ...competition, count: 3 }).body,
    "3 games ready to assign",
  );
});

test("pushFailureAction keeps a subscription unless the service says it is gone", () => {
  assert.equal(pushFailureAction(404), "delete");
  assert.equal(pushFailureAction(410), "delete");
  assert.equal(pushFailureAction(429), "retry");
  assert.equal(pushFailureAction(503), "retry");
  assert.equal(pushFailureAction(undefined), "retry");
  assert.equal(pushFailureAction(401), "report");
  assert.equal(pushFailureAction(403), "report");
  assert.equal(pushFailureAction(413), "report");
});
