# Competition Structure

**Last Updated:** 2026-08

---

## Overview

A **competition** is a structured event that groups a set of SM5 games together and gives them organisational meaning. The most common type is a **tournament**, where a fixed set of teams play each other in **matches** across multiple **rounds**, with standings derived from match results.

The base `competition` table and `game.competition_id` FK were the starting point. The tournament structure built on top of that is described here.

---

## Game Classification

Before any tournament structure applies, every game resolves into exactly one stat universe. Four independent concerns sit on top of a `Game`:

1. **Competition** — the grouping a game belongs to, via `game.competition_id`. A game belongs to **at most one** competition. Competitions are **not center-scoped**: `host_center_id` is optional and games from any center may belong to one.
2. **Tags** — a freeform, center-scoped, many-to-many overlay (`game_tag` / `game_tag_assignment`) for classifying and filtering **social** games. Tags never change which aggregate a game flows into.
3. **Favorites** — a bookmark on a game or player. Scoped to the **auth user**, not the `player` record (`user_favorite_game`, `user_favorite_player`).
4. **Exclude** — `game.exclude`, a hard "don't count this anywhere" flag for ref-aborted, replayed, test, or anomalous games. Excluded games remain fully ingested and replayable; they just never reach an aggregate. Ingest sets it automatically when `outcome = "aborted"`.

A game is **social** simply by having no competition — no marker tag is required.

### Routing precedence

Resolved per query, in this order:

1. `exclude = true` → removed from every aggregate.
2. `competition_id` present → routes into that competition's stats. If `competition.type = 'competitive'` it also feeds the all-competitive aggregate.
3. `competition_id` null → a social game.

**Tags never participate in routing.** They are an additive filter applied on top of whichever scope above already resolved.

### Query patterns

| Aggregate           | Filter                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nightly**         | `center_id = X AND date(start_time) = D AND competition_id IS NULL AND exclude = false`. Date math is direct — timestamps are center-local.                                                                                  |
| **Social**          | `exclude = false AND (competition_id IS NULL OR competition.type = 'social')`. **Includes social-type competitions**, not just competition-less games. Implemented in `getSocialGames` (`packages/db/src/queries/stats.ts`). |
| **Tag drill-down**  | The social aggregate plus a tag filter. **AND semantics** — a game must carry _all_ selected tags, implemented as a subquery with `having count(distinct tag_id) = <number selected>`.                                       |
| **Per-competition** | `competition_id = E AND exclude = false`.                                                                                                                                                                                    |
| **All competitive** | join `competition WHERE type = 'competitive'`, `exclude = false`. Cross-center pooling is automatic via the global `player` identity (keyed on iplId, so one person at two centers is one row).                              |

### Tag lifecycle

Three distinct operations, all in `packages/db/src/queries/admin.ts`:

- **Archive** (`archiveTag` / `unarchiveTag`) — the default "delete". Sets `archived = true`; the tag leaves pickers and active lists but its assignments are preserved so historical filters keep working. Reversible.
- **Permanent delete** (`deleteTag`) — removes the `game_tag` row and cascades its assignments. Reserve for genuine mistakes (typo or test tags). Irreversible.
- **Merge** (`mergeTag`) — re-points one tag's assignments onto another, then removes the empty source. The usual fix for duplicates ("Pracitce" → "Practice").

### Ingest impact

None of these concepts exist in the TDF, so chomper computes none of them. `competition_id` is the sole exception: it is resolved at ingest from a competition-slug prefix on the S3 key (see [chomper-design.md](chomper-design.md), Lambda flow step 6b), which is how the [Google Drive sync](../scripts/google-drive-sync/README.md) files games into a competition by folder name.

`competition_id`, `exclude`, and `description` are admin-owned. The re-ingest paths snapshot and restore all three rather than overwriting the `game` row.

---

## Design Decisions

