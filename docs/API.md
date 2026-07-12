# Public API Reference

All routes are unauthenticated GET endpoints under `https://lfstats.com/api/`. They live in
`apps/web/src/app/api/**/route.ts` and are backed by query functions in `packages/db/src/queries/`.

---

## `GET /api/games`

Returns a list of played games (SM5 and/or Laserball) with a link to the raw TDF file in the
`lfstats-modern-archive` S3 bucket. Intended as a feed for external consumers to pull newly
played games without scraping the site.

Defined in `apps/web/src/app/api/games/route.ts`, backed by `getGamesForExport` in
`packages/db/src/queries/games.ts`.

### Query parameters

| Param        | Required | Format                   | Default              | Description                                    |
| ------------ | -------- | ------------------------ | -------------------- | ---------------------------------------------- |
| `start_date` | no       | `YYYY-MM-DD`             | 10 days before today | Inclusive start of the date range (local time) |
| `end_date`   | no       | `YYYY-MM-DD`             | today                | Inclusive end of the date range (local time)   |
| `game_type`  | no       | `sm5` \| `lb`            | both                 | Filter to one game type                        |
| `center`     | no       | center slug, e.g. `4-23` | all centers          | Filter to one center                           |

Games with `exclude = true` are always omitted. Competition games are included.

### Response

```json
{
  "data": [
    {
      "center_slug": "4-23",
      "timestamp": "2026-07-12T15:50:24.000Z",
      "game_type": "sm5",
      "tdf_url": "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com/4-23-20260712155024.tdf"
    }
  ]
}
```

Sorted by `timestamp` descending. `timestamp` is the game's stored local start time — no timezone
conversion is applied (see root `CLAUDE.md`'s "no UTC conversion" convention), but note that
`NextResponse.json` serializes JS `Date` values with a `Z` suffix regardless.

### Errors

`400` with `{ "error": "..." }` for an unparseable `start_date`/`end_date`, an invalid
`game_type`, or a `center` slug that doesn't match any center.

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

## Conventions for new routes

- No auth — all routes here are intentionally public.
- Query logic belongs in `packages/db/src/queries/`, never inline in `app/api/**/route.ts`.
- Prefer `NextResponse.json({ data })` for list endpoints; a 404 with `{ "error": "Not found" }`
  for single-resource lookups that can miss.
- Add new routes to this file when they're added.
