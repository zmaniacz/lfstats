# Notifications Spec

**Status:** `unassigned_game` is live and has been received on desktop and mobile. `match_game` and
the Follow button are built. Listing a device's follows on `/notifications` is not built.

Notifications tell a phone that something happened at an event. Fans follow a competition and hear
about each game added to a match, with the updated match score. Admins hear when an uploaded
competition game is waiting to be assigned.

Delivery is standard Web Push from an installable PWA. Everything runs on infrastructure that
already exists: Postgres holds the state and the chomper worker sends. There is no new service and
no vendor account. The `web-push` npm package is the only new dependency.

**In scope:** the two notification kinds below, SM5 and Laserball, Android and iOS.

**Out of scope for now:** email, SMS, Discord or Telegram, a native app, per-team or per-player
following, offline caching, and notifications for removed games. The schema should not prevent
per-team following later.

---

## Notification kinds

### `match_game`: a game was added to a match

**Audience:** every subscription following the competition. No account is needed.

**Fires when:** a game, forfeit or Laserball match is assigned to a `competition_match`, and the
competition's `state` is `active`.

| Case       | Title              | Body                                                                                   | Opens               |
| ---------- | ------------------ | -------------------------------------------------------------------------------------- | ------------------- |
| First game | `{Event}: {Round}` | `Game 1: Ice 41,200 def. Fire 38,100` / `Match: Ice 2–0 Fire`                          | Game page           |
| Final game | `{Event}: {Round}` | `Game 2: Fire 39,000 def. Ice 37,500` / `Match: Ice 4–2 Fire` / `Ice won the match`    | Game page           |
| Forfeit    | `{Event}: {Round}` | `Game 1: Fire forfeited to Ice` / `Match: Ice 2–0 Fire`                                | Standings           |
| Laserball  | `{Event}: {Round}` | `Half 1: Ice 3–2 Fire` / `Half 2: Ice 2–2 Fire` / `Match: Ice 5–4 Fire` / `Ice won...` | Laserball game page |

Team names and numbers above are illustrations. The rules are:

