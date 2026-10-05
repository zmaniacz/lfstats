# Query API Specification (v1)

**Status:** Draft — not yet implemented  
**Audience:** implementers of the query API and the LFstats MCP server  
**Last Updated:** 2026-10

---

## Purpose

LFstats already has a small public API ([API.md](API.md)) built for fixed consumers: a game feed,
competition standings, replay data. Those routes return fixed shapes for fixed scopes.

This spec defines a **query API** for open-ended questions — the kind a person types into a chat
assistant:

- "Compare Shrapnel and Zen over the last year at Loveland."
- "Who are the top 5 medics by average MVP at 4-23?"
- "Who were the top 5 Heavy players at Internationals 2026 with at least 5 games?"
- "Find finals games at Internationals 2026 decided by under 1000 points."

The first consumer is an MCP server that exposes each endpoint as a tool. The API is also usable
directly over HTTP.

### Design goals

1. **A few composable tools, not one per question.** About six endpoints should cover most
   questions. New question types should usually need a new **metric** or **filter**, not a new
   endpoint.
2. **One shared scope object.** Every aggregate endpoint takes the same `scope` filter, so a model
   that has learned to scope one tool can scope all of them.
3. **Self-describing.** `GET /catalog` lists every metric, filter value and limit, with a
   definition for each. Tool descriptions are generated from it, so the API and the MCP server
   cannot disagree.
4. **Answers show their assumptions.** Each response echoes the resolved scope, such as "last
   year" turned into concrete dates. It also returns metric definitions and sample sizes, so the
   assistant can say what it measured rather than guess.
5. **Names are resolved explicitly, never guessed.** People ask about callsigns and center names,
   and callsigns are how users will mostly name players. The database keys on IPL ids and slugs.
   Every field that takes a player accepts a callsign directly and uses the same matching as
   `resolve`. A certain match is used. Anything uncertain comes back as an error listing the
   candidates, so the model asks the user instead of picking one.
6. **Same numbers as the website.** Each metric uses the same SQL as the matching site leaderboard,
   so a chat answer matches the page it would link to.

### Changes from the initial proposal

