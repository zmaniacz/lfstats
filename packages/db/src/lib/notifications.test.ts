// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canReceiveUnassignedGames,
  isAllowedPushEndpoint,
  isValidPushKeys,
  lbMatchGameMessage,
  autoAssignReviewMessage,
  matchGameMessage,
  pushFailureAction,
  unassignedGamesMessage,
  type LbMatchGameResult,
  type MatchGameResult,
} from "./notifications";

const firstGame: MatchGameResult = {
  competitionName: "Summer League",
  competitionSlug: "summer-league",
  roundName: "Round 2",
  matchId: "m1",
  gameId: "g1",
  gameNumber: 1,
  gameSlug: "4-19-20261102190000",
  forfeit: false,
  team1Name: "Ice",
  team2Name: "Fire",
  team1Score: 41200,
  team2Score: 38100,
  team1Result: "win",
  team2Result: "loss",
  team1Points: 2,
  team2Points: 0,
  matchWinner: "incomplete",
};

const lbMatch: LbMatchGameResult = {
  competitionName: "Syracuse Laserball",
  roundName: "Pool A",
  matchId: "m1",
  lbMatchId: "lb1",
  team1Name: "Ice",
  team2Name: "Fire",
  halves: [
    { half: 1, gameSlug: "4-19-20261102190000", team1Goals: 3, team2Goals: 2 },
    { half: 2, gameSlug: "4-19-20261102191500", team1Goals: 2, team2Goals: 2 },
  ],
  team1Goals: 5,
  team2Goals: 4,
  winner: 1,
};

test("matchGameMessage shows the game, the match score and no winner mid-match", () => {
  assert.deepEqual(matchGameMessage(firstGame), {
    title: "Summer League: Round 2",
    body: "Game 1: Ice 41,200 def. Fire 38,100\nMatch: Ice 2–0 Fire",
    url: "/games/4-19-20261102190000",
    tag: "match:m1:g1",
  });
});

test("matchGameMessage names the winner once the match is over", () => {
  const { body } = matchGameMessage({
    ...firstGame,
    gameNumber: 2,
    team1Score: 37500,
    team2Score: 39000,
    team1Result: "loss",
    team2Result: "win",
    team1Points: 4,
    team2Points: 2,
    matchWinner: "team1",
  });
  assert.equal(body, "Game 2: Fire 39,000 def. Ice 37,500\nMatch: Ice 4–2 Fire\nIce won the match");
});

test("matchGameMessage takes the game winner from the result, not the scores", () => {
  const { body } = matchGameMessage({
    ...firstGame,
    team1Score: 50000,
    team2Score: 30000,
    team1Result: "loss",
    team2Result: "win",
    team1Points: 0,
    team2Points: 2,
  });
  assert.equal(body.split("\n")[0], "Game 1: Fire 30,000 def. Ice 50,000");
});

test("matchGameMessage reports a drawn game and a drawn match", () => {
  const { body } = matchGameMessage({
    ...firstGame,
    gameNumber: 2,
    team2Score: 41200,
    team1Result: "draw",
    team2Result: "draw",
    team1Points: 3,
    team2Points: 3,
    matchWinner: "draw",
  });
  assert.equal(body, "Game 2: Ice 41,200 drew with Fire 41,200\nMatch: Ice 3–3 Fire\nMatch drawn");
});

test("matchGameMessage reports a forfeit and links to the standings", () => {
  const message = matchGameMessage({ ...firstGame, forfeit: true, team1Score: 10000 });
  assert.equal(message.body.split("\n")[0], "Game 1: Fire forfeited to Ice");
  assert.equal(message.url, "/standings?competition=summer-league");
});

test("lbMatchGameMessage covers every half and the match result", () => {
  assert.deepEqual(lbMatchGameMessage(lbMatch), {
    title: "Syracuse Laserball: Pool A",
    body: "Half 1: Ice 3–2 Fire\nHalf 2: Ice 2–2 Fire\nMatch: Ice 5–4 Fire\nIce won the match",
    url: "/laserball/games/4-19-20261102190000",
    tag: "match:m1:lb1",
  });
});

test("lbMatchGameMessage labels overtime and reports ties", () => {
  const overtime = lbMatchGameMessage({
    ...lbMatch,
    halves: [...lbMatch.halves, { half: 3, gameSlug: "x", team1Goals: 1, team2Goals: 0 }],
  });
  assert.match(overtime.body, /OT 1: Ice 1–0 Fire/);
  assert.match(lbMatchGameMessage({ ...lbMatch, winner: "tie" }).body, /Match tied$/);
  assert.doesNotMatch(lbMatchGameMessage({ ...lbMatch, winner: null }).body, /won the match/);
});

test("isValidPushKeys accepts browser keys and rejects anything else", () => {
  const p256dh = `B${"a".repeat(86)}`;
  const auth = "a".repeat(22);
  assert.equal(isValidPushKeys(p256dh, auth), true);
  assert.equal(isValidPushKeys(`${p256dh}=`, `${auth}==`), true);
  assert.equal(isValidPushKeys("", auth), false);
  assert.equal(isValidPushKeys(p256dh, ""), false);
  assert.equal(isValidPushKeys(`${p256dh}/`, auth), false);
});

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

test("autoAssignReviewMessage names the unrostered players and links to the game", () => {
  const review = {
    competitionName: "Summer League",
    gameId: "g1",
    gameSlug: "4-19-20261102190000",
    roundName: "Round 2",
    matchNumber: 3,
    gameNumber: 1,
  };
  assert.deepEqual(autoAssignReviewMessage({ ...review, callsigns: ["Sub"] }), {
    title: "Summer League: auto-assigned",
    body:
      "Round 2 · Match 3 · Game 1\n" +
      "1 player not on a roster: Sub\n" +
      "Roster them (as mercs if subs), then reassign the game.",
    url: "/games/4-19-20261102190000",
    tag: "auto-assign:g1",
  });
  const many = autoAssignReviewMessage({
    ...review,
    callsigns: ["A", "B", "C", "D", "E", "F", "G"],
  });
  assert.match(many.body, /7 players not on a roster: A, B, C, D, E \+2 more/);
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