- **Match score** is match points earned in this match, including the round multiplier and, once
  both games are in, the match bonus. It comes from `getCompetitionMatchResults`, the same query as
  the match card (see [Points Calculation](Competition_Structure.md#points-calculation)). The
  dispatcher never derives points itself. A Laserball match score is its goals over every half.
- **The game winner comes from `result`,** never from comparing scores, because an eliminated team
  can outscore the winner.
- **Displayed game scores** include `elimination_bonus` and `penalty_score`, matching the match
  card.
- **Trios and duos** name the whole side, `A & B`, as forfeit games do.
- **The winner line** appears once `matchWinner` is decided, which takes two games. A drawn match
  reads `Match drawn`, and a tied Laserball match reads `Match tied`.
- **Laserball** sends one notification per match, because both halves are assigned together.

### `unassigned_game`: a competition game is waiting

**Audience:** subscriptions that opted in, whose user currently holds one of these roles:

| Role                 | Receives                                                    |
| -------------------- | ----------------------------------------------------------- |
| `superAdmin`/`admin` | Every competition                                           |
| `centerAdmin`        | Competitions whose `host_center_id` is one of their centers |
| `uploader`           | Nothing                                                     |

**Fires when:** `processFile` ingests a game with a non-null `competitionId`, the competition's
`state` is `active`, and `hasMatchStructure(format)` is true. Solo and no-scoring competitions have
nothing to assign games to.

Games uploaded close together collapse into one notification per competition:
`{Event}: 3 games ready to assign`, opening `/admin/competitions/{slug}`. The count comes from
`getCompetitionUnassignedGamesForAdmin` at send time, because it also understands Laserball
assignment and excluded games. Nothing is sent if the count is zero.

A game moved into a competition by an admin does not fire this, because the admin already knows
about it. That covers `setGameCompetition` and `bulkAssignGamesToCompetition`.

---

## Architecture

```
web server action ─┐
  assign / forfeit │   insert (best-effort)
                   ├──────────────────────▶ notification_outbox ──▶ dispatcher ──▶ push services ──▶ phone
chomper processFile┘                                                (in the
  competition game                                                   worker)
```

The outbox keeps sending out of the request path and out of ingest. An admin clicking Assign never
waits on a push service, and rows simply wait if the worker is down.

**A notification never fails the operation that caused it.** Enqueueing catches and logs its own
errors, like `notifyNewGame`. This matters most in `processFile`, whose `catch` marks the job
failed and moves the TDF to the error bucket.

### Schema

All timestamps here are written and compared using the database clock (`now()`), never a JavaScript
`Date`, so the local-time convention cannot skew them.

**`push_subscription`**: one browser on one device.

| Column            | Type          | Notes                                                         |
| ----------------- | ------------- | ------------------------------------------------------------- |
| `id`              | uuid PK       |                                                               |
| `endpoint`        | text, unique  | Treat as a secret. Never log it.                              |
| `p256dh`          | text          | From the browser's subscription                               |
| `auth`            | text          | From the browser's subscription                               |
| `user_id`         | text FK, null | Auth user, set only by an admin opt-in. `on delete set null`. |
| `created_at`      | timestamp     |                                                               |
| `last_success_at` | timestamp     | Null until the first delivery                                 |

**`notification_preference`**: what a subscription wants.

| Column            | Type          | Notes                                                                                                                |
| ----------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| `subscription_id` | uuid FK       | `on delete cascade`                                                                                                  |
| `kind`            | enum          | `unassigned_game`, `match_game`, and `test` for the outbox                                                           |
| `competition_id`  | uuid FK, null | Required for `match_game`. Null for `unassigned_game`, whose scope comes from the user's roles. `on delete cascade`. |

Unique on all three columns, using `NULLS NOT DISTINCT`.

**`notification_outbox`**: one row per event, not per recipient.

| Column            | Type         | Notes                                             |
| ----------------- | ------------ | ------------------------------------------------- |
| `id`              | uuid PK      |                                                   |
| `kind`            | enum         |                                                   |
| `competition_id`  | uuid FK      | Null only for `test`. `on delete cascade`.        |
| `dedupe_key`      | text, unique | Insert uses `on conflict do nothing`              |
| `payload`         | jsonb        | Ids only. Text is built at send time.             |
| `send_after`      | timestamp    | `now() + 60 seconds`; immediate for `test`        |
| `sent_at`         | timestamp    | Set when claimed. Partial index on the null rows. |
| `skip_reason`     | text, null   | Why a claimed row sent nothing                    |
| `recipient_count` | integer      |                                                   |
| `failure_count`   | integer      |                                                   |
| `created_at`      | timestamp    |                                                   |

Dedupe keys:

| Event           | `dedupe_key`                                  |
| --------------- | --------------------------------------------- |
| SM5 game        | `match_game:{matchId}:{gameId}`               |
| Laserball match | `match_game:{competitionMatchId}:{lbMatchId}` |
| Unassigned game | `unassigned_game:{gameId}`                    |

### Enqueue points

Hook the `packages/db` query functions, because each has more than one caller:

| Function                          | Callers                                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `assignGameToMatch`               | Match admin page, SM5 game page, legacy scripts                                           |
| `createForfeitGame`               | Match admin page                                                                          |
| `assignLbMatchToCompetitionMatch` | Match admin page, Laserball game page, and `linkAndAssignLbHalves`, which delegates to it |

The enqueue helper checks `state = 'active'` itself. The SM5 game page action does not check state,
and the legacy migration scripts call `assignGameToMatch`, so this check is what keeps them quiet.

For ingest, the enqueue is step 13 of `processFile`. Only the worker and Lambda call `processFile`,
so bulk ingests and re-ingests never fire.

### Dispatcher

The dispatcher is a second async loop inside `apps/chomper/src/worker.ts`, polling every 5 seconds.
It must run beside the SQS loop, not inside it, because that loop blocks on a 20-second long poll
and on each file. It stops on the same shutdown signal. It runs in the worker only, never in the
Lambda.

For each due row (`sent_at is null and send_after <= now()`):

1. Claim it by setting `sent_at`. Delivery is at most once: a crash mid-send loses that row rather
   than notifying everyone twice.
2. Skip it, with a `skip_reason`, if any of these is true:
   - It is more than an hour old, so a worker outage does not produce stale alerts.
   - The competition is no longer `active`.
   - For `match_game`, the assignment no longer exists, so an undo inside the 60-second window
     sends nothing.
3. Group due `unassigned_game` rows by competition into a single message.
4. Build the text from current data, so the score reflects the latest state.
5. Resolve recipients. For `unassigned_game`, join `user_roles` now, because the roles in a JWT are
   only set at sign-in.
6. Send with `web-push`, 10 at a time, with a 10-second timeout per request.
7. Delete expired subscriptions and record the counts.

| Response     | Action                                                                 |
| ------------ | ---------------------------------------------------------------------- |
| `2xx`        | Set `last_success_at`                                                  |
| `404`, `410` | Delete the subscription; its preferences cascade                       |
| `429`, `5xx` | Retry once after a short delay, then count as a failure                |
| `401`, `403` | Log an error: the VAPID configuration is wrong. Keep the subscription. |
| `413`        | Log an error: the payload is too large. Keep the subscription.         |

Push options: `TTL` of 1 hour for `match_game` and 6 hours for `unassigned_game`, with `urgency`
set to `high`.

The same loop deletes outbox rows older than 30 days.

### Message format

The push payload is JSON: `{ title, body, url, tag }`, under 3 KB.

`tag` is `unassigned:{competitionId}`, so a newer alert replaces the older one on the device. For
`match_game` it is `match:{matchId}:{gameId}`, or `match:{matchId}:{lbMatchId}` for Laserball. That
is one tag per game because a replacement can arrive silently, and each game should alert.

---

## Web app

### PWA

- `apps/web/src/app/manifest.ts`: name, `display: "standalone"`, `start_url`, `scope`, icons.
- `apps/web/public/icons/`: placeholder icons, including an Apple touch icon. These need artwork.
- `apps/web/public/sw.js`: `push` calls `showNotification`, and `notificationclick` focuses or
  opens `url`. There is no caching and no offline behaviour.

Every push must show a notification. Browsers penalise silent pushes, and Safari can revoke the
subscription.

### Following an event

A **Follow** button sits in the `/standings` header, for competitions with
`hasMatchStructure(format)` whose `state` is `active` or `upcoming`. Fans don't sign in.

The button handles each state explicitly:

| State                    | Behaviour                                           |
| ------------------------ | --------------------------------------------------- |
| Push unsupported         | No button                                           |
| iOS, not installed       | Clicking shows the Share → Add to Home Screen steps |
| Permission not yet asked | Button. The prompt appears only after this click.   |
| Permission denied        | Clicking explains how to re-enable it               |
| Following                | Button shows Following; clicking unfollows          |

A subscription is deleted, and the browser unsubscribed, only when its last preference goes. An
admin who follows competitions can turn off the admin alert and keep the follows.

### Managing notifications

`/notifications` holds the **Unassigned games** toggle, which sets `push_subscription.user_id`, and
a **Send a test** button that queues a `test` row for this device. The toggle requires a session
and a role check on the server. For now the page redirects anyone without an eligible role, and it
is linked from the user menu.

A fan unfollows from the standings page. Two things are not built yet: opening this page to
everyone with a list of what the device follows, and a sync on each app open that re-sends the
current subscription, since browsers can rotate it without telling us. Until then, someone whose
subscription rotates sees Follow again and re-follows, or an admin turns the toggle off and on. The
old row is deleted when its endpoint returns `410`.

### Abuse and privacy

The follow action is anonymous and tells the worker where to send HTTP requests, so it is the main
security surface. A device proves ownership of a follow by sending its own endpoint, read from
`pushManager.getSubscription()`.

- **Allowlist endpoint hosts.** Require `https` and a known push service: `fcm.googleapis.com`,
  `*.push.apple.com`, `*.push.services.mozilla.com` and `*.notify.windows.com`. Without this the
  worker can be pointed at internal addresses on the LAN. `isAllowedPushEndpoint` does this.
- **Validate the keys.** `isValidPushKeys` rejects anything `web-push` couldn't encrypt to. Such a
  row would throw before any request, so it would never get the `410` that clears it.
- **Cap and rate-limit.** A device can follow 50 competitions, and an address can make 10 follow
  requests a minute and 100 a day. The limiter is in memory, so it resets when the app restarts.
- **Store no personal data for fans.** A subscription is an opaque endpoint and keys.

---

## Configuration

| Variable            | Where       | Notes                                                             |
| ------------------- | ----------- | ----------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | Web, worker | Passed to the client from a server component                      |
| `VAPID_PRIVATE_KEY` | Worker      | Only the [worker](../apps/chomper/README.md#environment) reads it |
| `VAPID_SUBJECT`     | Worker      | A `mailto:` or site URL contact                                   |

Generate the pair once with `pnpm --filter chomper exec web-push generate-vapid-keys` and keep it.
Rotating it invalidates every subscription. Without keys the dispatcher stops at startup, the web
page says notifications aren't set up, and outbox rows wait.

Subscriptions belong to an origin, so they must be created on the canonical `https://lfstats.com`.
Subscriptions made on `modern.lfstats.com` would not carry over.

`packages/db` changes trigger all deploy workflows with no ordering between them. Apply the
migration, then set the VAPID keys: until both are in place the enqueue fails harmlessly and logs a
warning, and nothing is sent.

---

## iOS

Web Push only works on iOS from a site added to the Home Screen, so this is the main adoption risk.
There is no automatic install prompt, which is why the button walks users through it.

A Home Screen app is expected to have its own storage, separate from Safari. An admin may therefore
need to complete Google sign-in inside the installed app before the admin toggle appears. Phase 0
tests this. If sign-in fails there, the fallback is a one-time link, generated from a signed-in
Safari session, that attaches the installed app's subscription to the user.

Declarative Web Push is not needed: the service worker path covers older iOS versions as well. It
can be added later.

---

## Build order

1. **Phase 0, device checks.** Use **Send a test** on `/notifications`. Pass criteria:
   - A real iPhone installs the app and receives a push with the app closed.
   - A real Android phone receives one from the browser.
   - Google sign-in completes inside the installed iOS app, or the fallback is chosen.
2. **Phase 1, foundation.** Schema, migration, VAPID keys, icons, subscribe and unsubscribe, and the
   dispatcher with a test send.
3. **Phase 2, `unassigned_game`.** It ships first because the audience is small, you are in it, and
   it proves the path during a real event.
4. **Phase 3, `match_game`.** The message builder, enqueue hooks and the Follow button.

The message builders are pure functions, unit-tested like `match-points.ts`: elimination wins,
draws, forfeits, Laserball overtime and ties, and first versus final game.

---

## Open questions

- **Laserball overtime.** `addLbMatchOvertimeGame` can change a result after the match was assigned.
  V1 does not notify for it. Decide once Laserball notifications have been seen in use.
- **Corrections.** Removing a game after a notification went out sends nothing, and re-assigning
  the same game is suppressed by its dedupe key. A different game in that slot does notify. Decide
  whether events need an explicit "correction" message.
- **Web Push pricing.** The browser vendors' push services are believed to be free to senders, but
  this is not confirmed from their documentation. Check before Phase 1.
