# Public API Reference

Routes live under `https://lfstats.com/api/` in `apps/web/src/app/api/**/route.ts` and are backed
by query functions in `packages/db/src/queries/`.

Everything here is an unauthenticated GET **except `POST /api/videos`**, which requires an API key
— see [Video routes](#post-apivideos) below.

---

## `GET /api/games`

Returns a list of played games (SM5 and/or Laserball) with a link to the raw TDF file in the
`lfstats-modern-archive` S3 bucket. Intended as a feed for external consumers to pull newly
played games without scraping the site.

Defined in `apps/web/src/app/api/games/route.ts`, backed by `getGamesForExport` in
`packages/db/src/queries/games.ts`.

### Query parameters

| Param         | Required | Format                                       | Default           | Description                                    |
| ------------- | -------- | -------------------------------------------- | ----------------- | ---------------------------------------------- |
| `start_date`  | no       | `YYYY-MM-DD`                                 | see date defaults | Inclusive start of the date range (local time) |
| `end_date`    | no       | `YYYY-MM-DD`                                 | see date defaults | Inclusive end of the date range (local time)   |
| `game_type`   | no       | `sm5` \| `lb`                                | both              | Filter to one game type                        |
| `center`      | no       | center slug, e.g. `4-23`                     | all centers       | Filter to one center                           |
| `competition` | no       | competition slug, e.g. `internationals_2026` | all games         | Filter to one competition's games              |

Games with `exclude = true` are always omitted. Competition games are included.

### Date defaults

Without `competition`, an omitted `start_date` defaults to 10 days before today and an omitted
`end_date` defaults to today. This rolling window keeps the unfiltered feed small.

**`competition` opts out of that window**: when `competition` is supplied and a date bound is
omitted, that bound is left unbounded, so `?competition=<slug>` alone returns every game in the
competition regardless of how long ago it was played. Explicit `start_date`/`end_date` values
still apply on top of the competition filter, and each bound is independent — you can pass just
one.

### Response

```json
{
  "data": [
    {
      "game_slug": "4-23-20260712155024",
      "center_slug": "4-23",
      "timestamp": "2026-07-12T15:50:24.000Z",
      "game_type": "sm5",
      "tdf_url": "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com/4-23-20260712155024.tdf",
      "competition_slug": "2026-mlaa",
      "round_number": 2,
      "match_number": 7,
      "game_number": 1
    }
  ]
}
```

Sorted by `timestamp` descending. `timestamp` is the game's stored local start time — no timezone
conversion is applied (see root `CLAUDE.md`'s "no UTC conversion" convention), but note that
`NextResponse.json` serializes JS `Date` values with a `Z` suffix regardless.

`game_slug` is the game's [slug](#game-slugs) — the same value `POST /api/videos` expects, so a
consumer can feed this route's output straight back into the video routes.

`competition_slug` is `null` for social games. `round_number`, `match_number` and `game_number`
come from the competition's match schedule (`competition_match_game` → `competition_match` →
`competition_round`) and are `null` both for social games and for competition games that haven't
been assigned to a match.

### Errors

`400` with `{ "error": "..." }` for an unparseable `start_date`/`end_date`, an invalid
`game_type`, a `center` slug that doesn't match any center, or a `competition` slug that doesn't
match any competition.

### Example — all filters combined

```
https://lfstats.com/api/games?start_date=2026-07-01&end_date=2026-07-12&game_type=lb&center=4-23
```

Laserball games at center `4-23` played between 2026-07-01 and 2026-07-12 inclusive.

---

## `GET /api/games/[slug]`

Returns one game's header and its full entity roster — who and what was on the field, not how
they did. Keyed by the public [game slug](#game-slugs); both SM5 and Laserball resolve.

Defined in `apps/web/src/app/api/games/[game]/route.ts`, backed by `getGameSummaryBySlug` in
`packages/db/src/queries/games.ts`.

No query parameters. `404` with `{ "error": "Not found" }` for a malformed or unknown slug.

### Response

```json
{
  "game_slug": "4-19-20260805223932",
  "game_type": "sm5",
  "tdf_url": "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com/4-19-20260805223932.tdf",
  "start_date": "2026-08-05",
  "start_time": "22:39:32",
  "scheduled_length": "15:00",
  "actual_length": "15:00",
  "center_slug": "4-19",
  "center_name": "Loveland",
  "teams": [
    {
      "name": "Earth Team",
      "colour_enum": 13,
      "is_neutral": false,
      "players": [{ "ipl_id": "#jRw9Q93", "codename": "Burnt_lettuce" }]
    },
    { "name": "Neutral", "colour_enum": 0, "is_neutral": true, "players": [] }
  ],
  "targets": [
    { "entity_id": "@247", "codename": "Beacon (Red Base)", "type": "beacon", "team": "Red Team" }
  ],
  "referees": [{ "ipl_id": null, "entity_id": "@235", "codename": "Zen" }]
}
```

`start_date` and `start_time` split the game's stored local start time — no timezone conversion
(see root `CLAUDE.md`). `scheduled_length` and `actual_length` are `m:ss`, formatted from the
stored millisecond durations.

### Entity groups

Entities are grouped by kind rather than all nested under teams, because a referee belongs to no
team and a target's team says which side _owns_ it, not who played on it.

- **`teams`** — one per team in `tdf_team_index` order, including the neutral team (which
  normally has no players). `players` lists every scorecard on that team, sorted by codename.
- **`targets`** — every non-player target entity in the game (beacons, generators, warbots),
  sorted by hardware id, each with the name of its owning team or `null`. Always `[]` for
  Laserball, which declares no target entities.
- **`referees`** — sorted by codename.

`ipl_id` is the `#xxxxxxx` Laserforce member id; `entity_id` is the `@NNN` center-local hardware
id. See [Appendix C of `TDF_Spec.md`](./TDF_Spec.md) for both formats.

A player's `ipl_id` is `null` for a guest. Guests play under a `@NNN` id that ingest does not
persist on the scorecard, so **a guest is identifiable only by codename** — there is no
`entity_id` to fall back on. Referees carry whichever of the two ids they signed in with.

---

## `GET /api/players/averages`

Returns overall and per-position career averages for every player. Defined in
`apps/web/src/app/api/players/averages/route.ts`, backed by `getPlayerOverallAverages` in
`packages/db/src/queries/players.ts`. No query parameters. Response: `{ "data": [...] }`, one
object per player (`player_IPL_ID`, `player_name`, MVP/accuracy/games-played/games-won broken out
overall and per position — commander/heavy/scout/ammo/medic).

---

## `GET /api/games/[gameId]/replay`

Full SM5 replay data (events, per-tick player states, non-player actors) for one game, keyed by
internal `gameId` (UUID), **not** the public game slug — unlike its parent
[`GET /api/games/[slug]`](#get-apigamesslug), which is keyed by slug. Defined in
`apps/web/src/app/api/games/[game]/replay/route.ts` (the directory is named `[game]` because
Next.js requires one name per dynamic segment and the parent route uses the slug), backed by
`getGameReplayData` in `packages/db/src/queries/games.ts`. Returns `404` with
`{ "error": "Not found" }` for an unknown `gameId`.

## `GET /api/laserball/games/[gameId]/replay`

Laserball equivalent of the above — backed by `getLbGameReplayData` in
`packages/db/src/queries/laserball.ts`.

## `GET /api/laserball/matches/[matchId]/replay`

Replay data for a Laserball **match** — both halves of a two-game match stitched together — keyed
by internal `lb_match` UUID. Backed by `getLbMatchReplayData` in
`packages/db/src/queries/lb-match.ts`. Returns `404` with `{ "error": "Not found" }` for an
unknown `matchId`.

A Laserball match links two games that are the same two teams with sides swapped at the half. Side
identity is match-scoped: `lb_match_game` records which `lb_game_team` row is "Side 1" and "Side 2"
in each half, because the same real-world team normally carries a different colour in each. There
is no persistent Laserball team table — this is a lighter structure than the SM5
`competition_match` model.

---

## `GET /api/competitions/[slug]/stats`

Per-player stats for a competition, keyed by competition slug. Backed by
`getCompetitionPlayerStats` in `packages/db/src/queries/competition-tournament.ts`. `404` if the
slug doesn't match a competition.

For a **solo** competition (`competition.format = 'solo'`) the player list comes from
`competition_player` rather than team rosters, and the per-competition aggregate counts every
non-excluded game assigned to the competition. `team_name` is an empty string and `team_logo_url`
is null for every row, since solo competitions have no teams.

For a **no-scoring** competition (`competition.format = 'none'`) there is no roster of any kind, so
the player list is every player holding a scorecard in one of the competition's non-excluded games.
Game scoping and the empty `team_name` / null `team_logo_url` match the solo case.

## `GET /api/competitions/[slug]/schedule`

Competition schedule (rounds/matches), keyed by competition slug. Backed by
`getCompetitionSchedule` in `packages/db/src/queries/competition-tournament.ts`. `404` if the slug
doesn't match a competition.

## `GET /api/competitions/[slug]/standings`

Competition standings/leaderboard, keyed by competition slug. `404` if the slug doesn't match a
competition. **The response shape depends on `competition.format`.**

`format = 'none'` — **`404`**, with
`{ "error": "This competition has no standings; its scoring is maintained elsewhere." }`. A
no-scoring competition is scored by a third party and has neither teams nor enrolments, so neither
standings shape applies; the route says so rather than returning a misleading empty array.

`format = 'team'` — team standings, backed by `getCompetitionStandingsData` in
`packages/db/src/queries/competition-tournament.ts`: one row per team with match/game records,
points, and score ratio.

`format = 'solo'` — per-player standings, backed by `getSoloCompetitionStandingsData` in
`packages/db/src/queries/competition-solo.ts`, ordered by `totalMvp` descending:

```jsonc
[
  {
    "rank": 1,
    "playerId": "…",
    "iplId": "#1234567",
    "callsign": "SHRAPNEL",
    "handicap": 0, // whole number, may be negative
    "totalMvp": 312.5, // best-N sum + handicap * gamesCounted
    "gamesCounted": 24, // at most 30
    "totalGames": 47, // every non-excluded game played
    "avgMvp": 11.4, // over ALL games, handicap-free; null if none
    "avgScore": 38915.2, // over ALL games; null if none
  },
]
```

See [Competition_Structure.md](Competition_Structure.md#solo-competitions) for how the counted set
and the handicap are defined. Note that `avgMvp * gamesCounted` is deliberately not `totalMvp`.

---

## Game slugs

`GET /api/games` and the video routes identify a game by its **slug**:

```
{countryCode}-{siteCode}-{YYYYMMDDHHmmss}
```

For example `4-23-20260808212334` — center `4-23`, game starting `2026-08-08 21:23:34` local
center time. This is **the same string used in game page URLs**
(`/games/4-23-20260808212334`), so a slug from either source works anywhere one is accepted.

Parsing goes through `parseGameSlug` in `packages/db/src/lib/game-slug.ts`, the single inverse of
the `concat(...)` expression that builds these SQL-side. Lookup for the video routes is
`getGameBySlug` in `packages/db/src/queries/videos.ts`, which covers both SM5 and Laserball
games (the per-type `getGameDetailBySlug` / `getLbGameDetailBySlug` filter by type).

## `POST /api/videos`

Attaches a YouTube link to a game (scoreboard/arena cam) or to one player's performance in that
game (POV footage). Intended for external capture tooling.

**This is the only authenticated, mutating route in the API.** It requires a key issued at
`/admin/api-keys` by a superAdmin:

```
Authorization: Bearer lfs_xxxxxxxxxxxxxxxxxxxx
```

The value is the entire `lfs_…` string shown once at creation — there is no separate id to pair
with it. The `Bearer` prefix is matched **case-sensitively**, so send it capitalised exactly as
above; a lowercase `bearer` is rejected with `401 Missing API key`. (The header _name_ is
case-insensitive, as usual.)

Keys are global — a valid key may post for any center. Keys can be revoked, after which they are
rejected immediately.

### Request body

| Field               | Required | Description                                                                        |
| ------------------- | -------- | ---------------------------------------------------------------------------------- |
| `game_slug`         | yes      | Game slug, e.g. `4-23-20260808212334`                                              |
| `youtube_url`       | yes      | `youtu.be/…`, `/watch?v=…`, `/shorts/…`, `/embed/…`, or `/live/…`                  |
| `ipl_id`            | no       | Player's IPL id (e.g. `#1234567`). Omit for a game-level video.                    |
| `label`             | no       | Free text, e.g. `Arena Cam 2`                                                      |
| `start_seconds`     | no       | Non-negative integer offset where playback begins; overrides the URL's. See below. |
| `game_start_offset` | no       | Non-negative integer offset where the game clock hits 0:00. See below.             |
| `overwrite`         | no       | `true` rewrites an already-linked video instead of no-opping. Default `false`.     |

```json
{
  "game_slug": "4-23-20260808212334",
  "youtube_url": "https://youtu.be/dQw4w9WgXcQ?t=1h2m3s",
  "ipl_id": "#1234567",
  "label": "Red Commander POV",
  "game_start_offset": 3800,
  "overwrite": true
}
```

### Start offsets

A center often publishes one multi-hour recording covering a whole night rather than a clip per
game, so a link is only useful if it jumps to where the game starts.

Any start time in `youtube_url` is parsed and stored, and every link LFstats renders is rebuilt
with it. Both of YouTube's forms are accepted, on `?t=`, `?start=`, or a legacy `#t=` fragment:
bare seconds (`3675`, `3675s`) and durations (`1h2m3s`, `2m30s`, `1h30m`).

`start_seconds` sets the offset directly and wins over whatever the URL carries — for a tool that
computes offsets into a long recording, it's simpler than rewriting the URL. An unparseable offset
in the URL is ignored rather than failing the request; an invalid `start_seconds` is a `400`.

Neither offset is part of the uniqueness key, so a corrected offset for a video already linked to
a game is an update (see below), never a second copy of the same link.

### `game_start_offset` — where the game actually starts

`start_seconds` is where the viewer is dropped in. `game_start_offset` is where the **game clock
hits 0:00**. They differ whenever a link deliberately opens early to catch preroll worth watching:

```
0:00        video start
1:41:00  ── start_seconds     = 6060   (opens on the huddle)
1:42:30  ── game_start_offset = 6150   (game clock 0:00)
```

**Both are measured from the start of the video**, so `game_start_offset` is _not_ "seconds of
preroll" — the preroll is the gap between them. Timing it absolutely means re-cutting how much
preroll a link opens on never invalidates the game start.

- Whole non-negative seconds. `400` otherwise, and `400` if `game_start_offset < start_seconds`.
- `0` is meaningful and preserved — a recording that opens exactly on the starting horn. (A
  `start_seconds` of `0` is stored as `null`, since "starts at the beginning" is the absence of an
  offset.)
- Omitted leaves it `null`. It is never inferred from the URL; only this field sets it.

It exists to anchor replay-to-video sync — `videoPosition = game_start_offset + gameClockSeconds`
— though nothing consumes it that way yet. Today it drives a "Game @ h:mm:ss" link on the game
page's Videos tab.

### Idempotency and `overwrite`

Re-posting the same video for the same game and player is a no-op by default: the stored row is
returned untouched with `200` and `"created": false`. This is enforced by a
`UNIQUE NULLS NOT DISTINCT (game_id, player_id, youtube_video_id)` constraint, so retries and
re-runs are safe and won't clutter the game page with duplicates.

`"overwrite": true` makes that conflict an update instead: `youtube_url`, `start_seconds`,
`game_start_offset` and `label` are rewritten from the request. Use it when re-running a tool with
corrected data — a resynced start offset, a fixed label. Note that this rewrites from the request
wholesale: omitting `game_start_offset` on an overwrite clears a value already stored, so re-send
every field you want kept. `created_at` and the original creator are preserved, since
this is the same link being corrected rather than a new one.

`"updated"` in the response distinguishes a real change from a no-op — re-posting identical data
with `overwrite: true` still reports `"updated": false`.

Overwrite is scoped to the matching `(game, player, video)` row. It never touches _other_ videos
on the game, so it can't clobber a second arena cam or another player's POV footage.

### Responses

| Status | Meaning                                                                        |
| ------ | ------------------------------------------------------------------------------ |
| `201`  | Video created (`"created": true`)                                              |
| `200`  | Video already existed — updated (`"updated": true`) or unchanged               |
| `400`  | Missing/invalid field, unparseable YouTube URL, or malformed JSON body         |
| `401`  | Missing, unknown, or revoked API key                                           |
| `404`  | Game not found, or `ipl_id` belongs to a player with no scorecard in that game |

```json
{
  "id": "2c77bbbf-0ade-4e67-afbb-092a46ae80cc",
  "game_slug": "4-23-20260808212334",
  "ipl_id": null,
  "youtube_url": "https://youtu.be/dQw4w9WgXcQ?t=1h2m3s",
  "start_seconds": 3723,
  "game_start_offset": 3800,
  "label": "Arena Cam",
  "created": true,
  "updated": false
}
```

Note the `404` on `ipl_id`: a POV video may only be attached to someone who actually played the
game, so a mistyped id belonging to a real player elsewhere is rejected rather than silently
mis-attributed.

## `GET /api/videos`

Unauthenticated. Lists the videos attached to a game, so a tool can check what it already
uploaded.

### Query parameters

| Param       | Required | Description                           |
| ----------- | -------- | ------------------------------------- |
| `game_slug` | yes      | Game slug, e.g. `4-23-20260808212334` |

### Response

```json
{
  "data": [
    {
      "id": "819a5295-f52d-4000-97db-1ed841d3cb83",
      "ipl_id": null,
      "callsign": null,
      "youtube_url": "https://youtu.be/dQw4w9WgXcQ?t=3675",
      "youtube_video_id": "dQw4w9WgXcQ",
      "start_seconds": 3675,
      "game_start_offset": 3750,
      "label": "Scoreboard Cam",
      "source": "api",
      "created_at": "2026-08-06T20:47:22.688Z"
    }
  ]
}
```

`ipl_id`/`callsign` are `null` for game-level videos and populated for player POV videos.
`source` is `admin` (added through the game page UI) or `api` (posted through this endpoint).
`start_seconds` is the normalized playback offset (see [Start offsets](#start-offsets)) and is
`null` when the video has none; `game_start_offset` is where the game clock hits 0:00 (see
[`game_start_offset`](#game_start_offset--where-the-game-actually-starts)) and is `null` when
unset. Both count from the start of the video. `youtube_url` is the URL exactly as submitted.

`400` if `game_slug` is absent, `404` if it doesn't resolve to a game.

---

## Conventions for new routes

- Default to no auth — every route here is public except `POST /api/videos`, which needs a
  Bearer API key because it writes. Follow that precedent for any future mutating route.
- Request and response bodies use `snake_case` field names, not the `camelCase` used internally.
- Query logic belongs in `packages/db/src/queries/`, never inline in `app/api/**/route.ts`.
- Prefer `NextResponse.json({ data })` for list endpoints; a 404 with `{ "error": "Not found" }`
  for single-resource lookups that can miss.
- Add new routes to this file when they're added.
