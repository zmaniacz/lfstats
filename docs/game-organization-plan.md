# SM5 Game Organization — Implementation Plan

**Scope:** Adding game organization to the SM5 stats application — formal events, a social-game tagging system, player favorites, and a stat-exclusion flag. This plan covers schema, ingest impact, stat routing, and a build order suitable for Claude Code.

**Out of scope (deliberately deferred):** the internal structure of competitive events — constructed teams/rosters, matches, color-swap mapping, match points, and brackets. This plan only establishes the `Game → Event` association so that structure has something to hang off later.

---

## Core Concepts

Four independent concerns sit on top of a `Game`, plus the deferred event structure:

1. **Event** — a first-class grouping a game _belongs to_ (a competition, league, or multi-site fun gathering). First-class because it has its own metadata and will later carry structure that a flat label cannot express.
2. **Tags** — a freeform, center-defined, many-to-many overlay used to classify and filter _social_ (non-event) games. Purely additive: tags never change which aggregate a game flows into, they only let you drill into subsets.
3. **Favorites** — a per-player bookmark on a game. A separate concern from center tags (different owner, scope, and lifecycle).
4. **Exclude** — a hard "don't count this in any analysis" flag (ref-aborted/replayed games, tests, anomalies). Excluded games are still fully ingested and replayable; they just never reach aggregates.

A game is **"social"** simply by having no event — no marker tag is required for that.

---

## Schema Additions

Add to `packages/db/schema.ts` (Drizzle). All PKs are `uuid` with `defaultRandom()`, consistent with existing tables.

### `Event` — _not_ center-scoped

| Column           | Type      | Null     | Description                                                                                                                                                            |
| ---------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid      | never    | Primary key.                                                                                                                                                           |
| `name`           | string    | never    | Display name (e.g. "Internats 2026").                                                                                                                                  |
| `type`           | enum      | never    | `competitive` \| `social`. Drives stat routing: competitive events feed the all-competitive aggregate; social events are non-competitive gatherings.                   |
| `host_center_id` | uuid FK   | nullable | Optional reference to `Center` for display. Null for true multi-center events. Events are **not** scoped to a single center — games from any center may belong to one. |
| `start_date`     | date      | never    | Event start.                                                                                                                                                           |
| `end_date`       | date      | nullable | Event end; null for single-day or open events.                                                                                                                         |
| `description`    | string    | nullable | Free text.                                                                                                                                                             |
| `created_at`     | timestamp | never    | Defaults to now.                                                                                                                                                       |

> **Naming note:** the existing `GameEvent` table is the replay event log (one row per TDF line type 4 event). Keep this table named `Event` (or `Competition` if you prefer to avoid any overlap) — it is distinct from `GameEvent`.

> Cross-center aggregation needs no special plumbing: `Player` is keyed on the global iplId, so the same person at two centers is one `Player` row and pools correctly.

### `Game` — two new columns

| Column     | Type    | Null     | Default | Description                                                                                                                  |
| ---------- | ------- | -------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `event_id` | uuid FK | nullable | null    | The event this game belongs to. Null = a social (non-event) game. A game belongs to at most one event.                       |
| `exclude`  | boolean | never    | `false` | If true, the game is omitted from all aggregates and leaderboards. Still stored, replayable, and visible in an archive view. |

### `GameTag` — center-scoped

| Column        | Type      | Null     | Description                                                                                                                              |
| ------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid      | never    | Primary key.                                                                                                                             |
| `center_id`   | uuid FK   | never    | Owning center.                                                                                                                           |
| `name`        | string    | never    | Tag label (e.g. "practice", "internats 2026", "staff").                                                                                  |
| `color`       | string    | nullable | Hex RGB for UI display.                                                                                                                  |
| `description` | string    | nullable | Free text.                                                                                                                               |
| `archived`    | boolean   | never    | Default `false`. Archived tags are hidden from pickers and active lists but their assignments are preserved. See **Tag deletion** below. |
| `created_at`  | timestamp | never    | Defaults to now.                                                                                                                         |

**Unique key:** `(center_id, name)` — matches the `Battlesuit`/`Target` center-scoping pattern.

### `GameTagAssignment` — many-to-many join

| Column        | Type      | Null     | Description                 |
| ------------- | --------- | -------- | --------------------------- |
| `id`          | uuid      | never    | Primary key.                |
| `game_id`     | uuid FK   | never    | References `Game`.          |
| `tag_id`      | uuid FK   | never    | References `GameTag`.       |
| `assigned_by` | string    | nullable | Optional admin attribution. |
| `assigned_at` | timestamp | never    | Defaults to now.            |

**Unique key:** `(game_id, tag_id)`.

### `PlayerFavoriteGame` — per-player bookmark

| Column       | Type      | Null     | Description                                |
| ------------ | --------- | -------- | ------------------------------------------ |
| `id`         | uuid      | never    | Primary key.                               |
| `player_id`  | uuid FK   | never    | References `Player`.                       |
| `game_id`    | uuid FK   | never    | References `Game`.                         |
| `note`       | string    | nullable | Optional player note ("triple nuke game"). |
| `created_at` | timestamp | never    | Defaults to now.                           |

