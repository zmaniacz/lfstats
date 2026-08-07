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

## `GET /api/players/averages`

Returns overall and per-position career averages for every player. Defined in
`apps/web/src/app/api/players/averages/route.ts`, backed by `getPlayerOverallAverages` in
`packages/db/src/queries/players.ts`. No query parameters. Response: `{ "data": [...] }`, one
object per player (`player_IPL_ID`, `player_name`, MVP/accuracy/games-played/games-won broken out
overall and per position — commander/heavy/scout/ammo/medic).

---

## `GET /api/games/[gameId]/replay`

Full SM5 replay data (events, per-tick player states, non-player actors) for one game, keyed by
internal `gameId` (UUID), not the public game slug. Defined in
`apps/web/src/app/api/games/[gameId]/replay/route.ts`, backed by `getGameReplayData` in
`packages/db/src/queries/games.ts`. Returns `404` with `{ "error": "Not found" }` for an unknown
`gameId`.

## `GET /api/laserball/games/[gameId]/replay`

Laserball equivalent of the above — backed by `getLbGameReplayData` in
`packages/db/src/queries/laserball.ts`.

---

## `GET /api/competitions/[slug]/stats`

Per-player stats for a competition, keyed by competition slug. Backed by
`getCompetitionPlayerStats` in `packages/db/src/queries/competitions.ts`. `404` if the slug
doesn't match a competition.

## `GET /api/competitions/[slug]/schedule`

Competition schedule (rounds/matches), keyed by competition slug. Backed by
`getCompetitionSchedule`. `404` if the slug doesn't match a competition.

## `GET /api/competitions/[slug]/standings`

Competition standings/leaderboard, keyed by competition slug. Backed by
`getCompetitionStandingsData`. `404` if the slug doesn't match a competition.

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

| Field           | Required | Description                                                                    |
| --------------- | -------- | ------------------------------------------------------------------------------ |
| `game_slug`     | yes      | Game slug, e.g. `4-23-20260808212334`                                          |
| `youtube_url`   | yes      | `youtu.be/…`, `/watch?v=…`, `/shorts/…`, `/embed/…`, or `/live/…`              |
| `ipl_id`        | no       | Player's IPL id (e.g. `#1234567`). Omit for a game-level video.                |
| `label`         | no       | Free text, e.g. `Arena Cam 2`                                                  |
| `start_seconds` | no       | Non-negative integer offset; overrides any offset in the URL. See below.       |
| `overwrite`     | no       | `true` rewrites an already-linked video instead of no-opping. Default `false`. |

```json
{
  "game_slug": "4-23-20260808212334",
  "youtube_url": "https://youtu.be/dQw4w9WgXcQ?t=1h2m3s",
  "ipl_id": "#1234567",
  "label": "Red Commander POV",
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

The offset is deliberately **not** part of the uniqueness key, so a corrected offset for a video
already linked to a game is an update (see below), never a second copy of the same link.

### Idempotency and `overwrite`

Re-posting the same video for the same game and player is a no-op by default: the stored row is
returned untouched with `200` and `"created": false`. This is enforced by a
`UNIQUE NULLS NOT DISTINCT (game_id, player_id, youtube_video_id)` constraint, so retries and
re-runs are safe and won't clutter the game page with duplicates.

`"overwrite": true` makes that conflict an update instead: `youtube_url`, `start_seconds` and
`label` are rewritten from the request. Use it when re-running a tool with corrected data — a
resynced start offset, a fixed label. `created_at` and the original creator are preserved, since
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
      "label": "Scoreboard Cam",
      "source": "api",
      "created_at": "2026-08-06T20:47:22.688Z"
    }
  ]
}
```

`ipl_id`/`callsign` are `null` for game-level videos and populated for player POV videos.
`source` is `admin` (added through the game page UI) or `api` (posted through this endpoint).
`start_seconds` is the normalized offset (see [Start offsets](#start-offsets)) and is `null` when
the video has none; `youtube_url` is the URL exactly as submitted.

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
