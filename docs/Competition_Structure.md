# Competition Structure

**Last Updated:** 2026-10

---

## Overview

A **competition** is a structured event that groups a set of games — SM5 or Laserball, never both — together and gives them organisational meaning. The most common type is a **tournament**, where a fixed set of teams play each other in **matches** across multiple **rounds**, with standings derived from match results.

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

- **Format is orthogonal to type.** `type` decides stat routing (competitive feeds the all-competitive
  aggregate; social does not). `format` decides scoring shape: a `team` competition runs matches inside
  rounds, a `solo` competition ranks individual players and has no match structure at all, and a `none`
  competition is not scored here at all. A solo league is normally `type = 'competitive', format = 'solo'`,
  so it still appears in the competition picker and the all-competitive aggregate. See
  [Solo Competitions](#solo-competitions) and [No Scoring Competitions](#no-scoring-competitions).
- **Trios is a team format with two teams per side.** A `trios` competition runs the same rounds,
  pools and two-game matches as `team`, but each side of a match is two `competition_team` rows
  (trios) sharing one `sm5_game_team`. Pairings change from match to match, so they live on the
  match, not the team. See [Trios Competitions](#trios-competitions).
- **Duos is the same format with three teams per side.** A `duos` competition follows every trios
  rule, but each side is three `competition_team` rows (duos) instead of two. See
  [Duos Competitions](#duos-competitions).
- **Only `team`, `trios` and `duos` have a match structure.** Both `solo` and `none` select their games straight off
  `game.competition_id`, own no rounds/matches/teams, and never apply the pool/finals/mercenary
  toggles. Code must therefore gate on `hasMatchStructure(format)` (exported from
  `packages/db/src/queries/admin.ts`) rather than comparing against a single format value — a
  `format !== 'solo'` test silently treats a no-scoring event as a tournament and returns nothing.
- **Category is display-only, and orthogonal to both.** `category` says what kind of _event_ this
  is — `internationals`, `tournament` or `league` — and its only job is to group competitions into
  sections on the browse page. It never touches scoring or routing. See
  [Browsing Competitions](#browsing-competitions).
- **Teams are per-competition.** A team is created for each event and does not carry identity across competitions.
- **Matches are 2 games.** Teams play once on each color (e.g. Red → Green). Each game is recorded as game 1 or game 2 of the match.
- **Color mapping is explicit.** `competition_match_game` records which `sm5_game_team` row corresponds to each competition team in each game. This is required because team color assignments swap between games.
- **Match numbers are per-round.** Each round has its own 1-N sequence. Drag-and-drop reordering in the admin UI reassigns match numbers.
- **Bracket structure is not modeled internally.** Rounds carry a `type` (`pool`, `finals`, `split-pool`, `wildcard`) and can be divided into pools, but advancement logic is not computed. A bracket is instead **embedded from Challonge** via `competition.challonge_link`.
- **Pools are per-round, not per-competition.** A round can be split into several pools, and a team's pool assignment is recorded per round (`competition_round_team_pool`) — so teams can be re-pooled between rounds without losing history.
- **Points are derived, never stored.** Standings are calculated at query time from `sm5_game_team.result` and scores.
- **Mercenaries are a roster property, propagated to scorecards.** The source of truth is `competition_team_player.is_mercenary` — an admin marks a player as a merc _on the roster_. Assigning a game to a match then stamps `sm5_scorecard.is_mercenary = true` on that player's scorecards for that match. Mercenary scorecards are excluded from aggregate competition stats.
- **Multi-center support.** Games in a competition can be played at different centers with no constraint.
- **Game type is fixed per competition.** `game_type` is `sm5` or `lb`, chosen at creation. A
  Laserball competition reuses teams, rosters, rounds, pools, matches and adjustments, but a match
  is played as one `lb_match` (two halves and any overtime halves) and scored on match results and
  goals. See [Laserball Competitions](#laserball-competitions).

---

## Schema

### `competition`

| Column                     | Type             | Notes                                                                                                                                                                    |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | uuid PK          |                                                                                                                                                                          |
| `name`                     | text             |                                                                                                                                                                          |
| `slug`                     | text             | **Unique.** The public URL key, and the S3 key prefix that files a game into this competition at ingest.                                                                 |
| `type`                     | enum             | `"competitive"` or `"social"`. Routes stats — see [Design Decisions](#design-decisions).                                                                                 |
| `game_type`                | enum             | `"sm5"` (default) or `"lb"`. Fixed at creation. A CHECK requires `format = 'team'` for `lb` — see [Laserball Competitions](#laserball-competitions).                     |
| `format`                   | enum             | `"team"` (default), `"solo"`, `"none"`, `"trios"` or `"duos"`. **Orthogonal to `type`** — decides how the competition is _scored_, not whether it counts as competitive. |
| `category`                 | enum             | `"internationals"` \| `"tournament"` (default) \| `"league"`. **Display only** — see [Browsing Competitions](#browsing-competitions).                                    |
| `state`                    | enum             | `"preshow"` \| `"upcoming"` \| `"active"` \| `"completed"`. Defaults to `"active"`. Drives UI visibility and whether uploads are accepted.                               |
| `host_center_id`           | uuid FK → center | nullable — null for a true multi-center competition                                                                                                                      |
| `start_date`               | date             |                                                                                                                                                                          |
| `end_date`                 | date             | nullable                                                                                                                                                                 |
| `description`              | text             | nullable                                                                                                                                                                 |
| `challonge_link`           | text             | nullable. Embedded bracket URL — this is how bracket structure is presented, since it is not modeled internally.                                                         |
| `challonge_bracket_height` | integer          | nullable. Iframe height for the embed.                                                                                                                                   |
| `created_at`               | timestamp        | defaults to now                                                                                                                                                          |

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

### `competition_player`

Enrollment in a **solo-format** competition, and the player's handicap for it. Team competitions
do not use this table; solo competitions do not use `competition_team_player`.

| Column           | Type                  | Notes                                                                                   |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------- |
| `id`             | uuid PK               |                                                                                         |
| `competition_id` | uuid FK → competition | cascade delete                                                                          |
| `player_id`      | uuid FK → player      | cascade delete. NOT NULL, so guest scorecards (null `player_id`) can never be enrolled. |
| `handicap`       | integer               | default `0`. Whole MVP points added to **each counted game**. **May be negative.**      |
| `created_at`     | timestamp             | defaults to now                                                                         |

**Unique:** `(competition_id, player_id)` · **Index:** `player_id`

### `competition_team_adjustment`

A standings-point adjustment to one team, outside any match: a deduction for a missed referee
duty, a sanction, a correction. Also where legacy `match_penalties` land.

| Column           | Type                       | Notes                       |
| ---------------- | -------------------------- | --------------------------- |
| `id`             | uuid PK                    |                             |
| `competition_id` | uuid FK → competition      | cascade delete              |
| `team_id`        | uuid FK → competition_team | cascade delete              |
| `points`         | numeric(5,1)               | signed; a CHECK forbids `0` |
| `reason`         | text                       | shown on the standings page |
| `created_at`     | timestamp                  | defaults to now             |

**Index:** `competition_id`

Adjustments belong to no round, so they count only on the **whole-competition** standings (no
round or pool selected) — see [Points Calculation](#points-calculation). Admins add and remove
them on `/admin/competitions/[slug]/teams`; `addCompetitionTeamAdjustment()` refuses a team from
another competition, a zero value and an empty reason, and refuses a fractional value in an SM5
competition. Laserball adjustments may be any multiple of 0.5, since a tied match is worth half a
point — hence the numeric column.

### `competition_round`

A named phase of a competition (e.g. "Round 1", "Quarterfinals"). Rounds are ordered by `round_number`.

| Column           | Type                  | Notes                                                                                               |
| ---------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `id`             | uuid PK               |                                                                                                     |
| `competition_id` | uuid FK → competition | cascade delete                                                                                      |
| `name`           | text                  |                                                                                                     |
| `round_number`   | integer               | Sort order                                                                                          |
| `type`           | enum                  | `"pool"` \| `"finals"` \| `"split-pool"` \| `"wildcard"`                                            |
| `multiplier`     | integer               | default `1`. Scales every point earned in the round — see [Points Calculation](#points-calculation) |
| `created_at`     | timestamp             | defaults to now                                                                                     |

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
| `team1_partner_id`           | uuid FK → competition_team  | nullable. **Trios and duos only** — the second trio/duo on side 1. Null in every other format.   |
| `team2_partner_id`           | uuid FK → competition_team  | nullable. **Trios and duos only** — the second trio/duo on side 2.                               |
| `team1_partner2_id`          | uuid FK → competition_team  | nullable. **Duos only** — the third duo on side 1. Null in every other format.                   |
| `team2_partner2_id`          | uuid FK → competition_team  | nullable. **Duos only** — the third duo on side 2.                                               |
| `game1_scheduled_start_time` | timestamp                   | nullable — each game in the match is scheduled independently                                     |
| `game2_scheduled_start_time` | timestamp                   | nullable                                                                                         |
| `created_at`                 | timestamp                   | defaults to now                                                                                  |

**Unique:** `(round_id, match_number)` · **Index:** `competition_id`
**Check:** `competition_match_distinct_teams_check` — no team may fill two slots of one match. It
compares all six slots pairwise, so an empty (null) slot never fails it.

### `competition_match_game`

Links an ingested game to a match slot and records which color each team played in that game.

| Column                   | Type                        | Notes                                                                      |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------- |
| `id`                     | uuid PK                     |                                                                            |
| `match_id`               | uuid FK → competition_match | cascade delete                                                             |
| `game_id`                | uuid FK → game              | cascade delete                                                             |
| `game_number`            | integer                     | 1 or 2                                                                     |
| `team1_sm5_game_team_id` | uuid FK → sm5_game_team     | TDF game: the game team that is `match.team1` (and its partners)           |
| `team2_sm5_game_team_id` | uuid FK → sm5_game_team     | TDF game: the game team that is `match.team2` (and its partners)           |
| `team1_pdf_game_team_id` | uuid FK → sm5_pdf_game_team | PDF-era legacy game: the game team that is `match.team1`                   |
| `team2_pdf_game_team_id` | uuid FK → sm5_pdf_game_team | PDF-era legacy game: the game team that is `match.team2`                   |
| `team1_game_team_id`     | uuid, generated, NOT NULL   | `coalesce(team1_sm5_…, team1_pdf_…)` — **read this**, write the pair above |
| `team2_game_team_id`     | uuid, generated, NOT NULL   | `coalesce(team2_sm5_…, team2_pdf_…)`                                       |

**Unique:** `(match_id, game_number)` — one game per slot  
**Unique:** `(game_id)` — a game belongs to at most one match  
**Check:** exactly one pair is set — both `sm5` columns or both `pdf` columns.

`team1_game_team_id` / `team2_game_team_id` are the critical join point between competition team identity and per-game color assignments. They hold a game team of either kind, so join them to the `competition_game_side` view, never to `sm5_game_team` directly, wherever PDF-era games must count. `assignGameToMatch()` writes the right pair from the ids it is given.

### `competition_game_side` / `competition_scorecard` (views)

`competition_game_side` is `sm5_game_team` ∪ `sm5_pdf_game_team`, restricted to what match points and the match views need: `id`, `game_id`, `score`, `elimination_bonus`, `penalty_score`, `result`, `eliminated`, `colour_enum`. `competition_scorecard` is `sm5_scorecard` ∪ `sm5_pdf_scorecard` restricted to `id`, `game_id`, `team_id`, `player_id`, `is_mercenary` — enough for roster building (who played for which team).

**Per-player stats in PDF-era competitions.** The per-player queries in `competition-tournament.ts` (team player stats, top players, the position tables and the leaderboards) read `sm5_scorecard` only. A competition holding any `sm5_pdf` game (`competitionHasLegacyGames`) is served instead by `competition-legacy.ts`, which reads both scorecard kinds in one row shape; the page picks the query, so TDF competitions take exactly the path they always did. PDF scorecards hold end-of-game totals only, so:

| Stat                                                                                   | PDF-era competition                                                                        |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Games, score, accuracy, hit diff, medic hits, times hit, survival, penalties, win rate | Over every game, TDF and PDF                                                               |
| Legacy MVP, shown as **MVP\***                                                         | Over PDF games only — a different formula, never averaged with modern MVP                  |
| Modern MVP, deacs, assists, resets, eliminations, uptime                               | Over TDF games only; hidden when the competition has none (all but Brisbane 2019 Season 2) |

- **Team page** — the stat picker offers MVP\* (the default column, with score) and drops every stat no game in the competition supplies.
- **Players** (`/players?scope=competition&competition=…`) — one table ranked by MVP\*, with per-position MVP\*, accuracy and win rate; a TDF-games-only "Avg MVP (TDF)" column appears when the competition has TDF games. The per-position detail tables (nukes, rapid fire, uptime …) are left out.
- **Leaderboards** — position boards rank PDF scorecards by MVP\*; games played, total score and medic hits cover every game. The boards that need the event stream are left out.

Only a single competition's scope reads PDF games. "All competitions", social and all-games scopes stay TDF-only, so PDF games never reach career stats, leaderboards or the rating.

### `sm5_pdf_scorecard.is_mercenary` (added column)

Same meaning as on `sm5_scorecard`, stamped by `assignGameToMatch()`.

### `sm5_scorecard.is_mercenary` (added column)

`boolean NOT NULL DEFAULT false`. The **derived** copy of the roster flag — see [Mercenary rules](#mercenary-rules) for how it is populated. Mercenary scorecards are excluded when aggregating competition stats.

### `lb_match` / `lb_match_game`

Laserball's match model: a link between the two halves of one match (and any overtime halves). It stands alone for social games; in a [Laserball competition](#laserball-competitions) it is what fills a `competition_match`.

`lb_match`:

| Column                 | Type      | Notes                                                                                  |
| ---------------------- | --------- | -------------------------------------------------------------------------------------- |
| `id`                   | uuid PK   |                                                                                        |
| `linked_by`            | text      | nullable. Free-text audit breadcrumb (an email), not a FK.                             |
| `competition_match_id` | uuid FK   | nullable, **unique**, `ON DELETE SET NULL`. The competition match this lb_match fills. |
| `created_at`           | timestamp | defaults to now                                                                        |

`lb_match_game`:

| Column               | Type                   | Notes                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------- |
| `id`                 | uuid PK                |                                                         |
| `match_id`           | uuid FK → lb_match     | cascade delete                                          |
| `game_id`            | uuid FK → game         | cascade delete                                          |
| `half`               | integer                | `1`, `2` regulation; `3`+ overtime (OT 1, OT 2, …)      |
| `side1_game_team_id` | uuid FK → lb_game_team | Which `lb_game_team` row is match "Side 1" in this game |
| `side2_game_team_id` | uuid FK → lb_game_team | Which `lb_game_team` row is match "Side 2" in this game |

**Unique:** `(match_id, half)` and `(game_id)` · **Index:** `match_id`

Side identity is **match-scoped** — colour and name are just center display strings. In a competition, Side 1 is the competition match's team 1. Halves 3 and up are overtime halves (half 3 is OT 1), played only from a level score; there can be any number, numbered in play order with no gaps — removing one renumbers the rest. That Side 1 in half 1 and Side 1 in half 2 are "the same real-world team" is asserted by the admin at link time, and the two will normally carry a _different_ `tdf_team_index` / `colour_enum` in each half, which is the whole point of the swap.

Served by `GET /api/laserball/matches/[matchId]/replay` — see [API.md](API.md).

---

## Entity Relationships

```
competition
  ├── competition_player ──── player          (solo format only: enrollment + handicap)
  ├── competition_team ──── competition_team_player ──── player
  │                              └── is_mercenary  ─────────────┐
  └── competition_round                                          │  (stamped onto
        ├── competition_pool ──── competition_round_team_pool    │   scorecards when
        │                              └── competition_team      │   a game is assigned)
        └── competition_match (team1_id, team2_id → competition_team, pool_id → competition_pool)
              └── competition_match_game                         │
                    ├── game.id                                  │
                    ├── competition_game_side (team1_…)          │
                    └── competition_game_side (team2_…)          │
                                                                 ▼
game.competition_id ──── competition        sm5_scorecard.is_mercenary

Laserball (a competition match is filled by one lb_match; side 1 = team 1):
competition_match ──── lb_match ──── lb_match_game ──── game.id
                                                  └──── lb_game_team (side1/side2_game_team_id)
                       lb_scorecard.is_mercenary (stamped from the rosters)
```

---

## Points Calculation

Points are derived at query time — never stored. For each match:

1. Fetch the `competition_match_game` rows.
2. For each game, look up `result`, `score`, `elimination_bonus`, and `penalty_score` for each side in `competition_game_side` via `team1/2_game_team_id` — an `sm5_game_team` for a TDF game, an `sm5_pdf_game_team` for a PDF-era legacy game. Both score the same way.
3. **Game points:** win = 2, draw = 1 each, loss = 0. Awarded per game as results come in, so a half-played match still contributes.
4. **Match bonus:** only once **both** games are recorded. Compare each side's combined total across the two games:

   ```
   score + elimination_bonus + coalesce(penalty_score, 0)
   ```

   Higher total takes +2; an exact tie gives +1 each. Note that `penalty_score` is included — penalties can flip a match bonus, not just a game result.

5. **Incomplete matches.** With fewer than 2 games recorded, `matchWinner` is `"incomplete"` and both sides get 0 match points. Game points already earned still count. Once the competition's `state` is `completed`, a match left with a **single** game (a one-game round, or a second game that was never played) is final instead: `matchWinner` takes that game's result, so the match card shows a winner rather than "In progress". It still earns no match bonus, so standings are unchanged.
6. **Round multiplier.** Both game points and the match bonus are multiplied by `competition_round.multiplier` (default `1`), so a round can be made worth double or more. Win/loss/draw _counts_ are never scaled — only points. Admins set the multiplier per round in `/admin/competitions/[slug]/rounds`; a non-1 multiplier is surfaced as a "N× points" badge on the round.
7. Sum per team across all matches in a round or the full competition for standings.
8. **Adjustments.** On the whole-competition standings only, each team's
   `competition_team_adjustment.points` are added to its points (`applyTeamAdjustments()` in
   `lib/match-points.ts`) before sorting, and reported separately as `adjustmentPoints`. The
   standings table marks an adjusted total with `*` and lists every adjustment under the table.
   A single round's or pool's standings ignore them.

Implemented in `packages/db/src/queries/competition-tournament.ts`.

---

## Trios Competitions

A **trios** competition (`format = 'trios'`) is a team competition in which each side of a match
is two teams of three — **trios** — playing together as one six-player team. Trios are ordinary
`competition_team` rows with their own rosters, logos, mercs and team pages. The pairings change
over the schedule, so every trio plays both with and against the others.

### Schema

A match records its pairing in `competition_match.team1_id` + `team1_partner_id` (side 1) and
`team2_id` + `team2_partner_id` (side 2). `competition_match_game` is unchanged: a game still has
exactly two non-neutral `sm5_game_team` rows, and `team1_game_team_id` is the one side 1 played as.
Reingest preservation is therefore untouched.

The partner columns are what make a match a trios match. Queries don't branch on the format to
read them — a null partner simply contributes nothing — so switching a competition's format away
from `trios` leaves any partners already set still counting. Clear them first.

### Points

Game points and the match bonus are computed **per side**, exactly as in
[Points Calculation](#points-calculation) (the bonus compares the whole side's
`score + elimination_bonus + penalty_score`). Then **both trios on the side receive the full
amount**, along with the side's game and match W/L/D and team eliminations. If trios A and B sweep
C and D, A and B get 6 match points each and C and D get none.

Implemented in `computeTeamStats` (`packages/db/src/lib/match-points.ts`), which is pure and
covered by `match-points.test.ts`.

### Tiebreaker

Standings order on match points, then **trio score ratio**, then game wins
(`compareStandings`). For a trio, `scoreFor` / `scoreAgainst` are replaced by
`getPartnerScoreTotals`:

- **Trio score** — the sum, over the trio's rostered players (**mercs included**), of
  `sm5_scorecard.score` plus that player's own non-rescinded `sm5_game_penalty.score_value`.
- **Against** — the same per-player net score summed over **every** scorecard on the opposing side
  in those games (guests included).

Elimination bonuses and team-level penalties (`sm5_game_team_penalty`) can't be attributed to one
trio, so they are left out of both — they still affect game results and the match bonus. A sub
only counts towards a trio once they are on its roster (normally as a merc); an unrostered player
counts for nobody's trio score.

### Which trio a scorecard belongs to

Both trios share one game team, so the game team alone can't say whose a scorecard is. Team pages
(roster games played, unassigned players, per-player stats) credit a scorecard on a trio's side
to that trio **unless the player is rostered on that match's partner trio instead**
(`teamScorecardSql`). A player on neither roster appears as unassigned on both trios until an admin
rosters them. For an ordinary team the partner is null and the rule reduces to "on the team's
side".

Mercenary stamping (`assignGameToMatch`) reads the rosters of both trios on each side.

### Display

- **Side names.** Every side-level label — admin match lists, the game-page header, game
  assignment, the games list, forfeits, the schedule, the analytics API — joins the two trios as
  `A & B`, so the game header reads _Round 1 · Match 3 · Game 2 · A & B vs C & D_.
- **Match cards** stack both trios on each side, each with its own logo and link.
- **Standings** say "Trio", add a _Trio Score_ column, and label the ratio _Trio Ratio_.
- A trio's team page lists every match it played in either slot.

### Admin

Choose **Trios** as the format on the competition form. Match forms (add match, edit teams inline,
and the match page) then show four pickers, `A + B vs C + D`, and disable any trio already chosen
in another slot. Round-robin generation is hidden for trios — pairings are set by hand — and a
round needs at least four trios before matches can be added.

## Duos Competitions

A **duos** competition (`format = 'duos'`) is the trios format with teams of two: each side of a
match is three **duos** playing together as one six-player team. Every rule of
[Trios Competitions](#trios-competitions) applies unchanged, with "trio" read as "duo" and "both"
as "all three":

- **Schema.** Side 1 is `team1_id` + `team1_partner_id` + `team1_partner2_id`, side 2 likewise.
  `partner2` is null outside duos. The distinct-teams check covers all six slots.
- **Points.** All three duos on a side receive the side's full game points, match bonus, W/L/D and
  team eliminations (`computeTeamStats`). If A, B and C sweep D, E and F, each of A, B and C gets
  6 match points.
- **Tiebreaker.** _Duo score ratio_ — each duo's own rostered players' net score against the
  opposing side's, via the same `getPartnerScoreTotals`.
- **Scorecard attribution.** A scorecard on a duo's side counts for that duo unless the player is
  rostered on one of the match's other two duos on that side instead (`teamScorecardSql`).
  Mercenary stamping reads all three rosters on each side.
- **Display.** Side names join all three as `A & B & C`; match cards stack three duos per side;
  standings say "Duo", with _Duo Score_ and _Duo Ratio_ columns.
- **Admin.** Choose **Duos** on the competition form. Match forms show six pickers,
  `A + B + C vs D + E + F`. Round-robin generation is hidden, and a round needs at least six duos
  before matches can be added.

The code shares one path for both formats: `teamsPerSide(format)` (2 for trios, 3 for duos, 1
otherwise) and `isPartnerFormat(format)` in `packages/db/src/queries/admin.ts` drive the admin
pickers and the standings tiebreak, and the queries simply read every partner slot.

---

## Laserball Competitions

A **Laserball competition** (`game_type = 'lb'`) is a tournament: teams with set rosters playing
two-half matches, each team playing one half on each side. `format` is always `team` (a CHECK
enforces it); the solo, no-scoring, trios and duos formats do not exist for Laserball.

### What is shared, and what is not

Teams, rosters (including mercenary flags), rounds, pools, matches and adjustments are the same
tables and the same admin pages as SM5. What differs is how a match is played and scored:

- **A match is one `lb_match`.** `lb_match.competition_match_id` points at the slot it fills. No
  `competition_match_game` rows are written for a Laserball game.
- **Side 1 is team 1.** When an admin assigns halves that were linked the other way round, the
  assignment swaps every half's `side1` / `side2` first (`assignLbMatchToCompetitionMatch`).
- **Assigning files the games.** Assigning sets `game.competition_id` on every half and stamps
  mercenaries. Unassigning empties the slot but leaves the halves linked to each other and in the
  competition.

Queries live in `packages/db/src/queries/competition-laserball.ts`; the arithmetic is pure, in
`packages/db/src/lib/lb-match-points.ts`, with unit tests.

### Points

- The match goes to the team with more **goals over every half played** (`lb_game_team.score`)
  — the aggregate, not the number of halves won.
- **Overtime** is extra halves (usually two, so each team plays a side again), played only when
  the regulation halves are level. Their goals are summed with the rest, so in practice the
  overtime halves' sum decides it. Level totals, with or without overtime, are a **tie**.
- Wherever a result is shown — the standings match list, team pages, the game page, game lists
  and the admin pages — a match that went to overtime carries an **OT** badge, and each overtime
  half is labelled OT 1, OT 2, …
- **Win = 1 point, tie = 0.5 each, loss = 0**, multiplied by the round multiplier. Nothing is
  awarded per half.
- A match missing a regulation half earns nothing. Once the competition is `completed`, such a
  match shows that half's result as final, but still earns no points.
- An excluded half counts as not reported.
- Standings cover the non-finals rounds (or one selected round), like SM5. Adjustments apply to
  the whole-competition table only.

### Standings

Columns: MP (complete matches), W, T, L, Pts, **GF**, **GA**, **GD**. Goals for and against
count every linked half played, overtime and incomplete matches included.

Order: points, then goal difference, then goals for, then points in complete matches among the
teams still tied (head to head), then team name.

### Mercenaries

The roster flag works as in SM5 and is copied onto `lb_scorecard.is_mercenary`. Unlike SM5's, the
Laserball stamp (`stampLbMercenaries`) sets the flag both ways from the rosters, so it is exact
whenever it runs: on assignment, when a roster's merc flag changes (`setMercenaryAction`), and
after a Laserball reingest rebuilds the scorecards (`bulk-reingest-lb.ts`). Mercenary scorecards
are left out of a team's player totals.

### Display

- `/standings?scope=competition&competition=<slug>` — the same URL as SM5. The standings page
  has no SM5/Laserball toggle: its picker lists competitions of both types (Laserball ones
  labelled) and the selected competition's `game_type` decides what renders — here the table,
  then a match card per match by round, each half's goals linking to its game. Finals rounds
  sit on the Finals tab with the Challonge bracket.
- `/competitions/<slug>/teams/<team>` — the roster with goals, assists, steals, blocks, passes,
  clears and possession over the competition, then the team's matches.
- The Laserball game page shows _Competition · Round · Match · A vs B_ above the title.
- `/games?game=lb` offers Laserball competitions in the competition scope. It selects on
  `game.competition_id`, so it lists unassigned games too. (Laserball players and leaderboards are
  still stubs.)
- The query API's `resolve` returns each competition's `game_type`; scoping a query to a
  competition of the other game type is an `invalid_scope` error.

### Admin

Choose **Laserball** as the game when creating the competition; it cannot be changed later.
Bulk-assign games by center and date range — it only takes games of the competition's own type.
On each match page, either pick halves already linked as a match (from the game page) and say
which side team 1 was, or pick two of the competition's unlinked games and the team team 1
played as in each; the earlier game becomes half 1. Overtime halves are added one at a time
from the game page (each says which team was Side 1), and any can be removed. A match already in
a competition files a new overtime half into it and stamps its mercenaries. There is no forfeit
flow.

Ingest files a game into a competition from its S3 key prefix only when the game types match; a
mismatched game is ingested as social, with a warning.

### Converting an earlier event

`packages/db/src/scripts/create-lb-tournament.ts` builds a Laserball competition from a JSON
manifest of teams, rosters (IPL ids) and each match's game slugs. It maps each half's sides by
roster majority, adds anyone playing on a side outside that team's roster as a mercenary, links
the halves and stamps them, all in one transaction (`--dry-run` rolls back). Games listed under
`unassignedGames` are filed into the competition with no match.

The first Syracuse tournament (13, 14 and 16 July 2026) is converted this way, from
`src/scripts/data/lb-tournament-syracuse-2026.json`. Team names are placeholders. Two four-game
sequences — Team 1 v Team 2 on 13 July (10:41–11:04) and Team 3 v Team 4 on 16 July
(09:34–09:50) — are filed but unassigned until the coordinator confirms what was played.

---

## Solo Competitions

A **solo** competition (`format = 'solo'`) scores individual performance instead of team results.
It has **no teams, rounds, pools, matches, or mercenaries**. Every game with
`game.competition_id = <the competition>` and `exclude = false` counts — there is no such thing as
an "unassigned game" here, because there is no match slot for a game to be assigned to.

### Standings

Ranked by **Total MVP**, descending. Ties break on Avg MVP, then callsign.

| Column        | Definition                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Total MVP     | Sum of `mvp_points` over the player's **counted games**, plus `handicap × gamesCounted`.         |
| Handicap      | `competition_player.handicap`. Whole number, may be negative. Admin-set, defaults to 0.          |
| Avg MVP       | Mean `mvp_points` over **all** the player's games in the competition. **Excludes the handicap.** |
| Avg Score     | Mean `score` over **all** the player's games in the competition.                                 |
| Games Counted | The size of the counted set.                                                                     |

**Counted games.** For each position the player has played, take their top games by `mvp_points`:
**10 for Scout (position 3), 5 for every other position.** With positions 1–5 that caps Games
Counted at `4 × 5 + 10 = 30`. The cap is a property of the data, not a SQL constraint —
`sm5_scorecard.position` is a plain integer with no enum or CHECK, so the query's `CASE … ELSE 5`
handles any value rather than silently dropping games and desyncing the counted set from the
averages.

> **Avg MVP × Games Counted does not equal Total MVP, by design.** The averages describe a
> player's form across every game they played; Total MVP is a best-N total that also carries the
> handicap. They answer different questions and are not meant to reconcile.

**The handicap is applied per counted game**, not once to the total. Because it is a constant per
player, adding it before or after the top-N selection picks the same games.

### Enrollment

Only players in `competition_player` appear in the standings. Where a team competition's standings
page shows admins an "unassigned games" block, a solo competition shows **unenrolled players** —
anyone with a scorecard in the competition and no enrollment row. Each row takes a handicap and an
Add button; a bulk "Enroll all at 0" enrolls everyone at once. Guests (`sm5_scorecard.player_id IS
NULL`) are excluded structurally and can never be enrolled.

Un-enrolling a player removes them from the standings and returns them to the unenrolled block. It
does not touch their scorecards.

### Query routing

Competition-scoped leaderboards normally select games through `competition_match_game`, which
yields nothing for a competition with no matches. `leaderboardScopeConditions`
(`packages/db/src/queries/competition-solo.ts`'s sibling in
`packages/db/src/queries/competition-tournament.ts`) therefore switches on
`GameScopeFilter.format`: solo competitions select on `game.competition_id` directly, and the
pool/finals toggles — meaningless without rounds — are not applied. The same switch is made in
`getCompetitionPlayerStats`, which additionally sources its player universe from
`competition_player` rather than team rosters.

Solo standings themselves live in `packages/db/src/queries/competition-solo.ts`.

`sm5_scorecard.is_mercenary` is only ever stamped by `assignGameToMatch`, which solo competitions
never call, so the flag is uniformly `false` and is deliberately not filtered on.

---

## No Scoring Competitions

A **no-scoring** competition (`format = 'none'`) is an event whose scoring is maintained by a third
party. LFstats is the record of its scorecards and nothing else — there is no standing to compute,
so none is computed. It has **no teams, rounds, pools, matches, mercenaries or enrolments**: it is
simply the set of games carrying its `competition_id`.

**It is still `type = 'competitive'`.** No Scoring describes where the scoring lives, not whether
the games count. They feed the all-competitive aggregate, the competition picker, and the
cross-center competitive stats exactly like any other competitive event. Nothing about routing
changes; only the standings shape does.

### Display

`/standings` renders the same four blocks a social night does, flat across the whole event rather
than broken out by day:

1. every scorecard (`NightlyStatsTable`),
2. the per-player summary (`NightlySummaryTable`),
3. the medic-hits leaderboard,
4. the game list.

The one deliberate difference from the nightly view is that the summary table renders **without its
▲/▼ trend icons**. Those compare a player against their lifetime _social_ average _at one center_
(`getPlayerSocialAveragesByCenter`), which is not a meaningful baseline for a competitive event that
may span several centers — so `NightlySummaryTable`'s `lifetimeAvgs` prop is optional and simply
omitted here.

There is no unassigned-games block: with no match slots to fill, every game in the event is
"unassigned" by definition, so the block would just re-list the whole event.

`GET /api/competitions/[slug]/standings` returns **404** with an explanatory message rather than an
empty array, since neither standings shape applies.

### Admin

`/admin/competitions/[slug]` keeps only what such an event has: the details card, bulk assign, and
the game list (titled "Games", not "Unassigned Games"). The Teams, Rounds and Enrolled Players cards
are all hidden. Games arrive the usual two ways — bulk-assigned by center and date range, or filed
at ingest by the competition-slug prefix on the S3 key.

### Query routing

`getCompetitionGameDetails` (`packages/db/src/queries/games.ts`) is the competition-wide twin of
`getNightlyDetails`; both are thin wrappers over the shared `buildGameDetails` fan-out, differing
only in which games they select. `leaderboardScopeConditions` and `getCompetitionPlayerStats` route
`none` down the same match-free path as `solo`, except that the player universe comes from the
scorecards themselves — there is no enrolment table to read.

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

## Browsing Competitions

`/competitions` is the public index of every competition, reached from **Competition → Browse**
in the sidebar. It renders one section per `competition.category`, each a grid of cards linking
to that competition's standings (`/standings?scope=competition&competition=<slug>`).

| Category         | What belongs in it                                                        |
| ---------------- | ------------------------------------------------------------------------- |
| `internationals` | The big annual world/continental championships — Internationals, ECT, WCT |
| `tournament`     | Every other tournament-style event: shindigs, random draws, invitationals |
| `league`         | A local season run at one center over weeks, team or solo                 |

- **`tournament` is the default**, so a new competition lands in the largest bucket without
  claiming anything about scale or recurrence. Admins pick the category on the competition form.
- **Scope matches the competition picker.** `getBrowsableCompetitions()`
  (`packages/db/src/queries/competition-tournament.ts`) applies the same filter as
  `getCompetitiveCompetitions()` — competitive only, no `preshow` events — so a competition
  can never appear on the browse page before it appears in the picker.
- **Card counts are public-facing, not admin figures.** Games exclude `game.exclude = true`
  rows, so the count on a card can be lower than the one on `/admin/competitions`, which counts
  every assigned game. The participant count is teams for a team competition and _enrolled_
  players for a solo one; a solo competition with nobody enrolled yet simply shows no
  participant badge.
- **The category has no effect on stats.** Nothing in the routing table above reads it.

### Backfill

The column was added with a default, so every pre-existing competition started in `tournament`.
`packages/db/src/scripts/backfill-competition-category.ts` moves the ones that belong elsewhere:

```
pnpm --filter @lfstats/db backfill-competition-category --dry-run
pnpm --filter @lfstats/db backfill-competition-category
```

Its slug → category map is a set of judgement calls, not derived data — WCT and ECT were read
as internationals, and the recurring local seasons (Brisbane, Loveland, Darmstadt, St George,
Auckland, LLT) as leagues. Re-running re-asserts the map, so it is a one-time backfill; after
it, change a category in the admin UI, not in the script.

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

Competitions from before go-live were carried over from the legacy database; how that was
done, and where the result differs from the legacy site, is recorded in
[Legacy_Migration_TDF_Events.md](Legacy_Migration_TDF_Events.md).