The draft this builds on proposed `leaderboard_slice` and `search_games_summary`. Both survive as
[`leaderboard`](#post-leaderboard) and [`search_games`](#post-search_games), with these changes:

| Draft                                     | This spec                                                                | Why                                                                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id: 84`                            | `scope.competitions: ["internationals_2026"]`                            | LFstats ids are UUIDs and slugs; there is no integer event id. Slugs are what users see in URLs.                                                                                                                            |
| `role: "Commander"`                       | `scope.positions: ["commander"]`                                         | Matches the schema's term (`sm5_scorecard.position`) and accepts a list.                                                                                                                                                    |
| `sort_by: "avg_score"` (free string)      | `sort_by` must be a metric id from the catalog                           | Unknown ids are rejected with a list of valid ones instead of being silently ignored.                                                                                                                                       |
| `kd_ratio`                                | `hit_diff`                                                               | SM5 has no kill/death stat. The closest stored equivalent is `hit_diff` (tags given ÷ tags received).                                                                                                                       |
| `player_ids: ["4-12-345"]`                | `ipl_id` (`#xxxxxxx`)                                                    | IPL ids are the canonical key. Member ids (`4-3-1137`) are accepted anywhere a player is.                                                                                                                                   |
| `red_commander`, `green_commander` fields | `teams[]`, each with its true colour and an optional per-position roster | Teams are not always red/green, and the legacy data's "green" was really Blue/Ice in many games (see [Legacy colour note](#teams-and-colours)). An array also handles games that do not have exactly two non-neutral teams. |
| No name lookup                            | [`resolve`](#post-resolve)                                               | Without it, the model has to guess ids, which causes most wrong answers.                                                                                                                                                    |
| No player comparison                      | [`player_stats`](#post-player_stats) with `breakdown` and `head_to_head` | "Compare X and Y" was the first example question.                                                                                                                                                                           |
| No game drill-down with stats             | [`game_detail`](#get-gamesslug)                                          | The existing `GET /api/games/[slug]` returns the roster only, not how anyone played.                                                                                                                                        |

---

## Architecture

```
            ┌──────────────┐        ┌──────────────────────────────┐
LLM client ─┤  MCP server  ├──┐     │  apps/web                    │
            └──────────────┘  │     │  /api/query/v1/*  (HTTP)     │
                              ├───► │  /mcp             (MCP, HTTP)│
 HTTP client ─────────────────┘     └──────────────┬───────────────┘
                                                   │  same functions
                                    ┌──────────────▼───────────────┐
                                    │ packages/db/src/queries/      │
                                    │   analytics/                  │
                                    │     scope.ts    (scope → SQL) │
                                    │     metrics.ts  (registry)    │
                                    │     leaderboard.ts …          │
                                    │ packages/db/src/schemas/      │
                                    │   query-api.ts (zod; source   │
                                    │   of HTTP validation, JSON    │
                                    │   Schema and MCP tool schema) │
                                    └──────────────────────────────┘
```

- **The query logic lives in `packages/db/src/queries/analytics/`**, as [API.md](API.md#conventions-for-new-routes)
  requires ("Query logic belongs in `packages/db/src/queries/`"). The HTTP routes and the MCP tools
  are thin adapters over the same functions. The MCP server does not call the HTTP API, which
  avoids a second network hop and a second copy of the error handling.
- **Request schemas are zod** (new dependency, v4, for `z.toJSONSchema`). One schema per endpoint
  serves three purposes: HTTP body validation, the published JSON Schema, and the MCP tool
  `inputSchema`.
- **The MCP endpoint is served by the web app** at `/mcp` using streamable HTTP. It uses the same
  deployment as the website ([build-and-deploy.md](build-and-deploy.md)), so there is no new
  service to run. A stdio wrapper for local development can come later.
- **`analytics/scope.ts` extends the existing `GameScopeFilter`**
  ([`queries/scope.ts`](../packages/db/src/queries/scope.ts)). It does not replace it. The site's
  social/competition split stays the single source of truth for that rule.

---

## Conventions

These follow [API.md](API.md#conventions-for-new-routes) unless stated otherwise.

- **Base path:** `/api/query/v1/`. Breaking changes require `/v2/`. Adding a metric, filter field,
  response field or enum value is not breaking. Clients must ignore unknown response fields.
- **Method:** `POST` with a JSON body for queries, because scopes are nested and too long for
  query strings. `GET` for the catalog and single-game lookups.
- **Field names:** `snake_case` everywhere.
- **Strict input:** an unknown request field is a `400`, not silently ignored. Models invent
  parameters, and a dropped filter returns a confident wrong answer. See [Errors](#errors).
- **Identifiers:**
  - player — `ipl_id` (`#1234567`; the `#` is optional on input) **or** member id (`4-3-1137`).
    Responses always identify players by `ipl_id` and also include `member_id` when known. See
    [Player identifiers](#player-identifiers).
  - center — center slug (`4-23`)
  - competition — competition slug (`internationals_2026`)
  - game — game slug (`4-23-20260808212334`, see [Game slugs](API.md#game-slugs))
  - Internal UUIDs never appear in this API.
- **Times:** center-local, no timezone conversion, as everywhere in LFstats. Dates are
  `YYYY-MM-DD`. Timestamps are ISO-8601 strings **without** a `Z` suffix. The serializer must format
  them explicitly. `NextResponse.json` adds a misleading `Z` to `Date` values, as noted in API.md.
- **Numbers:** averages are returned unrounded as JSON numbers. Rounding is a presentation choice.
  Rates (`win_rate`, `accuracy`, `uptime_pct`) are fractions in `[0, 1]`, not percentages.
- **Auth: an API key is required on every request**, including `GET /catalog` and the `/mcp`
  endpoint. This deliberately departs from the unauthenticated public routes in API.md: these
  endpoints run arbitrary-scope aggregates and are the easiest way to put load on the server. Keys
  use the existing `api_key` table and the `/admin/api-keys` page, sent the same way as for
  `POST /api/videos`:

  ```
  Authorization: Bearer lfs_xxxxxxxxxxxxxxxxxxxx
  ```

  A missing, unknown or revoked key is a `401` before any query runs. Keys are global, not scoped
  to a center. Rate limits and usage logging are per key (see [Limits](#limits-and-safety)).
  Keys need a scope so a video-upload key cannot query and a query key cannot post videos. Add a
  `scopes text[]` column to `api_key` (`video:write`, `query:read`), defaulting existing keys to
  `{video:write}`.

### Response envelope

Every endpoint returns:

```jsonc
{
  "data": [ ... ],            // or an object, for single-resource endpoints
  "meta": {
    "scope": { ... },         // the resolved scope: presets expanded, defaults filled in
    "metrics": {              // a definition for every metric id that appears in `data`
      "avg_mvp": { "label": "Average MVP", "definition": "Mean of sm5_scorecard.mvp_points per game. Includes escalated penalty MVP deductions.", "unit": "points" }
    },
    "row_count": 5,
    "truncated": false,       // true if `limit` cut off further rows
    "next_cursor": null,      // paginated endpoints only
    "warnings": [],           // e.g. "3 of 5 players are below min_games for position=medic"
    "data_as_of": "2026-10-04T21:13:07",  // newest ingested game start time in scope
    "links": { "web": "https://lfstats.com/…" }  // closest site page, when one exists
  }
}
```

`meta.scope` and `meta.metrics` let the assistant answer correctly ("over 2025-10-04 to
2026-10-04, at Loveland, social and competitive games, average MVP…"). The MCP tool descriptions
should tell the model to use them.

---

## The `scope` object

All aggregate endpoints (`leaderboard`, `player_stats`, `search_games`) accept this object.
Every field is optional. An empty scope means every non-excluded SM5 game ever recorded.

```jsonc
{
  "game_type": "sm5", // "sm5" | "lb". Default "sm5".
  "centers": ["4-23"], // center slugs; OR'd
  "competitions": ["internationals_2026"], // competition slugs; OR'd
  "game_kind": "all", // "all" | "social" | "competitive". Default "all".
  "round_types": ["finals"], // pool | finals | split-pool | wildcard. Needs `competitions`.
  "date_range": {
    // either a preset or from/to, not both
    "preset": "last_365_days",
    "from": "2025-10-04", // inclusive, center-local
    "to": "2026-10-04", // inclusive, center-local
  },
  "positions": ["medic"], // sm5 only; commander|heavy|scout|ammo|medic; OR'd
  "team_result": "win", // "win" | "loss" | "draw" — only the player's own team's result
  "include_mercenary_games": null, // see below
  "include_excluded": false, // admin-excluded / aborted games. Default false.
}
```

### Field semantics

| Field                     | Maps to                                                                          | Notes                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `game_type`               | `game.type`                                                                      | Selects the scorecard table (`sm5_scorecard` or `lb_scorecard`) and which metrics are valid.                                                                                                                                                                                                                                         |
| `centers`                 | `game.center_id`                                                                 | Center slug, not name. Use [`resolve`](#post-resolve) for names ("Loveland" → `4-19`).                                                                                                                                                                                                                                               |
| `competitions`            | `game.competition_id`                                                            | Uses `game.competition_id` directly, so `solo` and `none` format competitions work too. This differs from the team leaderboards, which select through `competition_match_game`.                                                                                                                                                      |
| `game_kind`               | `game.competition_id IS NULL` (social) / `game.competition.type = 'competitive'` | `"competitive"` means the game belongs to a competition with `type = 'competitive'`. A game in a `social`-type competition counts as neither social nor competitive. It only appears under `"all"` or when its slug is given in `competitions`.                                                                                      |
| `round_types`             | `competition_round.type` via `competition_match_game → competition_match`        | Only `team`-format competitions have rounds. Without `competitions`, it is a `400`.                                                                                                                                                                                                                                                  |
| `date_range.preset`       | —                                                                                | `last_30_days`, `last_90_days`, `last_365_days`, `this_year`, `last_year` (previous calendar year), `all_time`. Resolved against the **server's** current date and echoed as `from`/`to` in `meta.scope`.                                                                                                                            |
| `date_range.from` / `to`  | `game.start_time`                                                                | Uses the same inclusive-day logic as [`dateRangeConditions`](../packages/db/src/queries/scope.ts).                                                                                                                                                                                                                                   |
| `positions`               | `sm5_scorecard.position`                                                         | `1` commander, `2` heavy, `3` scout, `4` ammo, `5` medic. This filters scorecards, so "a player's medic games". It does not filter games. `400` for `lb`.                                                                                                                                                                            |
| `team_result`             | `sm5_game_team.result` / `lb_game_team.result` of the scorecard's own team       | Answers questions like "average MVP in wins".                                                                                                                                                                                                                                                                                        |
| `include_mercenary_games` | `sm5_scorecard.is_mercenary`                                                     | `null` (default) means **false when `competitions` is set, otherwise true**. This matches both rules on the site: competition aggregates exclude mercenary scorecards ([Core_Schema.md](Core_Schema.md)), but a player's merc games are still their own games. The resolved value is echoed.                                         |
| `include_excluded`        | `game.exclude`                                                                   | Default `false`, per Core_Schema ("omitted from all aggregates and leaderboards"). The analytics scope always applies it. (Some existing site queries, such as `getPlayerAvgMvpByPosition`, currently omit it. That is a bug, tracked separately, and must be fixed before the leaderboard parity check in the implementation plan.) |

**Always applied, not configurable:**

- Neutral teams are ignored for team results and margins (`is_neutral = false`).
- Guests (`player_id IS NULL`) are left out of anything grouped by player, because they have no
  stable identity ([API.md](API.md#entity-groups)). They do still count in game-level fields such as
  team scores.

---

## Metric registry

Metrics are the main extension point. Each one is a registry entry in
`packages/db/src/queries/analytics/metrics.ts`:

```ts
type MetricDef = {
  id: string; // "avg_mvp"
  label: string; // "Average MVP"
  definition: string; // one sentence, shown to the model and echoed in meta.metrics
  game_types: ("sm5" | "lb")[];
  positions: Position[] | "all"; // where the metric is meaningful (see "Position-specific metrics")
  unit: "count" | "points" | "ratio" | "fraction" | "ms" | "per_game";
  higher_is_better: boolean; // sets the default sort direction
  sql: (sc: ScorecardAlias, ctx: MetricCtx) => SQL; // aggregate expression over scorecards in scope
};
```

Adding a metric means adding one entry. Every endpoint, the catalog, the validation enum and the
MCP tool schema pick it up automatically.

### How aggregates are computed

The registry fixes one aggregation per metric, chosen to match the website:

- **Per-game stats** (`mvp`, `score`, `accuracy`, `hit_diff`) are the **mean of the per-game
  values**: `avg(sm5_scorecard.accuracy)`. They are not ratios of sums. This matches
  `getCompetitionTopPlayersByPosition` and the player pages. If a ratio of sums is ever needed, it
  gets its own id (e.g. `pooled_accuracy`). An existing id never changes meaning.
- **Counts** come in two forms where both are useful: `total_x` (sum) and `avg_x` (mean per game).
- **`win_rate`** is `wins / games`, where draws count as games but not wins.

### v1 catalog — SM5

| id                     | Definition                                                       | Positions        |
| ---------------------- | ---------------------------------------------------------------- | ---------------- |
| `games`                | Number of scorecards in scope                                    | all              |
| `wins`                 | Games where the player's team `result = 'win'`                   | all              |
| `win_rate`             | `wins / games`                                                   | all              |
| `avg_mvp`              | Mean `mvp_points`. Includes escalated penalty MVP deductions.    | all              |
| `total_mvp`            | Sum of `mvp_points`                                              | all              |
| `avg_score`            | Mean `score`. Penalty-free, per the scorecard convention.        | all              |
| `avg_accuracy`         | Mean `accuracy` (fraction)                                       | all              |
| `avg_hit_diff`         | Mean `hit_diff`                                                  | all              |
| `avg_uptime_pct`       | Mean of `uptime / (uptime + resupply_downtime + other_downtime)` | all              |
| `avg_shots_hit`        | Mean `shots_hit`                                                 | all              |
| `avg_times_hit`        | Mean `times_hit`                                                 | all              |
| `avg_medic_hits`       | Mean `medic_hits`                                                | all              |
| `avg_missiles_hit`     | Mean `missiles_hit_opponent`                                     | commander, heavy |
| `avg_eliminations`     | Mean `eliminated_opponent`                                       | all              |
| `avg_assists`          | Mean `assists`                                                   | all              |
| `avg_nukes_detonated`  | Mean `nukes_detonated`                                           | commander        |
| `avg_nukes_canceled`   | Mean `nukes_canceled`                                            | all              |
| `avg_lives_left`       | Mean `lives_left`                                                | all              |
| `elimination_rate`     | Share of games where the player was eliminated                   | all              |
| `avg_resupplies_given` | Mean `resupplies_given`                                          | ammo, medic      |
| `avg_rapid_fire`       | Mean `rapid_fire` activations                                    | scout            |
| `avg_penalties`        | Mean `penalties`                                                 | all              |

### v1 catalog — Laserball

`games`, `wins`, `win_rate`, `avg_goals`, `total_goals`, `avg_assists` (`assists1 + assists2`),
`avg_steals`, `avg_blocks`, `avg_clears`, `avg_passes`, `avg_possession_ms`. Laserball has no
positions, so every metric applies to every player
([Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md)).

### Position-specific metrics

Some columns are `null` for positions they do not apply to (see
[Scorecard_Table_Spec.md](Scorecard_Table_Spec.md)). SQL `avg()` skips nulls, so `avg_nukes_detonated`
over all positions quietly becomes "per commander game". To prevent that:

- If `scope.positions` is set and none of the listed positions match a metric's `positions`, the
  request is a `400`.
- If `scope.positions` is unset, a position-specific metric is computed over the matching positions
  only. A warning is added: `"avg_nukes_detonated is computed over commander games only"`.

### Global rating

The Bradley–Terry rating ([Player_Rating.md](Player_Rating.md)) is a precomputed global number, so
it is **not** a scope-able metric. Applying `scope` to it would suggest a "rating at Loveland" that
does not exist. `player_stats` returns it as a separate `rating` block. A `leaderboard` sorted by
rating (empty scope only) is deferred: the site's rankings page already answers "who is ranked
highest", and `sort_by: "rating"` is currently an `invalid_metric`.

---

## Endpoints

| Endpoint             | Answers                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `GET  /catalog`      | What can I ask? Metrics, enums, presets, limits.                  |
| `POST /resolve`      | Which player, center or competition does this name mean?          |
| `POST /leaderboard`  | Who is best at X within scope S?                                  |
| `POST /player_stats` | How did these 1–10 players do within S? Breakdowns, head-to-head. |
| `POST /search_games` | Which games match these conditions?                               |
| `GET  /games/{slug}` | What happened in this one game, with per-player stats?            |

### `GET /catalog`

No parameters. Returns the metric registry, the enum values for every `scope` field, the date
presets, server `today`, and limits. The MCP server uses this to build tool descriptions. A model
can call it as the `describe` tool when unsure.

```jsonc
{
  "data": {
    "api_version": "1.0",
    "today": "2026-10-04",
    "game_types": ["sm5", "lb"],
    "positions": ["commander", "heavy", "scout", "ammo", "medic"],
    "round_types": ["pool", "finals", "split-pool", "wildcard"],
    "date_presets": [
      "last_30_days",
      "last_90_days",
      "last_365_days",
      "this_year",
      "last_year",
      "all_time",
    ],
    "metrics": [
      {
        "id": "avg_mvp",
        "label": "Average MVP",
        "definition": "…",
        "game_type": "sm5",
        "positions": "all",
        "unit": "points",
        "higher_is_better": true,
      },
    ],
    "defaults": { "min_games": 10, "leaderboard_limit": 10 },
    "limits": {
      "resolve_max_queries": 10,
      "resolve_max_matches": 5,
      "leaderboard_max_limit": 100,
      "leaderboard_max_metrics": 10,
      "leaderboard_max_min_games": 1000,
      "rate_limit_per_minute": 60,
      "rate_limit_per_day": 2000,
    },
  },
}
```

The catalog also lists `game_kinds` and `team_results`. It needs no database access.

---

### `POST /resolve`

Turns names into ids. Centers and competitions must be passed to other endpoints as slugs, so
resolve those first. Players can be passed by callsign directly (see
[Player identifiers](#player-identifiers)), but `resolve` is still the way to look a player up or
to show the user candidates before querying.

```jsonc
// request
{
  "players": ["shrapnel", "zen"],
  "centers": ["loveland"],
  "competitions": ["internationals 2026"],
}
```

```jsonc
// response
{
  "data": {
    "players": [
      {
        "query": "shrapnel",
        "status": "unique", // "unique" | "ambiguous" | "not_found"
        "matches": [
          {
            "ipl_id": "#1234567",
            "member_id": "4-19-24329", // null if never recorded
            "callsign": "SHRAPNEL",
            // current_callsign | previous_callsign | ipl_id | member_id | similar_callsign
            "matched_on": "current_callsign",
            "home_center": { "slug": "4-19", "name": "Loveland" }, // center with the most games
            "games_played": 1873, // SM5 + Laserball, non-excluded
            "last_played": "2026-09-28",
          },
        ],
      },
      {
        "query": "zen",
        "status": "ambiguous",
        // up to 5, best first; fuzzy matches add "similarity": 0–1
        "matches": [/* … */],
      },
      {
        "query": "9-9-99999",
        "status": "not_found",
        "matches": [],
        "hint": "Member ids are only recorded for players seen in newer game files…",
      },
    ],
    "centers": [
      {
        "query": "loveland",
        "status": "unique",
        "matches": [
          {
            "slug": "4-19",
            "name": "Loveland",
            "short_name": "LOV",
            "city": null,
            "country": null,
          },
        ],
      },
    ],
    "competitions": [
      {
        "query": "internationals 2026",
        "status": "unique",
        "matches": [
          {
            "slug": "internationals_2026",
            "name": "Internationals 2026",
            "type": "competitive",
            "format": "team",
            "category": "internationals",
            "state": "completed",
            "start_date": "2026-06-12",
            "end_date": "2026-06-15",
            "host_center": "4-19",
          },
        ],
      },
    ],
  },
}
```

**Matching order:**

1. Exact id or slug. A player query starting with `#` is an IPL id. One shaped like `^\d+-\d+-\d+$`
   is a member id. A center query shaped like `^\d+-\d+$` is a slug. A competition query is
   compared with the slug exactly.
2. Exact name, ignoring case and surrounding whitespace: the current callsign; the center's name,
   short name or city; the competition's name, or its slug with `_` read as spaces.
3. Exact previous callsign (`player_callsign_history`), players only.
   A player query that looks like an IPL id typed without its `#` (4–10 letters and digits) is
   tried as `#query` only after steps 2 and 3 find nothing, so a real callsign always wins.
4. Trigram similarity via `pg_trgm` (migration `0052`, which adds GIN trigram indexes on
   `player.current_callsign`, `player_callsign_history.callsign`, `center.name` and
   `competition.name`). The cutoff is 0.3, or 0.2 for queries of 5 characters or fewer, because
   short names have so few trigrams that one typo drops them under 0.3 ("Brw" vs "Brew" scores
   0.29). It is applied with `SET LOCAL` so the `%` operator, and its index, still apply.

Matching stops at the first step with any result. Exactly one match from steps 1–3 is `unique`.
Several matches, or any match from step 4, are `ambiguous`: even a single close fuzzy match is
returned for the user to confirm. Fuzzy matches are ordered by similarity, then by
`games_played`. A `not_found` result carries a `hint`.

**The tool description must tell the model:** when the status is `ambiguous`, ask the user which
one they mean (using `home_center` and `last_played` to tell candidates apart). Do not pick one.

Each list holds at most 10 queries.

#### Player identifiers

Users name players by **callsign** far more often than by id. Many also know their member id
(`{country}-{site}-{member}`, e.g. `4-3-1137`, the number on their membership card), but few know
their IPL id. So every field that takes a player (`player_stats.players`,
`search_games.players.include`, and later additions) accepts any of the three. Each value goes
through the same matching as `resolve`:

- **Certain match** — an id, or a callsign (current or previous) that exactly matches one player:
  used. `meta.resolved_players` echoes the mapping, e.g.
  `{ "brew": { "ipl_id": "#kzWkJy", "matched_on": "current_callsign" } }`, so the model can confirm
  who it reported on.
- **Uncertain** — several exact matches (two players called "Shadow"), or only fuzzy matches
  ("Brw", or "Mr Jo Gangle" for "Mr Jo Gangles"): the request fails with `400 ambiguous_player`.
  The error's `candidates` holds each uncertain input's matches, in the same shape as `resolve`
  returns them. The model asks the user which player they mean and retries with that `ipl_id`.
  Every uncertain input in a request is reported in one error, so one question covers them all.
- **No match** — `404 player_not_found`, with a hint.

```jsonc
{
  "error": {
    "code": "ambiguous_player",
    "message": "Not sure which player is meant by 'Shadow', 'Brw'.",
    "field": "players",
    "hint": "Ask the user which player they mean (home_center, games_played and last_played help tell them apart), then retry with that player's ipl_id.",
    "candidates": {
      "Shadow": [
        {
          "ipl_id": "#XdgrSnG",
          "callsign": "Shadow",
          "matched_on": "current_callsign",
          "home_center": { "slug": "3-3", "name": "…" },
          "games_played": 79,
          "…": "…",
        },
        {
          "ipl_id": "#xkTZLHL",
          "callsign": "Shadow",
          "matched_on": "current_callsign",
          "home_center": { "slug": "4-19", "name": "Loveland" },
          "games_played": 1,
          "…": "…",
        },
      ],
      "Brw": [
        {
          "ipl_id": "#kzWkJy",
          "callsign": "Brew",
          "matched_on": "similar_callsign",
          "similarity": 0.286,
          "…": "…",
        },
      ],
    },
  },
}
```

Caveats from [Core_Schema.md](Core_Schema.md) that the implementation must handle:

- `player.member_id` is **nullable**. It is only populated once the player appears in a TDF of
  version 2.006 or later, so a valid member id can still return `not_found` for a player only seen
  in older files. The `not_found` message should say this and suggest searching by callsign.
- It is set once and never overwritten, so each player has at most one stored member id.
- The column has no index and no unique constraint. The `resolve` migration adds a btree index on
  `player.member_id`. If two players ever share a member id, treat it as `ambiguous`, never as a
  silent pick.
- Guests have no `player` row, so they are never matched by member id or by callsign.

---

### `POST /leaderboard`

Ranks players by one metric within a scope. This is the draft's `leaderboard_slice`.

```jsonc
{
  "scope": {
    "centers": ["4-23"],
    "positions": ["medic"],
    "date_range": { "preset": "last_365_days" },
  },
  "sort_by": "avg_mvp",
  "order": null, // "asc" | "desc"; default from metric.higher_is_better
  "min_games": 10, // default 10; 1–1000 — games in `scope`
  "qualify": null, // optional extra eligibility rule, see below
  "limit": 5, // default 10; max 100
  "offset": 0,
  "metrics": ["games", "win_rate", "avg_accuracy"], // extra columns; sort_by is always included
  "percentiles": ["avg_accuracy"], // subset of metrics ∪ {sort_by}
  "group_by_position": false, // true → one row per (player, position)
}
```

```jsonc
{
  "data": [
    {
      "rank": 1,
      "ipl_id": "#1234567",
      "member_id": "4-19-24329",
      "callsign": "SHRAPNEL",
      "position": null, // set when group_by_position = true
      "avg_mvp": 14.21, // sort_by first, then games, then metrics
      "games": 48,
      "win_rate": 0.6875,
      "avg_accuracy": 0.412,
      "percentiles": { "avg_accuracy": 0.93 },
    },
  ],
  "meta": {
    "scope": {
      "...": "…",
      "include_mercenary_games": true,
      "date_range": { "from": "2025-10-04", "to": "2026-10-04" },
    },
    "qualify_scope": null, // the merged qualifying scope, when `qualify` is given
    "qualify_min_games": null,
    "sort": { "by": "avg_mvp", "order": "desc" },
    "min_games": 10,
    "population": 37, // players meeting min_games and qualify — the denominator for rank and percentiles
    "offset": 0,
    "metrics": { "…": "…" },
    "row_count": 1,
    "truncated": true, // more ranked players beyond this page
    "warnings": [],
    "data_as_of": "2026-09-28T21:14:02",
  },
}
```

- **Ranking:** players who meet `min_games` are ranked by `sort_by` using `RANK()`, so ties share a
  rank. The secondary sort is `games` descending, then `callsign`.
- **`min_games`** is applied after scoping. With `positions: ["medic"]` it means 10 medic games,
  not 10 games of which some were medic. A low default lets one great game top the board, and that
  produces the most misleading chat answers.
- **`qualify`** sets an eligibility rule over a **different** scope from the one being ranked.
  Use it for questions like "top medics by average MVP at 4-23, among players with at least 20
  games there in the last year":

  ```jsonc
  {
    "scope": { "centers": ["4-23"], "positions": ["medic"] },
    "sort_by": "avg_mvp",
    "min_games": 5,
    "qualify": {
      "min_games": 20,
      "scope": { "positions": null, "date_range": { "preset": "last_365_days" } },
    },
  }
  ```

  `qualify.scope` is **merged over** the main `scope`. Fields it sets replace the main scope's
  value, and `null` removes a filter. In the example the qualifying scope is "4-23, any position,
  last 365 days". A player must pass **both** rules: `min_games` in the ranked scope and
  `qualify.min_games` in the qualifying scope. The resolved qualifying scope is echoed as
  `meta.qualify_scope`. `qualify.scope` may not set `game_type`, because counting Laserball games to
  qualify for an SM5 board is never what was meant.

- **Percentiles** are `percent_rank()` within `population`, oriented so `1.0` is always best
  (inverted when `higher_is_better = false`). Players who fail `min_games` or `qualify` are not part of the
  population.
- **`group_by_position: true`** returns one row per (player, position) and applies `min_games` per
  row. It answers questions like "best scouts and best heavies in one list".
- **The callsign is `player.current_callsign`**, trimmed, not the callsign used at the time. The
  response is about people, not about scorecards.
- **A position-specific `sort_by`** (e.g. `avg_nukes_detonated`) narrows the ranked population to
  the metric's positions. `games` and `min_games` then count only those games, and `meta.scope`
  shows the narrowed positions, with a warning. Otherwise medics would be ranked on nulls.
- **`links.web`** is not implemented yet: site leaderboard URLs depend on filter cookies, so there
  is no stable link to give.
- **Laserball** leaderboards return `invalid_scope` until the Laserball metrics phase.

---

### `POST /player_stats`

Stats for 1–10 named players over the same scope. It covers "how is X doing" and "compare X and
Y".

```jsonc
{
  "players": ["shrapnel", "4-19-24329"], // callsigns, IPL ids or member ids
  "scope": { "centers": ["4-19"], "date_range": { "preset": "last_365_days" } },
  // default: games, win_rate, avg_mvp, avg_score, avg_accuracy, avg_hit_diff (games always included)
  "metrics": ["win_rate", "avg_mvp", "avg_accuracy", "avg_hit_diff"],
  "breakdown": ["position"], // up to 2 of: "position", "period", "center", "game_kind"
  "period": "quarter", // only with breakdown "period": "month" | "quarter" | "year" (default)
  "head_to_head": true, // only with exactly 2 distinct players
  "include_rating": true, // default true
  "include_baseline": true, // default true
  "baseline_min_games": 10, // games a player needs in a cell to count toward the baseline
}
```

```jsonc
{
  "data": {
    "players": [
      {
        "ipl_id": "#1234567",
        "member_id": "4-19-1137",
        "callsign": "SHRAPNEL",
        "overall": {
          "games": 212,
          "win_rate": 0.58,
          "avg_mvp": 11.9,
          "avg_accuracy": 0.39,
          "avg_hit_diff": 1.42,
        },
        "breakdown": [
          { "position": "commander", "games": 80, "win_rate": 0.61, "avg_mvp": 13.4, "…": "…" },
          { "position": "scout", "games": 74, "…": "…" },
        ],
        // null when the player is not in the current global ranking
        "rating": {
          "rank": 14,
          "of": 171, // players in the ranking
          "rating": 1.21,
          "standard_error": 0.08,
          "rating_group": 9,
          "games_played": 640,
          "wins": 371,
          "losses": 262,
          "draws": 7,
          "window_start": "2025-10-04",
          "window_end": "2026-10-04",
          "model_version": "bt-1",
        },
      },
    ],
    "baseline": {
      // everyone else in the same scope — the requested players are excluded
      "min_games": 10,
      "overall": { "players": 41, "games": 63.2, "avg_mvp": 8.7, "avg_accuracy": 0.34, "…": "…" },
      "breakdown": [{ "position": "commander", "players": 18, "avg_mvp": 10.2, "…": "…" }],
    },
    "head_to_head": {
      "games_together": 37,
      "as_teammates": { "games": 12, "wins": 9, "draws": 0, "losses": 3 },
      "as_opponents": {
        "games": 25,
        "record": { "#1234567": 14, "#7654321": 10, "draws": 1 }, // wins of each player's team
        "avg_mvp": { "#1234567": 12.8, "#7654321": 11.1 }, // in those 25 games only; null if 0
        "direct": {
          "#1234567": { "shots_hit": 214, "deactivations": 160, "missile_hits": 6 },
          "#7654321": { "shots_hit": 188, "deactivations": 131, "missile_hits": 3 },
        },
      },
      "recent_games": ["4-19-20260928201533", "…"], // up to 10 slugs, newest first
    },
  },
  "meta": {
    "scope": { "…": "…" },
    "resolved_players": { "4-19-24329": "#7654321" }, // only when a member id or bare id was given
    "breakdown": ["position"],
    "metrics": { "…": "…" },
    "row_count": 2,
    "truncated": false,
    "warnings": [],
    "data_as_of": "2026-09-28T21:14:02",
  },
}
```

- **Breakdown cells** are labelled as `position` (a position name), `period` (`"2026"`, `"2026-Q3"`
  or `"2026-07"`), `center` (`{ slug, name }`) and `game_kind` (`"social"`, `"competitive"`, or
  `"social_competition"` for a game in a social-type competition). Cells with zero games are
  omitted, and cells are sorted by their labels.
- **`baseline`** is included because a number without context ("11.9 average MVP") can't be
  interpreted. It holds the same metrics over **every other player** in the same scope and
  breakdown cell. The requested players are always excluded, so a comparison is never measured
  against itself. That matters most in small populations such as one competition. Values are
  computed per player and then averaged, so frequent players do not dominate. `games` in the
  baseline is therefore the average games per counted player. Only players with at least
  `baseline_min_games` games in that cell count, and each cell reports how many did (`players`).
  Since it excludes all requested players, there is one baseline per request, not one per player.
- **`rating`** is the global Bradley–Terry ranking from the active model. It ignores `scope`, and a
  warning says so whenever a player has none.
- **`head_to_head`** applies the scope's **game** filters only: centers, competitions, game kind,
  round types, dates and excluded games. `positions`, `team_result` and `include_mercenary_games`
  would have to apply to both players at once, which has no sensible meaning for a matchup. A
  warning appears when they are set. `direct` comes from `sm5_game_player_interaction`, summed over
  their games as opponents: the tags each player landed on the other. It is SM5 only.
- **A player with no games in scope** is returned with `overall.games = 0`, null metrics and a
  warning. It is not a `404`, because "X hasn't played at Loveland this year" is a valid answer.
  Fewer than 10 games gets a small-sample warning.
- **Players are matched** as described in [Player identifiers](#player-identifiers):
  `400 ambiguous_player` with candidates when uncertain, and `404 player_not_found` when nothing
  matches. The same player given twice (e.g. by callsign and by member id) is reported once.
- **`scope_too_broad`** (`422`) fires when the players' breakdown would exceed 500 cells, e.g.
  monthly × position over all time for several players.
- **Laserball** returns `invalid_scope` until the Laserball metrics phase.

---

### `POST /search_games`

Finds games and returns compact summaries. This is the draft's `search_games_summary`. Use it to
locate games, then use `GET /games/{slug}` to look at one in detail.

```jsonc
{
  "scope": { "competitions": ["internationals_2026"], "round_types": ["finals"] },
  "players": {
    // optional
    "include": ["shrapnel", "#7654321"], // up to 10 callsigns, IPL ids or member ids
    "match": "all", // "all" (default) | "any"
    "relation": "opponents", // "any" (default) | "teammates" | "opponents"; the last two need exactly 2 players
  },
  "max_margin": 1000, // effective-score gap between the top two non-neutral teams
  "min_margin": null,
  "outcomes": ["score", "elimination"], // game.outcome; default: all except aborted
  "sort": "start_time_desc", // start_time_desc | start_time_asc | margin_asc | margin_desc
  "limit": 20, // default 20; max 100
  "cursor": null,
  "fields": ["game_slug", "start_time", "center", "competition", "outcome", "margin", "teams"],
  "include_rosters": false, // true adds players[] (ipl_id, callsign, position, score, mvp) to each team
}
```

```jsonc
{
  "data": [
    {
      "game_slug": "4-19-20260614193012",
      "start_time": "2026-06-14T19:30:12",
      "center": { "slug": "4-19", "name": "Loveland" },
      "competition": {
        "slug": "internationals_2026",
        "round": "Finals",
        "round_type": "finals",
        "match_number": 3,
        "game_number": 2,
      },
      "outcome": "score",
      "margin": 640,
      "teams": [
        {
          "name": "Fire Team",
          "colour_enum": 2,
          "competition_team": "Denver Dragons",
          "score": 41200,
          "elimination_bonus": 0,
          "penalty_score": -1000,
          "effective_score": 40200,
          "result": "win",
        },
        {
          "name": "Ice Team",
          "colour_enum": 5,
          "competition_team": "Seattle Sharks",
          "score": 39560,
          "elimination_bonus": 0,
          "penalty_score": 0,
          "effective_score": 39560,
          "result": "loss",
        },
      ],
      "web_url": "https://lfstats.com/games/4-19-20260614193012",
    },
  ],
  "meta": {
    "scope": { "…": "…" },
    "resolved_players": { "shrapnel": { "ipl_id": "#1234567", "matched_on": "current_callsign" } },
    "sort": "margin_asc",
    "total_matches": 7, // every game matching the filters, across all pages
    "row_count": 1,
    "truncated": true, // more pages follow
    "next_cursor": "eyJzIjoibWFyZ2luX2FzYyIsInYiOiI2NDAiLCJpZCI6Ii4uLiJ9",
    "warnings": [],
    "data_as_of": "2026-09-28T21:14:02",
  },
}
```

- **`effective_score`** = `score + elimination_bonus + penalty_score`, as defined in
  [Core_Schema.md](Core_Schema.md). The margin is computed from effective scores.
- **`fields`** is a projection over `start_time`, `center`, `competition`, `outcome`, `margin`,
  `teams`, `excluded` and `web_url`. `game_slug` is always returned. Omitting `fields` returns all
  of them.
- **`teams`** lists non-neutral teams, best effective score first, each with `name`,
  `colour_enum`, `competition_team`, `score`, `elimination_bonus`, `penalty_score`,
  `effective_score`, `result` and `eliminated`. `include_rosters: true` (which needs `teams`) adds
  `players: [{ ipl_id, callsign, position, score, mvp, is_mercenary }]` to each team, highest score
  first. Guests have a null `ipl_id`.
- **`total_matches`** counts every matching game, so "how many times did X and Y play each
  other?" is one call with `limit: 1`.
- **`competition_team`** is the competition team name, joined through
  `competition_match_game.team{1,2}_game_team_id`. It is `null` for social games.
- **`scope.positions`** and **`scope.team_result`** filter scorecards, not games. Both are a `400`
  here unless `players` is set, in which case they apply to those players, as in "games where X
  played medic and lost". `scope.include_mercenary_games` does not apply to games and is ignored,
  with a warning.
- **`players.match: "all"`** requires every listed player to have played; `"any"` requires at
  least one. `relation` adds a same-team or opposing-team requirement for exactly two players.
  Players are matched by name as described in [Player identifiers](#player-identifiers).
- **`outcomes`** defaults to every outcome except `aborted`. Aborted games are excluded at ingest
  anyway, unless `scope.include_excluded` is set.
- **Pagination** is keyset pagination on `(sort key, game.id)`, with an opaque cursor. A cursor
  only works with the `sort` that produced it. Sorting by margin leaves out games with fewer than
  two scored teams, with a warning.
- **Laserball** returns `invalid_scope` until the Laserball phase.

#### Teams and colours

Report the TDF team name and `colour_enum` as stored. Do not normalise to "red/green". The legacy
database coerced Blue/Ice to "green", and the schema now stores the true colours. Any "red team vs
green team" wording belongs to the client, not the API.

---

### `GET /games/{slug}`

One game with full per-player stats. It extends the roster-only `GET /api/games/[slug]` with each
scorecard's stats.

Query parameters: `include_penalties` (default `true`) and `include_mvp_components` (default
`false`), as `true`/`false`. The draft's `metrics` parameter was dropped: the response carries
the full standard stat set, which is small enough for one game.

```jsonc
{
  "data": {
    "game_slug": "4-19-20260614193012",
    "game_type": "sm5",
    "start_time": "2026-06-14T19:30:12",
    "center": { "slug": "4-19", "name": "Loveland" },
    "competition": {
      "slug": "internationals_2026",
      "round": "Finals",
      "match_number": 3,
      "game_number": 2,
    },
    "outcome": "score",
    "actual_length": "15:00",
    "teams": [
      {
        "name": "Fire Team",
        "colour_enum": 2,
        "effective_score": 40200,
        "result": "win",
        "players": [
          {
            "ipl_id": "#1234567",
            "callsign": "SHRAPNEL",
            "position": "commander",
            "score": 11240,
            "mvp": 16.4,
            "accuracy": 0.44,
            "hit_diff": 2.1,
            "eliminated": false,
            "lives_left": 4,
            "is_mercenary": false,
          },
        ],
      },
    ],
    "penalties": [
      {
        "ipl_id": "#1234567",
        "type": "Common Foul",
        "score_value": -1000,
        "mvp_value": -5,
        "time": "08:41",
        "rescinded": false,
      },
    ],
    "tdf_url": "https://lfstats-modern-archive.s3.us-west-1.amazonaws.com/4-19-20260614193012.tdf",
    "web_url": "https://lfstats.com/games/4-19-20260614193012",
  },
}
```

Implemented details:

- **Header:** `game_slug`, `game_type`, `start_time`, `center`, `competition` (with round and
  match when scheduled, otherwise `null` for those parts), `outcome`, `excluded`, `description`,
  `scheduled_length` and `actual_length` (`m:ss`), `tdf_url`, `web_url`.
- **Teams** are the same objects as in `search_games`, each with every player's `ipl_id`,
  `callsign`, `position`, `is_mercenary`, `score`, `mvp`, `accuracy`, `hit_diff`, `shots_fired`,
  `shots_hit`, `times_hit`, `missiles_hit`, `times_hit_by_missile`, `medic_hits`,
  `eliminations`, `assists`, `nukes_detonated`, `nukes_canceled`, `rapid_fire`,
  `resupplies_given`, `lives_left`, `shots_left`, `eliminated`, `uptime_pct` and `penalties`.
  Position-specific stats are `null` where the position has no such ability.
  `include_mvp_components` adds `mvp_components: { component: points }` under the model that
  produced the stored `mvp`.
- **Penalties** list player penalties (`ipl_id`, `callsign`) and team penalties (`team`) together,
  each with `type`, `description`, `score_value`, `mvp_value` (null for team penalties), `time`
  and `rescinded`.
- **Guests** appear with `ipl_id: null`, as in the existing route.
- **Excluded games** still resolve, but carry `"excluded": true` and a warning so the model does
  not quote them as typical.
- **Laserball** game slugs return `invalid_request`, pointing to `GET /api/games/{slug}` for the
  roster.

---

## Errors

```jsonc
{
  "error": {
    "code": "invalid_metric",
    "message": "Unknown metric 'kd_ratio'.",
    "field": "sort_by",
    "hint": "Did you mean 'avg_hit_diff'? Valid metrics are listed at GET /api/query/v1/catalog.",
    "valid_values": ["avg_mvp", "avg_hit_diff", "…"],
  },
}
```

Error messages are read by a model, which reacts to them on its next call. Each error should
name the field and say how to fix it.

| Status | `code`                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | `missing_api_key`, `invalid_api_key`                                                                                                                     |
| 403    | `insufficient_scope` (the key exists but lacks `query:read`)                                                                                             |
| 400    | `ambiguous_player` (with `candidates`), `invalid_request`, `unknown_field`, `invalid_metric`, `metric_not_applicable`, `invalid_scope`, `too_many_items` |
| 404    | `player_not_found`, `center_not_found`, `competition_not_found`, `game_not_found`                                                                        |
| 422    | `scope_too_broad` (see [Limits](#limits-and-safety))                                                                                                     |
| 429    | `rate_limited`, `server_busy` (both include `retry_after_seconds` and a `Retry-After` header)                                                            |
| 504    | `query_timeout`                                                                                                                                          |

`did you mean` suggestions use Levenshtein distance against the catalog's ids and enum values.

These routes return HTTP responses and are not Server Actions, so Next's production
error-message redaction does not apply. Still, never return raw database error text. Log it and return `invalid_request` or `query_timeout`.

---

## Limits and safety

- **Read-only database role.** The analytics queries run on a dedicated pool
  (`packages/db/src/queries/analytics/pool.ts`) that connects with `QUERY_DATABASE_URL`, which
  should name the `SELECT`-only role created by `packages/db/sql/query-readonly-role.sql`. The pool
  also sets `default_transaction_read_only` and `statement_timeout` as session startup parameters,
  so it stays read-only and time-limited even when it falls back to `DATABASE_URL`. The registry's
  SQL fragments are code, not user input, and every value is parameterised. No endpoint accepts raw
  SQL.
- **`statement_timeout = 5s`** on that pool. A timeout returns a `504 query_timeout` whose hint
  suggests narrowing the scope.
- **Row caps:** `leaderboard.limit ≤ 100`, `search_games.limit ≤ 100`, `player_stats.players ≤ 10`,
  `resolve` lists ≤ 10 each, `breakdown` ≤ 2 dimensions.
- **`scope_too_broad`:** `player_stats` with `breakdown: ["period"]`, `period: "month"` and
  `all_time` across 10 players could return thousands of cells. The cap is 500 cells per request.
- **Rate limit:** per API key, default 60 requests/minute and 2,000/day, overridable per key
  (`api_key.rate_limit_per_minute` / `rate_limit_per_day`). Counters are fixed windows held in
  memory, which is enough for a single web process; several replicas would need a shared store.
  Each request, including rate-limited ones, is logged to `api_request_log` with the key id, endpoint, duration and row count, so a misbehaving
  client can be found and its key revoked.
- **Concurrency:** at most 4 requests use the analytics pool at once across all keys (pool size).
  Further requests wait up to 2 s and then get a `429 server_busy`. This protects the site's own traffic on a
  single small server.
- **Caching:** responses are deterministic for a given body plus `data_as_of`. Cache them keyed on
  a hash of the normalised request body with a short TTL (5 minutes), and invalidate on ingest if
  convenient. The catalog is cached for one hour.
- **Indexes:** most queries go through `game.start_time`, `game.center_id`, `game.competition_id`
  and `sm5_scorecard.player_id`/`game_id`, which are all indexed. Add
  `sm5_scorecard(position, player_id)` if leaderboard plans show sequential scans. Run `EXPLAIN` on
  the two worked examples below at both a large center and all-time scope before shipping.

---

## MCP server

### Tools

There is one tool per endpoint. Tool names are `lfstats_<endpoint>`. Each `inputSchema` is the
endpoint's zod schema converted with `z.toJSONSchema`. Each description is written for the model
and appends the catalog's metric list.

| Tool                   | Endpoint             |
| ---------------------- | -------------------- |
| `lfstats_catalog`      | `GET /catalog`       |
| `lfstats_resolve`      | `POST /resolve`      |
| `lfstats_leaderboard`  | `POST /leaderboard`  |
| `lfstats_player_stats` | `POST /player_stats` |
| `lfstats_search_games` | `POST /search_games` |
| `lfstats_game_detail`  | `GET /games/{slug}`  |

Every tool is annotated `readOnlyHint: true`, `openWorldHint: false`.

The `/mcp` endpoint requires the same `Authorization: Bearer lfs_…` header with a `query:read`
key. MCP clients send it as a configured header. OAuth for MCP is out of scope for v1.

### Server instructions (sent on initialize)

> LFstats records Space Marines 5 (SM5) and Laserball laser tag games. Players are identified by
> callsign, centers ("sites") by name. Pass player callsigns straight to the tools. Call
> `lfstats_resolve` first for centers and competitions, which the tools take as slugs. If a name is
> `ambiguous`, or a tool returns `ambiguous_player`, ask the user which player they mean, using
> the candidates' home center and game counts, then retry with that player's `ipl_id`. Never pick
> one yourself.
> Positions are commander, heavy, scout, ammo and medic. "MVP" means the per-game MVP points
> score. When answering, state the date range, scope and number of games from `meta`. Treat fewer
> than ~10 games as a small sample and say so. Link to `meta.links.web` or `web_url` when present.

### Resources

The MCP server also exposes `lfstats://docs/metrics`, which is the catalog rendered as Markdown. A
client can attach it as context without spending a tool call.

---

## Worked examples

### "Compare Shrapnel and Zen over the last year at Loveland"

```jsonc
// 1. lfstats_resolve
{ "players": ["Shrapnel", "Zen"], "centers": ["Loveland"] }
// → #1234567 (unique), #7654321 (unique), 4-19 (unique)

// 2. lfstats_player_stats
{
  "players": ["#1234567", "#7654321"],
  "scope": { "centers": ["4-19"], "date_range": { "preset": "last_365_days" } },
  "breakdown": ["position"],
  "head_to_head": true
}
```

The answer should cover overall and per-position stats against the Loveland baseline, plus the
head-to-head record. The model gets the date range from `meta.scope.date_range`.

### "Top 5 medics by average MVP at 4-23"

```jsonc
// lfstats_leaderboard (no resolve needed — the user gave a slug)
{
  "scope": { "centers": ["4-23"], "positions": ["medic"] },
  "sort_by": "avg_mvp",
  "limit": 5,
  "metrics": ["games", "win_rate"],
}
```

`min_games` defaults to 10 medic games. The answer should mention it, because a user who expects a
player to appear may not know about the threshold.

### "Top 5 Heavy players at Nationals 2026 with at least 5 games"

```jsonc
// 1. lfstats_resolve { "competitions": ["Nationals 2026"] } → "nationals_2026"
// 2. lfstats_leaderboard
{
  "scope": { "competitions": ["nationals_2026"], "positions": ["heavy"] },
  "sort_by": "avg_mvp",
  "min_games": 5,
  "limit": 5,
  "metrics": ["games", "avg_hit_diff", "avg_missiles_hit"],
  "percentiles": ["avg_hit_diff"],
}
```

`include_mercenary_games` resolves to `false` because `competitions` is set. This matches the
competition's own stats page.

### "Close finals games at Internationals 2026"

```jsonc
// lfstats_search_games
{
  "scope": { "competitions": ["internationals_2026"], "round_types": ["finals"] },
  "max_margin": 1000,
  "sort": "margin_asc",
  "limit": 10,
}
// then lfstats_game_detail on whichever game the user asks about
```

---

## Extending the API

Prefer these changes, in this order:

1. **New metric** — add a registry entry. Example: `avg_targets_destroyed`, `pooled_accuracy`.
2. **New scope field** — add it to the scope zod schema and to `analytics/scope.ts`. Example:
   `opponent_teams` or `with_teammates`. Every endpoint gains the filter.
3. **New option on an existing endpoint** — e.g. a `breakdown` dimension such as `opponent` or
   `team_colour`.
4. **New endpoint** — only when the result has a different shape. Likely candidates:
   - `POST /team_stats` — competition team aggregates (standings already exist as a fixed route).
   - `POST /trend` — one metric over time for one player, at finer resolution than
     `breakdown: period`. It could also be served by `player_stats`, so add it only if needed.
   - `POST /aggregate` — a general `group_by` query (player, position, center, period, team
     colour) as a fallback for questions the specific tools don't cover. Hold this back until there
     is evidence it is needed, because broad tools are harder for models to use correctly than
     narrow ones.

Every change must update this document and the catalog at the same time. The catalog is generated
from the registry, so in practice only this document can fall out of date.

---

## Implementation plan

Phases 1–4 are done. Phase 1 deviated from the plan in one way: its tests check the generated
SQL rather than running against fixture games, because there is no test database. Parity checks
against the live database cover the rest.

1. **Foundations.** Add zod. Add `api_key.scopes`, the key check, the rate limiter and the request log. Create `analytics/scope.ts` (scope → SQL, preset resolution, the
   mercenary/excluded defaults). Create `analytics/metrics.ts` with the v1 SM5 catalog. Set up the
   read-only role, pool and `statement_timeout`. Unit-test scope → SQL against fixture games,
   including the `social`-type competition edge case and inclusive date bounds.
2. **`catalog`, `resolve`, `leaderboard`.** The `pg_trgm` and `member_id` index migration. Check
   `leaderboard` against the site: a 4-23 medic leaderboard over the same scope must match
   `getCompetitionTopPlayersByPosition` and the center page to the last decimal. _Done: it matches
   `getCompetitionMedicPlayers` for 4-23 social (126 players, all-time; 92, last 365 days) and
   `getCompetitionTopPlayers` for a team competition (33 players), on games and average MVP._
3. **`player_stats`** with `position` and `period` breakdowns, the baseline, and head-to-head.
   _Done, with `center` and `game_kind` breakdowns as well. Checked against the live database:
   per-position average MVP matches `getPlayerAvgMvpByPosition`; the baseline matches an
   independent per-player average from `leaderboard` (98 players, equal to 9 decimals); and
   head-to-head game counts match direct SQL._
4. **`search_games` and `games/{slug}`.** _Done. Checked against the live database: margins
   equal the effective-score gap; paging with `limit: 7` reproduces a single `limit: 100` query
   with no gaps or duplicates under both sorts; teammate and opponent counts match
   `player_stats` head-to-head; a positions-and-result search matches direct SQL; MVP components
   sum to the stored MVP._
5. **The MCP endpoint at `/mcp`.** Tools are generated from the zod schemas. Evaluate with a fixed
   set of ~30 real questions and check that the tool calls and answers are correct. Include
   ambiguous names, impossible scopes and small samples.
6. **Laserball metrics.**
7. Add the routes to [API.md](API.md) as they ship.

## Decisions

Settled 2026-10-04:

- **API key required** for every query endpoint and `/mcp`. No anonymous access.
- **`min_games` defaults to 10** and is overridable. `qualify` covers eligibility over a different
  scope ("at least 20 games in the last year").
- **The baseline excludes the requested players.**
- **Guests are not searchable.** Member ids (`4-3-1137`) are accepted wherever a player is.
- **Callsigns are accepted wherever a player is** (2026-10-05). Callsigns are how users will
  mostly name players. A certain match is used. Anything uncertain is returned as
  `ambiguous_player` for the model to confirm with the user.

## Open questions

- **Member id coverage.** As of 2026-10-04, 786 of 1,583 players have a `member_id`. Is a backfill
  from a newer roster source worth doing?