- **Teams are per-competition.** A team is created for each event and does not carry identity across competitions.
- **Matches are 2 games.** Teams play once on each color (e.g. Red → Green). Each game is recorded as game 1 or game 2 of the match.
- **Color mapping is explicit.** `competition_match_game` records which `sm5_game_team` row corresponds to each competition team in each game. This is required because team color assignments swap between games.
- **Match numbers are per-round.** Each round has its own 1-N sequence. Drag-and-drop reordering in the admin UI reassigns match numbers.
- **Bracket structure is not modeled internally.** Rounds carry a `type` (`pool`, `finals`, `split-pool`, `wildcard`) and can be divided into pools, but advancement logic is not computed. A bracket is instead **embedded from Challonge** via `competition.challonge_link`.
- **Pools are per-round, not per-competition.** A round can be split into several pools, and a team's pool assignment is recorded per round (`competition_round_team_pool`) — so teams can be re-pooled between rounds without losing history.
- **Points are derived, never stored.** Standings are calculated at query time from `sm5_game_team.result` and scores.
- **Mercenaries are a roster property, propagated to scorecards.** The source of truth is `competition_team_player.is_mercenary` — an admin marks a player as a merc _on the roster_. Assigning a game to a match then stamps `sm5_scorecard.is_mercenary = true` on that player's scorecards for that match. Mercenary scorecards are excluded from aggregate competition stats.
- **Multi-center support.** Games in a competition can be played at different centers with no constraint.
- **Laserball uses a separate, lighter model.** `lb_match` / `lb_match_game` link two halves of a Laserball match with no competition, team, or round structure at all. See the `lb_match` schema section below.

---

## Schema

### `competition`

| Column                     | Type             | Notes                                                                                                                                      |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | uuid PK          |                                                                                                                                            |
| `name`                     | text             |                                                                                                                                            |
| `slug`                     | text             | **Unique.** The public URL key, and the S3 key prefix that files a game into this competition at ingest.                                   |
| `type`                     | enum             | `"competitive"` or `"social"`                                                                                                              |
| `state`                    | enum             | `"preshow"` \| `"upcoming"` \| `"active"` \| `"completed"`. Defaults to `"active"`. Drives UI visibility and whether uploads are accepted. |
| `host_center_id`           | uuid FK → center | nullable — null for a true multi-center competition                                                                                        |
| `start_date`               | date             |                                                                                                                                            |
| `end_date`                 | date             | nullable                                                                                                                                   |
| `description`              | text             | nullable                                                                                                                                   |
| `challonge_link`           | text             | nullable. Embedded bracket URL — this is how bracket structure is presented, since it is not modeled internally.                           |
| `challonge_bracket_height` | integer          | nullable. Iframe height for the embed.                                                                                                     |
| `created_at`               | timestamp        | defaults to now                                                                                                                            |

### `competition_team`

One row per team per competition. Teams do not persist across competitions.

| Column           | Type                  | Notes                                                                      |
| ---------------- | --------------------- | -------------------------------------------------------------------------- |
| `id`             | uuid PK               |                                                                            |
| `competition_id` | uuid FK → competition | cascade delete                                                             |
| `name`           | text                  |                                                                            |
| `slug`           | text                  | URL key within the competition                                             |
| `short_name`     | text                  | nullable                                                                   |
| `has_logo`       | boolean               | default `false`                                                            |
| `logo_version`   | integer               | default `0`. Cache-buster — only append `?v=N` to the logo URL when `> 0`. |
| `created_at`     | timestamp             | defaults to now                                                            |

**Unique:** `(competition_id, name)` and `(competition_id, slug)`

### `competition_team_player`

Official roster for a team within a competition. The source of truth for mercenary status.