**Unique key:** `(player_id, game_id)`.

---

## Classification & Routing Precedence

A game's stat universe is resolved by precedence, evaluated per query:

1. **`exclude = true`** → removed from every aggregate; appears only in the archive view.
2. **`event_id` present** → routes into that event's stats. If `event.type = competitive`, it also feeds the all-competitive meta-aggregate.
3. **`event_id` null** → a social game.

**Tags never participate in routing.** They are an additive filter applied on top of any scope above (in practice, almost always on social games).

---

## Stat Universes & Query Patterns

| Page / aggregate                           | Filter                                                                                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nightly**                                | `center_id = X AND date(start_time) = D AND event_id IS NULL AND exclude = false`. Date math is direct — timestamps are stored in center-local time (`Center.timezone` is display-only).                                                                  |
| **Social aggregate** (all non-competitive) | `exclude = false AND (event_id IS NULL OR event.type = 'social')`. **Includes social-type events**, not just non-event games. Optional `center_id`; optional `start_time >= now - 90d`; optional tag filter.                                              |
| **Tag drill-down**                         | The social aggregate plus a tag filter. **AND semantics** — a game must carry _all_ selected tags (e.g. "practice" AND "internats 2026"). Implement as one `EXISTS` per selected tag, or a join with `HAVING count(distinct tag_id) = <number selected>`. |
| **Per-event**                              | `event_id = E AND exclude = false`.                                                                                                                                                                                                                       |
| **All competitive**                        | join `Event WHERE type = 'competitive'`, `exclude = false`. Cross-center pooling is automatic via the global `Player` identity.                                                                                                                           |

> These are **application** queries, not Chomper's. Place them in a new file under `packages/db/queries/` (e.g. `stats.ts`) — not in `chomper.ts`, which stays ingest-only.

---

## Ingest / Chomper Impact — Minimal by Design

None of these concepts exist in the TDF, so Chomper computes none of them. Its only change:

- The `Game` insert now writes `event_id = null` and `exclude = false` as defaults. Update the `Game` insert in `ingester.ts` and the corresponding insert type.

Everything else — events, tags, assignments, favorites, and the `exclude` toggle — is populated later by the web app. Chomper remains insert-only and stateless.

> **Re-ingest caution:** Chomper's duplicate check (`findGameByNaturalKey`) skips an already-ingested game, so admin-applied metadata is safe today. If a _force re-ingest_ path is ever added, it must preserve `event_id`, `exclude`, and tag assignments rather than overwriting the `Game` row.

---

## Admin & Player Operations (Web App)

- **Events:** CRUD. Assigning games to an event — include a **bulk assign by center + date range**, since a week-long competition is many games.
- **Tags:** CRUD per center; assign/unassign on a game.
- **Tag deletion (chosen approach):**
  - **Soft-archive (default "delete"):** set `archived = true`. Tag leaves the picker and active lists; existing assignments are preserved so historical filters keep working. Reversible via un-archive.
  - **Permanent delete:** removes the `GameTag` row and its assignment rows outright. Reserve for genuine mistakes (typo/test tags). Irreversible.
  - **Merge:** re-point one tag's assignments onto another tag, then remove the empty source. The usual fix for duplicates ("Pracitce" → "Practice").
- **Exclude:** toggle on a game.
- **Favorites:** player add/remove, with optional note.

---

## Settled Decisions

- Events are **not center-scoped** (host center optional; multi-center supported).
- A game belongs to **at most one event**.
- "Social" = **absence of an event**; no marker tag needed.
- Tags are a **freeform, center-scoped, many-to-many** overlay used for filtering, not routing.
- Multi-tag filters use **AND** (game must carry all selected tags).
- The **social aggregate includes social-type events**, with per-event as a separate lens.
- `exclude` hard-removes a game from aggregates; archive view shows excluded games.
- **Favorites** are a separate per-player table.
- Tag deletion: **soft-archive by default**, with permanent-delete and merge as additional actions.

---

## Suggested Build Order

1. **Schema migrations** (`packages/db/schema.ts`): `Event`; the two `Game` columns; `GameTag`; `GameTagAssignment`; `PlayerFavoriteGame`.
2. **Chomper change:** add the two defaulted `Game` columns to the insert in `ingester.ts` and the insert type. (No simulation or parser changes.)
3. **Stat query functions:** new file under `packages/db/queries/` implementing the query patterns above.
4. **Admin UI:** events (incl. bulk assign), tags (incl. archive/permanent-delete/merge), exclude toggle, archive view.
5. **Player favorites:** add/remove and a favorites list view.

---

## Deferred / Future

- Competitive event internal structure: constructed teams/rosters, matches, color-swap mapping, match points, brackets.
- Optional cross-center tagging (currently center-scoped; a cross-center "practice series" is closer to a social-type event than a tag).
- OR semantics for multi-tag filters (AND is the v1 default).