| Column                | Type                       | Notes                                                     |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| `id`                  | uuid PK                    |                                                           |
| `competition_team_id` | uuid FK → competition_team | cascade delete                                            |
| `player_id`           | uuid FK → player           | cascade delete                                            |
| `is_mercenary`        | boolean                    | default `false`. See [Mercenary rules](#mercenary-rules). |
| `has_profile_picture` | boolean                    | default `false`                                           |
| `picture_version`     | integer                    | default `0`. Cache-buster, same rule as `logo_version`.   |
| `created_at`          | timestamp                  | defaults to now                                           |

**Unique:** `(competition_team_id, player_id)` · **Index:** `player_id`

### `competition_round`

A named phase of a competition (e.g. "Round 1", "Quarterfinals"). Rounds are ordered by `round_number`.

| Column           | Type                  | Notes                                                    |
| ---------------- | --------------------- | -------------------------------------------------------- |
| `id`             | uuid PK               |                                                          |
| `competition_id` | uuid FK → competition | cascade delete                                           |
| `name`           | text                  |                                                          |
| `round_number`   | integer               | Sort order                                               |
| `type`           | enum                  | `"pool"` \| `"finals"` \| `"split-pool"` \| `"wildcard"` |
| `created_at`     | timestamp             | defaults to now                                          |

**Unique:** `(competition_id, round_number)`

### `competition_pool`

A subdivision of a round. A round with no pools is a single flat group; a `split-pool` round has two or more.

| Column       | Type                        | Notes           |
| ------------ | --------------------------- | --------------- |
| `id`         | uuid PK                     |                 |
| `round_id`   | uuid FK → competition_round | cascade delete  |
| `name`       | text                        |                 |
| `sort_order` | integer                     | default `0`     |
| `created_at` | timestamp                   | defaults to now |

**Unique:** `(round_id, name)`

### `competition_round_team_pool`

Which pool each team sits in **for a given round**. Assignment is per round, so teams can be re-pooled between rounds.

| Column       | Type                        | Notes           |
| ------------ | --------------------------- | --------------- |
| `id`         | uuid PK                     |                 |
| `round_id`   | uuid FK → competition_round | cascade delete  |
| `team_id`    | uuid FK → competition_team  | cascade delete  |
| `pool_id`    | uuid FK → competition_pool  | cascade delete  |
| `created_at` | timestamp                   | defaults to now |

**Unique:** `(round_id, team_id)` — a team is in at most one pool per round · **Index:** `pool_id`

### `competition_match`

A match between two teams within a round. A match consists of 2 games where the teams swap colors.

| Column                       | Type                        | Notes                                                                                            |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                         | uuid PK                     |                                                                                                  |
| `competition_id`             | uuid FK → competition       | Denormalized for query convenience                                                               |
| `round_id`                   | uuid FK → competition_round | cascade delete                                                                                   |
| `pool_id`                    | uuid FK → competition_pool  | nullable, `ON DELETE SET NULL`. Null in an unpooled round.                                       |
| `match_number`               | integer                     | Per-round sequence; drag-and-drop reorderable                                                    |
| `team1_id`                   | uuid FK → competition_team  | **nullable** — a slot can be scheduled before its team is known (e.g. an unresolved finals slot) |
| `team2_id`                   | uuid FK → competition_team  | **nullable**, same reason                                                                        |
| `game1_scheduled_start_time` | timestamp                   | nullable — each game in the match is scheduled independently                                     |
| `game2_scheduled_start_time` | timestamp                   | nullable                                                                                         |
| `created_at`                 | timestamp                   | defaults to now                                                                                  |

**Unique:** `(round_id, match_number)` · **Index:** `competition_id`

### `competition_match_game`

Links an ingested game to a match slot and records which color each team played in that game.

| Column               | Type                        | Notes                                                   |
| -------------------- | --------------------------- | ------------------------------------------------------- |
| `id`                 | uuid PK                     |                                                         |
| `match_id`           | uuid FK → competition_match | cascade delete                                          |
| `game_id`            | uuid FK → game              | cascade delete                                          |
| `game_number`        | integer                     | 1 or 2                                                  |
| `team1_game_team_id` | uuid FK → sm5_game_team     | Which `sm5_game_team` row is `match.team1` in this game |
| `team2_game_team_id` | uuid FK → sm5_game_team     | Which `sm5_game_team` row is `match.team2` in this game |

**Unique:** `(match_id, game_number)` — one game per slot  
**Unique:** `(game_id)` — a game belongs to at most one match

`team1_game_team_id` / `team2_game_team_id` are the critical join point between competition team identity and per-game color assignments.

### `sm5_scorecard.is_mercenary` (added column)

`boolean NOT NULL DEFAULT false`. The **derived** copy of the roster flag — see [Mercenary rules](#mercenary-rules) for how it is populated. Mercenary scorecards are excluded when aggregating competition stats.

### `lb_match` / `lb_match_game`

Laserball's match model, deliberately much lighter than the SM5 structure above. There is **no** Laserball competition, team, roster, round, or pool — just a link between the two halves of one match.

`lb_match`:

| Column       | Type      | Notes                                                      |
| ------------ | --------- | ---------------------------------------------------------- |
| `id`         | uuid PK   |                                                            |
| `linked_by`  | text      | nullable. Free-text audit breadcrumb (an email), not a FK. |
| `created_at` | timestamp | defaults to now                                            |

`lb_match_game`:

| Column               | Type                   | Notes                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------- |
| `id`                 | uuid PK                |                                                         |
| `match_id`           | uuid FK → lb_match     | cascade delete                                          |
| `game_id`            | uuid FK → game         | cascade delete                                          |
| `half`               | integer                | `1` = first half, `2` = second (post side-swap) half    |
| `side1_game_team_id` | uuid FK → lb_game_team | Which `lb_game_team` row is match "Side 1" in this game |
| `side2_game_team_id` | uuid FK → lb_game_team | Which `lb_game_team` row is match "Side 2" in this game |

**Unique:** `(match_id, half)` and `(game_id)` · **Index:** `match_id`

Side identity is **match-scoped only**. There is no persistent Laserball team table — colour and name are just center display strings. That Side 1 in half 1 and Side 1 in half 2 are "the same real-world team" is asserted by the admin at link time, and the two will normally carry a _different_ `tdf_team_index` / `colour_enum` in each half, which is the whole point of the swap.

Served by `GET /api/laserball/matches/[matchId]/replay` — see [API.md](API.md).

---

## Entity Relationships

```
competition
  ├── competition_team ──── competition_team_player ──── player
  │                              └── is_mercenary  ─────────────┐
  └── competition_round                                          │  (stamped onto
        ├── competition_pool ──── competition_round_team_pool    │   scorecards when
        │                              └── competition_team      │   a game is assigned)
        └── competition_match (team1_id, team2_id → competition_team, pool_id → competition_pool)
              └── competition_match_game                         │
                    ├── game.id                                  │
                    ├── sm5_game_team (team1_game_team_id)       │
                    └── sm5_game_team (team2_game_team_id)       │
                                                                 ▼
game.competition_id ──── competition        sm5_scorecard.is_mercenary

Laserball (separate, no competition structure):
lb_match ──── lb_match_game ──── game.id
                            └──── lb_game_team (side1/side2_game_team_id)
```

---

## Points Calculation

Points are derived at query time — never stored. For each match:

1. Fetch the `competition_match_game` rows.
2. For each game, look up `sm5_game_team.result`, `score`, `elimination_bonus`, and `penalty_score` for each side via `team1/2_game_team_id`.
3. **Game points:** win = 2, draw = 1 each, loss = 0. Awarded per game as results come in, so a half-played match still contributes.
4. **Match bonus:** only once **both** games are recorded. Compare each side's combined total across the two games:

   ```
   score + elimination_bonus + coalesce(penalty_score, 0)
   ```

   Higher total takes +2; an exact tie gives +1 each. Note that `penalty_score` is included — penalties can flip a match bonus, not just a game result.

5. **Incomplete matches.** With fewer than 2 games recorded, `matchWinner` is `"incomplete"` and both sides get 0 match points. Game points already earned still count.
6. Sum per team across all matches in a round or the full competition for standings.

Implemented in `packages/db/src/queries/competition-tournament.ts`.

---

## Mercenary Rules

Mercenary status is recorded in **two places**, and the direction of flow matters:

1. **`competition_team_player.is_mercenary` — the source of truth.** An admin adds a player to a team's roster and marks them a merc. This is a statement about the roster, made once, independent of any particular game.
2. **`sm5_scorecard.is_mercenary` — the derived copy.** When a game is assigned to a match slot, the assignment routine looks up both sides' rosters and stamps `is_mercenary = true` on the scorecards of any player flagged as a merc for that side (`assignGameToMatch` in `packages/db/src/queries/competition-tournament.ts`). Queries filter on this column because it is on the row they are already aggregating.

> **Ordering consequence:** the stamp happens _at assignment time_. Flagging a player as a mercenary on the roster **after** their games are already assigned will not retroactively update those scorecards — the games must be reassigned, or the scorecard flag set directly.

Mercenary scorecards are excluded from:

- The player's aggregate competition stats
- Any per-team competition stat totals

Mercenary games are not excluded from the game record itself — the scorecards exist and are visible on the game page, but are flagged so queries can filter them out. Roster views count rostered players and mercs separately (`playerCount` vs `mercCount`).

---

## Game Display Conventions

Games assigned to a match are displayed throughout the UI using the structured label:

> **Round 1 · Match 3 · Game 2 · Team Alpha vs Team Bravo**

The team names in this label come from `competition_team.name` (resolved via `competition_match_game` → `competition_match` → `competition_team`), not from the raw `sm5_game_team.name` (e.g. "Red Team").

---

## Admin Workflow

1. Create a competition (`/admin/competitions/new`)
2. Bulk-assign games to the competition by center + date range
3. Add teams and their rosters (`/admin/competitions/[slug]/teams`, one team at `[slug]/teams/[teamSlug]`) — **mark any sub-in players as mercenaries here, before assigning their games**
4. Create rounds, pools, and matches (`/admin/competitions/[slug]/rounds`, one round at `[slug]/rounds/[roundId]`)
5. Assign games to match slots — either from the match detail page or directly on the game page. This is the step that stamps mercenary flags onto scorecards.

Admin routes are keyed by **slug**, not id. Games can also be assigned to a competition and to a match slot directly from the game detail page (`/games/[slug]`) by admins and center admins.

Alternatively, games can be filed into a competition **at ingest** with no admin step at all, by dropping the TDF into a Drive subfolder named after the competition slug — see the [Google Drive sync](../scripts/google-drive-sync/README.md).
