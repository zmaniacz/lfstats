# SM5 Core Database Schema

**Game Type:** Space Marines 5 (SM5)  
**Scope:** Tables required to record the complete end state of a single game  
**Last Updated:** 2026-08

---

## Overview

This document specifies the core table set required to record a single SM5 game from a TDF file. It covers identity and reference tables (`Center`, `Player`, `PlayerCallsignHistory`, `Battlesuit`, `Target`), game structure tables (`Game`, `GameTeam`), non-player entity tables (`GameTarget`, `GameTargetDestruction`, `GameReferee`), player performance tables (`Scorecard`, `GamePlayerInteraction`), penalty tracking (`GamePenalty`, `GameTeamPenalty`), MVP scoring tables (`MvpModel`, `ScorecardMvp`), and replay data tables (`GameEvent`, `GamePlayerState`).

**Out of scope — documented elsewhere:**

- **Laserball tables** (`lb_game_team`, `lb_scorecard`, `lb_game_event`, `lb_game_player_state`, `lb_game_player_interaction`, `lb_match`, `lb_match_game`) — see [chomper-design.md](chomper-design.md#laserball-pipeline-mission-type-28) and [Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md). Note that `Game` itself is **shared** between SM5 and Laserball and is specified here.
- **Competition tables** (`competition`, `competition_team`, `competition_round`, `competition_pool`, `competition_match`, …) — see [Competition_Structure.md](Competition_Structure.md).
- **Auth and access tables** (`auth_user`, `auth_session`, `user_roles`, `api_key`) — see [Role_Spec.md](Role_Spec.md) for the role model.
- **Tagging and favorites** (`game_tag`, `game_tag_assignment`, `user_favorite_game`, `user_favorite_player`).

**Full table inventory:**

- `Center`
- `Player`
- `PlayerCallsignHistory`
- `Battlesuit`
- `Target`
- `Game`
- `GameTeam`
- `GameTarget`
- `GameTargetDestruction`
- `GameReferee`
- `GamePenalty`
- `GameTeamPenalty`
- `Scorecard`
- `GamePlayerInteraction`
- `MvpModel`
- `ScorecardMvp`
- `GameEvent`
- `GamePlayerState`

---

## Reference & Identity Tables

### `Center`

One row per physical laser tag location. Populated manually on first load; updated manually as needed. The natural key from the TDF (`{country-code}-{site-code}`) is stored as the lookup key for ingestion.

| Column         | Type    | Null     | Description                                                                                                                                                                                                                                                                          |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | uuid    | never    | Primary key.                                                                                                                                                                                                                                                                         |
| `country_code` | integer | never    | Numeric country code from the TDF composite identifier.                                                                                                                                                                                                                              |
| `site_code`    | integer | never    | Numeric site code from the TDF composite identifier. Unique within a country, not globally.                                                                                                                                                                                          |
| `name`         | string  | never    | Human-readable name of the center (e.g. "Laserforce Auckland"). Manually entered.                                                                                                                                                                                                    |
| `short_name`   | string  | never    | Abbreviation used to refer to the center in compact display contexts (e.g. "LLT", "SYR"). Manually entered.                                                                                                                                                                          |
| `city`         | string  | nullable | City the center is located in. Manually entered. Optional — useful for display but not required for any system function.                                                                                                                                                             |
| `country_name` | string  | nullable | Human-readable country name. Manually entered. Separate from `country_code` which is an opaque integer in the TDF.                                                                                                                                                                   |
| `timezone`     | string  | nullable | IANA tz database string for the center's local timezone (e.g. `Pacific/Auckland`, `America/Los_Angeles`). Not used in any timestamp computation — all timestamps are stored as local time. Stored for display purposes only, so the UI can render timezone labels. Manually entered. |

**Constraints:**

- `(country_code, site_code)` is a unique key — the composite is the natural identifier used to match TDF records to Center rows at ingest time.

**Notes:**

- All game timestamps ingested from this center's TDF files are stored as local time with no UTC conversion. The `timezone` column is purely informational.
- There is no active/inactive flag. Centers are present in the database if they have games; removal is handled manually if ever needed.

---

### `Player`

One row per registered Laserforce member, keyed by their globally unique iplId. Created on first encounter during TDF ingestion. Guest players (hardware `@NNN` ids with no iplId) do not get a `Player` row — they appear in `Scorecard` with a null `player_id`.

| Column             | Type      | Null     | Description                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | uuid      | never    | Primary key.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `ipl_id`           | string    | never    | Globally unique Laserforce member identifier (`#xxxxxxx`). Natural key — used for cross-site identity and as the lookup key at ingest time. Also used to construct the iPlayLaserforce profile URL: `https://www.iplaylaserforce.com/mission-stats/?t={ipl_id_without_hash}`.                                                                                                                                                     |
| `member_id`        | string    | nullable | Center-scoped member identifier (`{country-code}-{site-code}-{member-code}`), sourced from the `memberId` field on line type 3. A stable human-readable alias for the iplId — the same player will always have the same `member_id` at a given center. Set once on first encounter from a 2.006 or later file; never updated after that. Null if the player has only been seen in older file versions where this field is absent. |
| `current_callsign` | string    | never    | The player's most recently seen display name. Updated on every ingest where this player appears, regardless of whether the callsign changed.                                                                                                                                                                                                                                                                                      |
| `first_seen_at`    | timestamp | never    | Timestamp of the first game this player appeared in. Set once on row creation, never updated. Stored in the local time of the center where they were first seen.                                                                                                                                                                                                                                                                  |

**Constraints:**

- `ipl_id` is a unique key.

**Ingest behavior:**

- On first encounter, create a new row. Set `member_id` if present in the file, otherwise leave null.
- If `member_id` is null on an existing row and the player appears in a 2.006 file with a `memberId` field, populate it then. Never overwrite an existing `member_id` value.
- Update `current_callsign` on every ingest regardless of whether it changed.

---

### `PlayerCallsignHistory`

Tracks callsigns used over time for display on player profile pages. One row per distinct callsign per player, recording when it was first and last observed. The current callsign is always also reflected on `Player.current_callsign` — this table exists for historical display, not as the authoritative per-game record (that is `Scorecard.callsign`).

| Column          | Type      | Null  | Description                                                                                                                       |
| --------------- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid      | never | Primary key.                                                                                                                      |
| `player_id`     | uuid FK   | never | References `Player`.                                                                                                              |
| `callsign`      | string    | never | The callsign as it appeared in TDF files during this period.                                                                      |
| `first_seen_at` | timestamp | never | Timestamp of the first game where this callsign was observed for this player.                                                     |
| `last_seen_at`  | timestamp | never | Timestamp of the most recent game where this callsign was observed. Updated on ingest if the player is still using this callsign. |

**Constraints:**

- `(player_id, callsign)` is a unique key — one row per distinct callsign per player.

**Ingest behavior:**

- On each ingest, look up the player's callsign from the TDF.
- If a row for `(player_id, callsign)` already exists, update `last_seen_at`.
- If no row exists for this callsign, insert a new row and update `Player.current_callsign`.
- `Player.current_callsign` is always set to the callsign from the most recently ingested game for that player, even if it reverts to a previously used name.

**Notes:**

- This table tracks distinct callsigns used, not contiguous callsign periods. A player who goes "Viper" → "Ghost" → "Viper" will have two rows, not three. `last_seen_at` on the "Viper" row will be updated when the player returns to that name.

---

### `Battlesuit`

One row per physical battlesuit at a center. Created on first encounter during ingest. The natural key is `(center_id, name)` — suit names are unique within a center by software constraint.

| Column        | Type    | Null     | Description                                                                                                                                                                                                     |
| ------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid    | never    | Primary key. Referenced by `Scorecard.battlesuit_id` and `GameReferee.battlesuit_id`.                                                                                                                           |
| `center_id`   | uuid FK | never    | References `Center`.                                                                                                                                                                                            |
| `name`        | string  | never    | Display name of the battlesuit as configured at the center (e.g. "Viper", "Ghost"). Updated on ingest if changed — no name history is kept.                                                                     |
| `hardware_id` | string  | nullable | The `@NNN` hardware identifier for this suit. Opportunistically populated — present when an unregistered guest uses the suit or it appears as a referee suit, null otherwise. Updated on ingest if encountered. |

**Constraints:**

- `(center_id, name)` is a unique key.

**Ingest behavior:**

- Look up by `(center_id, name)`. If not found, create a new row. Return the UUID either way.
- If `hardware_id` is null on an existing row and a `@NNN` id is encountered for this suit, update it.
- If `name` changes for a known `hardware_id`, update `name` — this is a deliberate overwrite, not a new row. No name history is kept.

---

### `Target`

One row per physical target unit at a center. Keyed by `(center_id, hardware_id)` — targets always have a reliable `@NNN` id since they are never registered as players.

| Column        | Type    | Null  | Description                                                                                                                               |
| ------------- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid    | never | Primary key. Referenced by `GameTarget`.                                                                                                  |
| `center_id`   | uuid FK | never | References `Center`.                                                                                                                      |
| `hardware_id` | string  | never | The `@NNN` hardware identifier for this target unit. Unique within a center. Natural ingest key combined with `center_id`.                |
| `name`        | string  | never | Display name of the target as configured at the center (e.g. "Alpha", "Neutral"). Updated on ingest if changed — no name history is kept. |

**Constraints:**

- `(center_id, hardware_id)` is a unique key.

---

## Game Structure Tables

### `Game`

One row per TDF file ingested. The natural key is `(center_id, start_time)` — a physical location can only run one game at a given moment.

**This table is shared across game modes.** Both SM5 and Laserball write `Game` rows; the `type` column discriminates, and each mode's per-player and per-team data lives in its own set of tables (`sm5_*` vs `lb_*`).

| Column               | Type      | Null     | Description                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | uuid      | never    | Primary key.                                                                                                                                                                                                                                                                                                                                               |
| `center_id`          | uuid FK   | never    | References `Center`. Resolved at ingest from the `centre` composite key on line type 0.                                                                                                                                                                                                                                                                    |
| `competition_id`     | uuid FK   | nullable | The competition this game belongs to, or null for a social (non-competition) game. `ON DELETE SET NULL`. Set at ingest by resolving a competition-slug prefix on the S3 key (`index.ts` step 6b); an unrecognised slug logs a warning and leaves this null. Editable afterwards in the admin UI. See [Competition_Structure.md](Competition_Structure.md). |
| `start_time`         | timestamp | never    | When the game was initialized, from the `start` field on line type 1. Stored in the center's local time. Combined with `center_id` forms the natural unique key.                                                                                                                                                                                           |
| `tdf_filename`       | string    | never    | The original TDF filename as stored on S3 (e.g. `3-3_20260519201615_-_Space_Marines_5.tdf`). Used for debugging, re-ingestion, and linking to the raw file from the game view.                                                                                                                                                                             |
| `outcome`            | enum      | never    | How the game ended. See the outcome values below.                                                                                                                                                                                                                                                                                                          |
| `scheduled_duration` | integer   | never    | Configured game length in milliseconds from line type 1 `duration` field. Defaults to `900000` (15 minutes) for pre-2.001 files where the field is absent. Represents intended game length, not actual.                                                                                                                                                    |
| `actual_duration`    | integer   | never    | Actual elapsed game time in milliseconds, calculated as the timestamp of the `0101` Mission End event minus the `0100` Mission Start event timestamp. Will be less than `scheduled_duration` for elimination games that ended early.                                                                                                                       |
| `type`               | string    | never    | Game mode discriminator: `"sm5"` or `"lb"` (Laserball). Set from the line type 1 mission type — `5` → `"sm5"`, `28` → `"lb"`. Determines which set of child tables holds this game's data.                                                                                                                                                                 |
| `description`        | string    | nullable | Free-text admin annotation shown on the game page. Never set by ingest; preserved across re-ingest.                                                                                                                                                                                                                                                        |
| `exclude`            | boolean   | never    | Default `false`. If true, the game is omitted from all aggregates and leaderboards but remains stored, replayable, and visible. Set automatically at ingest when `outcome = "aborted"`, and toggleable by admins afterwards.                                                                                                                               |

**Outcome values:**

| Value         | Meaning                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `score`       | Time expired and the winner was determined by team score.                                                                                 |
| `elimination` | One team was fully eliminated before time expired (or within the 60-second run-to-time window). SM5 only — Laserball has no eliminations. |
| `draw`        | Time expired with both teams at exactly equal scores.                                                                                     |
| `aborted`     | The game did not complete normally. Sets `exclude = true` at ingest.                                                                      |
| `forfeit`     | Administratively recorded forfeit. Not produced by ingest.                                                                                |
| `replay`      | The game was replayed and this record is superseded. Not produced by ingest.                                                              |

**Constraints:**

- `(center_id, start_time)` is a unique key.
- Indexed on `start_time` and on `competition_id`.

**Notes:**

- Only mission types `5` (SM5) and `28` (Laserball) are ingested — any other line type 1 `type` is skipped entirely.
- `actual_duration` will equal `scheduled_duration` for score and draw outcomes. It will be shorter for elimination outcomes, except in the edge case where elimination occurred with 60 seconds or fewer remaining and the game ran to time — in that case `outcome` is still `elimination` but `actual_duration` will equal `scheduled_duration`.
- The `penalty` value from line type 1 is not stored on `Game` — it is applied per-event during ingest and its effect is captured in `GamePenalty.score_value`. For pre-2.003 files where the field is absent, default to `0`.
- `competition_id`, `description`, and `exclude` are **admin-owned metadata, not derived from the TDF**. Re-ingest paths (`bulk-reingest.ts`, `bulk-reingest-lb.ts`) snapshot and restore all three rather than overwriting the `Game` row.

---

### `GameTeam`

One row per team per game, including the Neutral team. The Neutral team is included to provide a consistent FK target for `GameTarget` — all target-team associations resolve cleanly through this table.

| Column              | Type    | Null     | Description                                                                                                                                                                                                                                        |
| ------------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | uuid    | never    | Primary key.                                                                                                                                                                                                                                       |
| `game_id`           | uuid FK | never    | References `Game`.                                                                                                                                                                                                                                 |
| `tdf_team_index`    | integer | never    | The zero-based team index from line type 2. Scoped to this game only — used during ingest to associate player Scorecards and `GameTarget` rows with their correct `GameTeam` row.                                                                  |
| `is_neutral`        | boolean | never    | True if this is the Neutral team — the non-competing grouping for targets and referees. Always false for competing teams. Use this flag rather than filtering on `name` to ensure correct behavior regardless of language or center configuration. |
| `name`              | string  | never    | Team name as configured at the center (e.g. "Red Team", "Green Team", "Neutral"), from line type 2 `desc`. Stored as a point-in-time fact.                                                                                                         |
| `colour_enum`       | integer | never    | Canonical color identifier from line type 2. Maps to a fixed lookup (0=None through 15=Rainbow). Authoritative color reference.                                                                                                                    |
| `colour_rgb`        | string  | nullable | Hex RGB color value for rendering (e.g. `#FF0000`), from line type 2 `colour-rgb`. Null for pre-2.004 files — derive from `colour_enum` lookup for display in that case.                                                                           |
| `score`             | integer | nullable | Sum of all player scores on this team at game end. Null for the Neutral team which has no players and no score. Derivable from Scorecard but denormalized here for query performance.                                                              |
| `elimination_bonus` | integer | nullable | Competition elimination bonus. `10000` if this team won by elimination, `0` otherwise. Null for the Neutral team.                                                                                                                                  |
| `penalty_score`     | integer | nullable | Live sum of non-rescinded `GamePenalty.score_value` (for players on this team) plus non-rescinded `GameTeamPenalty.score_value` (assessed directly against this team). Maintained by `recalculateGameResult()`. Null for the Neutral team.         |
| `result`            | enum    | nullable | This team's game result — `win`, `loss`, or `draw`. Null for the Neutral team. An eliminated team is always `loss` even if their `score` exceeds the winning team's.                                                                               |
| `eliminated`        | boolean | nullable | True if all players on this team ran out of lives before game end. Null for the Neutral team.                                                                                                                                                      |

**Constraints:**

- `(game_id, tdf_team_index)` is a unique key.

**Notes:**

- All queries over competing teams should filter on `is_neutral = false`. Aggregate queries such as win rates, average scores, and standings should always exclude the Neutral row.
- `score` does not include `elimination_bonus` — it is the raw sum of player scores as recorded in the TDF. The bonus is tracked separately so both components are visible.
- `score`, `elimination_bonus`, `result`, and `eliminated` are null for the Neutral team rather than 0 or false — null correctly reflects that these concepts do not apply, consistent with the position-specific null pattern established in `Scorecard`.
- For draw outcomes both competing teams will have `result = draw`, `eliminated = false`, and `elimination_bonus = 0`.

---

## Non-Player Entity Tables

### `GameTarget`

One row per target registered in a game. Represents the target's existence in that game regardless of whether it was destroyed. Destructions are recorded separately in `GameTargetDestruction`.

| Column         | Type    | Null  | Description                                                                                                                                                                                                 |
| -------------- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid    | never | Primary key.                                                                                                                                                                                                |
| `game_id`      | uuid FK | never | References `Game`.                                                                                                                                                                                          |
| `target_id`    | uuid FK | never | References `Target`.                                                                                                                                                                                        |
| `game_team_id` | uuid FK | never | References `GameTeam` — the team this target is associated with, including the Neutral `GameTeam` row for neutral targets.                                                                                  |
| `type`         | string  | never | The entity type string from line type 3 (`standard-target`, `beacon`, or `generator-target`). Stored as-is — all three are treated identically for game purposes but the hardware type is worth preserving. |

**Constraints:**

- `(game_id, target_id)` is a unique key.

**Notes:**

- Players cannot destroy their own team's associated target. This is a game rule enforced by the hardware — it does not need to be encoded in the schema but is relevant context for any query filtering target destructions by team alignment.
- A `game_team_id` referencing a `GameTeam` row where `is_neutral = true` indicates a neutral target.

---

### `GameTargetDestruction`

One row per target destruction event per game. A single target can be destroyed multiple times in a game — each player maintains their own independent 3-hit sequence against each target, so multiple players can destroy the same target. Row count per player should be consistent with `Scorecard.targets_destroyed` — useful as an ingest consistency check.

| Column           | Type    | Null  | Description                                                                                                                                                                     |
| ---------------- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid    | never | Primary key.                                                                                                                                                                    |
| `game_target_id` | uuid FK | never | References `GameTarget`.                                                                                                                                                        |
| `scorecard_id`   | uuid FK | never | References `Scorecard` — the player who destroyed this target.                                                                                                                  |
| `method`         | enum    | never | How the target was destroyed. `shot` for a standard 3-hit sequence (`0204`), `missile` for a single missile hit (`0303`), `awarded` for a post-elimination base award (`0B03`). |
| `time`           | integer | never | Milliseconds elapsed since mission start at which the destruction occurred, from the event timestamp.                                                                           |

**Notes:**

- `awarded` method rows (`0B03` events) only occur on early team elimination. The awarded player may not have hit the target at all during the game — their `GamePlayerInteraction` rows will show zero hits against that target. `awarded` destructions should be excluded from any accuracy or efficiency stats derived from this table.

---

### `GameReferee`

One row per referee registered in a game. A referee may log in with their iplId — in that case they link back to a `Player` record.

| Column          | Type    | Null     | Description                                                                                                               |
| --------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid    | never    | Primary key.                                                                                                              |
| `game_id`       | uuid FK | never    | References `Game`.                                                                                                        |
| `player_id`     | uuid FK | nullable | References `Player` if the referee logged in with an iplId. Null for referees using only a hardware id.                   |
| `ipl_id`        | string  | nullable | Denormalized iplId for query convenience, consistent with the pattern on `Scorecard`. Null if no iplId present.           |
| `callsign`      | string  | never    | Display name of the referee entity as it appeared in the TDF, from line type 3 `desc`.                                    |
| `battlesuit_id` | uuid FK | nullable | References `Battlesuit` if a battlesuit name was present on the line type 3 entry. Null for pre-2.003 files or if absent. |
| `hardware_id`   | string  | nullable | The `@NNN` hardware id from line type 3 if the referee used a hardware login rather than an iplId.                        |

**Notes:**

- A referee row will have either `player_id` + `ipl_id` populated (iplId login) or `hardware_id` populated (hardware login), but not both.
- Penalty counts assessed by referees during the game are captured in `Scorecard.penalties` on the penalized player and in `GamePenalty` — `GameReferee` does not track which referee issued which penalty directly. Join to `GamePenalty.referee_id` for that.
- Ingest note: duplicate referee entries for the same game should be deduplicated on the natural id field (`ipl_id` or `hardware_id`) during ingest.

---

## Penalty Table

### `GamePenalty`

One row per penalty assessed during or after a game. Populated at ingest from `0600` events and editable after the fact. The authoritative source for penalty score impact — `Scorecard.penalties` tracks only the count of in-game penalties and should not be used for score calculations.

| Column         | Type    | Null     | Description                                                                                                                                                                                |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | uuid    | never    | Primary key.                                                                                                                                                                               |
| `game_id`      | uuid FK | never    | References `Game`.                                                                                                                                                                         |
| `referee_id`   | uuid FK | nullable | References `GameReferee`. Null for penalties added manually after the fact with no associated referee entity in the TDF.                                                                   |
| `scorecard_id` | uuid FK | never    | References `Scorecard` — the player who received the penalty.                                                                                                                              |
| `score_value`  | integer | never    | Score change applied to the penalized player. Negative integer (e.g. `-500`). Initialized at ingest from the `penalty` field on line type 1. Editable after the fact.                      |
| `description`  | string  | never    | Human-readable description of the infraction. Defaults to `"Common Foul"` at ingest time. Free text — editable after the fact.                                                             |
| `time`         | integer | nullable | Milliseconds elapsed since mission start when the penalty occurred, from the `0600` event timestamp. Null for penalties added manually after the game with no corresponding in-game event. |

**Notes:**

- At ingest, one row is created per `0600` event. `score_value` is initialized from line type 1 `penalty` (defaulting to `0` for pre-2.003 files), `description` defaults to `"Common Foul"`, and `time` is set from the event timestamp.
- Post-game manually added penalties will have `time = null` and `referee_id = null` unless explicitly provided.
- `Scorecard.penalties` reflects only the count of `0600` events recorded at ingest and is never updated after the fact. Use `sum(GamePenalty.score_value)` for any score impact calculation.

---

### `GameTeamPenalty`

One row per penalty assessed directly against a team as a whole, rather than against an individual player — used for infractions not attributable to one specific player (e.g. a team delay-of-game call, a forfeit penalty, a roster violation). Always added manually by an admin from the game detail page; there is no TDF event that produces these. Unlike `GamePenalty`, there is no MVP impact — MVP is a player-level concept and does not apply to a team.

| Column         | Type    | Null     | Description                                                                                                                                                                                                 |
| -------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid    | never    | Primary key.                                                                                                                                                                                                |
| `game_id`      | uuid FK | never    | References `Game`.                                                                                                                                                                                          |
| `game_team_id` | uuid FK | never    | References `GameTeam` — the team that received the penalty. Never the Neutral team.                                                                                                                         |
| `referee_id`   | uuid FK | nullable | References `GameReferee`. Null for penalties added manually after the fact with no associated referee entity in the TDF.                                                                                    |
| `score_value`  | integer | never    | Score change applied to the penalized team. Negative integer (e.g. `-1000`). Editable after the fact.                                                                                                       |
| `description`  | string  | never    | Human-readable description of the infraction. Free text.                                                                                                                                                    |
| `time`         | integer | nullable | Milliseconds elapsed since mission start when the penalty occurred. Null for penalties added manually after the game with no corresponding in-game event.                                                   |
| `type`         | string  | never    | Free-text infraction label (e.g. "Forfeit", "Delay of Game"). Unlike `GamePenalty.type`, there is no fixed list of named infraction types to pick from — team-level infractions vary too much to enumerate. |
| `in_game`      | boolean | never    | True if assessed during the game itself, false if added post-game by an admin.                                                                                                                              |
| `rescinded`    | boolean | never    | True if the penalty has been rescinded — excluded from `GameTeam.penalty_score` while true, but the row is preserved for history.                                                                           |

**Notes:**

- `GameTeam.penalty_score` is the live sum of non-rescinded `score_value` from **both** `GamePenalty` (grouped by the penalized players' team) and `GameTeamPenalty` for that team, maintained by the same `recalculateGameResult()` routine that recomputes `GameTeam.result`.
- A team penalty affects the team's effective score and can flip the game's win/loss/draw result, exactly like player penalties do.

---

## Player Performance Tables

### `Scorecard`

**Table name:** `sm5_scorecard`

One row per player per game. The primary record of a single player's participation and performance. Combines identity context with a full set of recorded and derived performance stats.

Non-player entities (targets, referees) are stored separately and do not appear here. Guest players with no iplId appear here with a null `player_id`.

All stat columns that are position-specific are stored as `null` for positions where they do not apply. A value of `0` always means the stat is applicable but the player recorded zero — it is never used as a substitute for null.

> **Every column is specified in [Scorecard_Table_Spec.md](Scorecard_Table_Spec.md)** — type, source (line type 7 vs derived), null rules, and derivation logic, grouped as Identity & Context, Shot, Missile, Nuke, Nuke Cancel, Special Ability, Support, Combat Outcomes, SP Tracking, Targets, Penalties, End State, Uptime & Downtime, and Derived Performance. That document is the single source of truth; this section covers only what is specific to the schema.

#### MVP columns

These two live on the scorecard but belong to the MVP model rather than the stat set, and so are specified here rather than in the scorecard spec.

| Column         | Type    | Null  | Source  | Description                                                                                                                                                                                                                                                                      |
| -------------- | ------- | ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mvp_points`   | double  | never | derived | Total MVP points under the model version active at ingest time. Sum of all `ScorecardMvp.points` for this scorecard under `mvp_model_id`. Denormalized for query performance — MVP is heavily used for sorting and aggregation. Updated if a newer model is applied post-ingest. |
| `mvp_model_id` | uuid FK | never | derived | References `MvpModel` — the version used to calculate `mvp_points`. Required to interpret the value correctly and to identify when a newer model is available for re-calculation.                                                                                                |

See [`MvpModel`](#mvpmodel) and [`ScorecardMvp`](#scorecardmvp) below, and the MVP formula in [chomper-design.md](chomper-design.md).

#### Competition columns

| Column         | Type    | Null  | Source  | Description                                                                                                                                                                                                                                                                                                               |
| -------------- | ------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_mercenary` | boolean | never | derived | Default `false`. True when this player played for a competition team they are not a rostered member of. Derived from `competition_team_player.is_mercenary` at link time, not from the TDF. Mercenary scorecards are excluded from aggregate competition stats. See [Competition_Structure.md](Competition_Structure.md). |

---

### `GamePlayerInteraction`

One row per ordered player pair per game, including pairs with zero interactions. Records all hits and missiles between two players in a single direction — player A acting on player B. The full picture of any two players' interaction is reconstructed from two rows: A→B and B→A.

Friendly and opponent interactions are both recorded — team relationship is derivable by comparing `scorecard_id` and `target_scorecard_id` via their respective `team_id` references on `Scorecard`.

| Column                | Type    | Null  | Description                                                                                                                                                                                                                                           |
| --------------------- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid    | never | Primary key.                                                                                                                                                                                                                                          |
| `game_id`             | uuid FK | never | References `Game`. Denormalized from Scorecard for query performance — kept consistent with Scorecard FKs at ingest.                                                                                                                                  |
| `scorecard_id`        | uuid FK | never | References `Scorecard` — the acting player (the one landing hits).                                                                                                                                                                                    |
| `target_scorecard_id` | uuid FK | never | References `Scorecard` — the receiving player.                                                                                                                                                                                                        |
| `shots_hit`           | integer | never | Total shots that hit the target player (`0205` and `0206` events). Includes both damaging and deactivating hits.                                                                                                                                      |
| `shot_deactivations`  | integer | never | Subset of `shots_hit` — times this player's shot deactivated the target (`0206` events only). For 1-HP positions (Scout, Ammo Carrier, Medic) this will always equal `shots_hit`. Only meaningfully distinct for Commander and Heavy Weapons targets. |
| `missile_hits`        | integer | never | Total missiles that hit the target player (`0306` events). Missiles always deactivate in one hit regardless of position.                                                                                                                              |
| `resets`              | integer | never | Subset of `shots_hit` — times this player's shot landed while the target was already in state 2 (vulnerable respawn window), restarting the target's respawn cycle.                                                                                   |
| `missile_resets`      | integer | never | Subset of `missile_hits` — times this player's missile landed while the target was already in state 2.                                                                                                                                                |

**Constraints:**

- `(game_id, scorecard_id, target_scorecard_id)` is a unique key — exactly one row per ordered pair per game.

**Ingest behavior:**

- At ingest time, rows are created for all ordered player pairs in the game, initialized to zero. Interaction counts are then incremented as the event stream is processed.
- A 12-player game produces 132 rows (12×11), a 10-player game 90 rows.

**Notes:**

- Zero-value rows are meaningful — they indicate two players who were in the same game but had no direct interactions. Storing them explicitly avoids gap-filling in the application when building the full interaction matrix for display.
- Team relationship (friendly vs opponent) is not stored on this table — derive by checking whether `scorecard_id` and `target_scorecard_id` share the same `team_id` via their Scorecard rows.

---

## MVP Scoring Tables

### `MvpModel`

One row per versioned MVP formula. The formula parameters are stored as a JSON document, allowing the component structure and multipliers to evolve over time without schema changes. Each version is immutable once created — changes to the formula always produce a new version row.

| Column        | Type      | Null     | Description                                                                                                                                                                            |
| ------------- | --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid      | never    | Primary key. Referenced by `Scorecard.mvp_model_id` and `ScorecardMvp.mvp_model_id`.                                                                                                   |
| `version`     | string    | never    | Human-readable version identifier in `year.month` format (e.g. `2021.12`). Unique. Used to identify which formula was active at ingest time and for display in historical comparisons. |
| `released_at` | timestamp | never    | When this version became active. Used to determine which model was current at the time of any given game's ingest.                                                                     |
| `retired_at`  | timestamp | nullable | When this version was superseded by a newer model. Null for the currently active version. Only one row should have `retired_at = null` at any time.                                    |
| `description` | string    | nullable | Human-readable notes on what changed in this version relative to the previous one. Free text.                                                                                          |
| `parameters`  | json      | never    | The complete formula definition for this version. Contains all component types, multipliers, thresholds, and position applicability. See JSON schema below.                            |

**Constraints:**

- `version` is a unique key.
- Only one row should have `retired_at = null` at any time — enforced at the application level.

**JSON schema for `parameters` (version 2021.12):**

```json
{
  "universal": {
    "accuracy_points_per_percent": 0.1,
    "medic_hit_opponent_points": 1,
    "medic_hit_team_points": -1,
    "elimination_bonus_minimum": 4,
    "elimination_bonus_seconds_threshold": 180,
    "elimination_bonus_points_per_second": 0.016667,
    "nuke_cancel_opponent_points": 3,
    "nuke_cancel_team_points": -3,
    "missiled_points": -1,
    "eliminated_points": -1
  },
  "commander": {
    "missile_opponent_points": 1,
    "nuke_detonated_points": 1,
    "nuke_canceled_points": -1,
    "score_bonus_threshold": 10000,
    "score_bonus_points_per_1000": 1
  },
  "heavy": {
    "missile_opponent_points": 2,
    "score_bonus_threshold": 7000,
    "score_bonus_points_per_1000": 1
  },
  "scout": {
    "shot_3hit_points": 0.2,
    "score_bonus_threshold": 6000,
    "score_bonus_points_per_1000": 1
  },
  "ammo_carrier": {
    "ammo_boost_points": 3,
    "score_bonus_threshold": 3000,
    "score_bonus_points_per_1000": 1
  },
  "medic": {
    "life_boost_points": 3,
    "survival_bonus_points": 2,
    "score_bonus_threshold": 2000,
    "score_bonus_points_per_1000": 2
  }
}
```

**Notes:**

- The JSON structure is versioned implicitly by the `version` field — the application selects the correct parser/executor for the formula based on `version`. If the JSON structure changes significantly in a future version, a new parser is added in application code alongside the new model row.
- Model rows are immutable once created. Never update `parameters` on an existing row — create a new version instead.
- `released_at` and `retired_at` together define the active window for each version, enabling correct model selection for historical games.

---

### `ScorecardMvp`

One row per component per scorecard per MVP model version. Stores the full breakdown of how a player's MVP score was calculated, enabling the per-component display shown in the MVP Details view.

Keyed on `(scorecard_id, mvp_model_id, component)` — multiple model versions can be stored simultaneously for the same scorecard, enabling historical comparison and re-calculation under newer or older formulas without losing prior results.

| Column         | Type    | Null  | Description                                                                                                                                                                                                                                                                                 |
| -------------- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid    | never | Primary key.                                                                                                                                                                                                                                                                                |
| `scorecard_id` | uuid FK | never | References `Scorecard`.                                                                                                                                                                                                                                                                     |
| `mvp_model_id` | uuid FK | never | References `MvpModel` — the formula version used to calculate this component value.                                                                                                                                                                                                         |
| `component`    | string  | never | The component identifier. See component table below.                                                                                                                                                                                                                                        |
| `input_value`  | double  | never | The raw stat value fed into the formula for this component before the multiplier is applied (e.g. accuracy as a decimal, count of medic hits). Stored for transparency and debugging — allows verification that the MVP calculation was applied correctly without re-reading the Scorecard. |
| `points`       | double  | never | The MVP points awarded for this component after applying the formula multiplier. Positive or negative. Zero for inapplicable or zero-value components.                                                                                                                                      |

**Constraints:**

- `(scorecard_id, mvp_model_id, component)` is a unique key.

**Component identifiers and calculation methods (version 2021.12):**

| Component                    | Applies To       | Input Value                                                                                                  | Points Calculation                                                                                                       |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `accuracy`                   | all              | `Scorecard.accuracy` converted to percentage, ceiling to nearest whole percent                               | `ceil(accuracy × 100) × accuracy_points_per_percent`                                                                     |
| `shots_hit_opponent_medic`   | all              | `Scorecard.shots_hit_opponent_medic`                                                                         | `value × medic_hit_opponent_points`                                                                                      |
| `shots_hit_team_medic`       | all              | `Scorecard.shots_hit_team_medic`                                                                             | `value × medic_hit_team_points`                                                                                          |
| `elimination_bonus`          | all              | seconds of game time remaining above 3-minute threshold at elimination, 0 if team did not win by elimination | `elimination_bonus_minimum + (seconds_above_threshold × elimination_bonus_points_per_second)` if elimination win, else 0 |
| `nukes_canceled`             | all              | `Scorecard.nukes_canceled`                                                                                   | `value × nuke_cancel_opponent_points`                                                                                    |
| `team_nukes_canceled`        | all              | `Scorecard.team_nukes_canceled`                                                                              | `value × nuke_cancel_team_points`                                                                                        |
| `times_hit_by_missile`       | all              | `Scorecard.times_hit_by_missile`                                                                             | `value × missiled_points`                                                                                                |
| `eliminated`                 | all except Medic | `Scorecard.eliminated` as 1 or 0                                                                             | `value × eliminated_points`                                                                                              |
| `missiles_hit_opponent`      | Commander, Heavy | `Scorecard.missiles_hit_opponent`                                                                            | `value × missile_opponent_points`                                                                                        |
| `nukes_detonated`            | Commander        | `Scorecard.nukes_detonated`                                                                                  | `value × nuke_detonated_points`                                                                                          |
| `nukes_canceled_by_opponent` | Commander        | `Scorecard.nukes_activated - Scorecard.nukes_detonated`                                                      | `value × nuke_canceled_points`                                                                                           |
| `shots_hit_opponent_3hit`    | Scout            | `Scorecard.shots_hit_opponent_3hit`                                                                          | `value × shot_3hit_points`                                                                                               |
| `ammo_boost`                 | Ammo Carrier     | `Scorecard.ammo_boost`                                                                                       | `value × ammo_boost_points`                                                                                              |
| `life_boost`                 | Medic            | `Scorecard.life_boost`                                                                                       | `value × life_boost_points`                                                                                              |
| `survival_bonus`             | Medic            | `Scorecard.eliminated` inverted — 1 if survived, 0 if eliminated                                             | `value × survival_bonus_points`                                                                                          |
| `score_bonus`                | all              | `max(0, Scorecard.score - threshold) / 1000`                                                                 | `value × score_bonus_points_per_1000`                                                                                    |

**Notes:**

- All components are stored for every scorecard regardless of position or whether the value is zero. The UI is responsible for filtering out zero-value rows for display.
- `input_value` stores the raw stat before the formula multiplier is applied, enabling verification of the calculation and re-display without re-reading the Scorecard.
- Position-inapplicable components (e.g. `nukes_detonated` for a Scout) will always have `input_value = 0` and `points = 0`.
- To compare a player's MVP scores across model versions, query `ScorecardMvp` filtered by `mvp_model_id` rather than using `Scorecard.mvp_points`.
- When a new model version is applied to existing scorecards, a new set of `ScorecardMvp` rows is inserted for the new `mvp_model_id` — prior version rows are retained. `Scorecard.mvp_points` and `Scorecard.mvp_model_id` are updated to reflect the newest calculation.

---

## Replay Data Tables

### `GameEvent`

One row per line type 4 event in the TDF. The complete event log for a game, stored in chronological order. Used for the scrollable event list on the game view and replay pages.

| Column                  | Type    | Null     | Description                                                                                                                                                                                                                                 |
| ----------------------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | uuid    | never    | Primary key. Referenced by `GamePlayerState.event_id`.                                                                                                                                                                                      |
| `game_id`               | uuid FK | never    | References `Game`.                                                                                                                                                                                                                          |
| `time`                  | integer | never    | Milliseconds elapsed since mission start, from the line type 4 `time` field.                                                                                                                                                                |
| `event_type`            | string  | never    | The 4-character event type code from the TDF (e.g. `0205`, `0404`, `0101`). Stored as-is — the UI maps these to human-readable labels.                                                                                                      |
| `actor_scorecard_id`    | uuid FK | nullable | References `Scorecard` — the player who performed the action. Null for events with no actor (e.g. `0100` Mission Start, `0101` Mission End).                                                                                                |
| `target_scorecard_id`   | uuid FK | nullable | References `Scorecard` — the player who received the action. Null for events with no player target — misses, ability activations, team events, and target interactions.                                                                     |
| `target_game_target_id` | uuid FK | nullable | References `GameTarget` — the non-player target involved in the event. Null for all non-target events. Mutually exclusive with `target_scorecard_id` — an event targets either a player or a non-player entity, never both.                 |
| `description`           | string  | never    | The middle portion of the plain text description from the TDF line type 4 entry (e.g. `" zaps "`, `" destroys "`, `" activates nuke"`). Combined with actor and target callsigns by the UI to produce the full human-readable event string. |

**Constraints:**

- `(game_id, time, event_type, actor_scorecard_id)` is a unique key — sufficient to identify a single event since the same actor cannot perform the same action twice at the exact same millisecond.

**Notes:**

- `target_scorecard_id` and `target_game_target_id` are mutually exclusive. At most one will be non-null for any given event.
- Team-level events (`0510`, `0512`, `0405`) have a null target — the affected players are determinable from the game context but are not stored explicitly on the event row. The resulting state changes are recorded individually in `GamePlayerState`.
- Mission lifecycle events (`0100`, `0101`) have null actor and null target.
- Events are stored in the order they appear in the TDF — `time` ascending with TDF file order as the tiebreaker for same-timestamp events.

---

### `GamePlayerState`

One row per player per event that causes a state change for that player. Records the full resulting state of a player after each affecting event. Used to reconstruct any player's exact state at any point during the game without client-side simulation.

A single event can produce multiple rows — a nuke detonation affecting 5 opposing players produces 6 rows (1 for the Commander's score change, 5 for the affected players' lives, state, and score changes).

| Column          | Type    | Null  | Description                                                                                                                                                                                                                                                                                                                                               |
| --------------- | ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid    | never | Primary key.                                                                                                                                                                                                                                                                                                                                              |
| `game_id`       | uuid FK | never | References `Game`. Denormalized for query performance — state lookups are always scoped to a game.                                                                                                                                                                                                                                                        |
| `event_id`      | uuid FK | never | References `GameEvent` — the event that caused this state change. Provides precise coupling between the event log and state log, ensuring the scoreboard and event display stay in sync.                                                                                                                                                                  |
| `scorecard_id`  | uuid FK | never | References `Scorecard` — the player whose state is recorded here.                                                                                                                                                                                                                                                                                         |
| `time`          | integer | never | Milliseconds elapsed since mission start. Denormalized from `GameEvent.time` for query performance — state lookups by timestamp are the primary read pattern.                                                                                                                                                                                             |
| `score`         | integer | never | Player's current score after this event.                                                                                                                                                                                                                                                                                                                  |
| `lives`         | integer | never | Lives remaining after this event.                                                                                                                                                                                                                                                                                                                         |
| `shots`         | integer | never | Shots remaining after this event.                                                                                                                                                                                                                                                                                                                         |
| `missiles`      | integer | never | Missiles remaining after this event.                                                                                                                                                                                                                                                                                                                      |
| `sp`            | integer | never | Special points after this event. Capped at 99. Stored as 0 for Heavy Weapons rather than null — the state table requires a consistent numeric type across all positions for scoreboard display.                                                                                                                                                           |
| `hit_points`    | integer | never | Current hit points after this event. Always 1 for Scout, Ammo Carrier, and Medic. Meaningful for Commander and Heavy Weapons (max 3) — tracks partial damage carried across state 2 windows. Resets to position maximum on every transition to state 3 regardless of cause.                                                                               |
| `state`         | integer | never | Current player state after this event. 0 = active, 2 = vulnerable, 3 = invulnerable. Matches the state values from line type 9.                                                                                                                                                                                                                           |
| `is_rapid_fire` | boolean | never | True if this Scout currently has rapid fire active. Always false for all other positions. Set to true on `0400`, false on the next `0500` targeting this Scout.                                                                                                                                                                                           |
| `is_nuking`     | boolean | never | True if this Commander is currently in an active nuke countdown. Always false for all other positions. Set to true on `0404`, false on `0405` or any transition to state 3 — there is no explicit cancellation event in the TDF so the state 3 transition itself is the cancellation signal.                                                              |
| `accuracy`      | double  | never | Live shot accuracy at this point in the game — `shots_hit / shots_fired` tracked cumulatively through the event stream. Stored as 0 until the player has fired at least one shot. Exists solely for replay scoreboard display — `Scorecard.accuracy` is the authoritative end-of-game value.                                                              |
| `hit_diff`      | double  | never | Live hit differential at this point in the game — `shots_hit_opponent / max(times_hit, 1)` tracked cumulatively through the event stream. Stored as 0 until the player has hit at least one opponent. Matches the definition of `Scorecard.hit_diff` but reflects in-game state rather than the final value. Exists solely for replay scoreboard display. |

**Constraints:**

- `(event_id, scorecard_id)` is a unique key — one state record per player per event.

**Ingest behavior:**

- The full game state for all players is initialized from position starting stats at the `0100` Mission Start event. Each subsequent event is processed in order, updating the state of affected players and inserting a new row for each change.
- The initial state row for each player is inserted at the `0100` event with starting values: score 0, position max lives, position starting shots, position starting missiles, 0 SP, position max hit points, state 0, is_rapid_fire false, is_nuking false, accuracy 0, hit_diff 0.
- Players who are eliminated mid-game receive no further state rows after their line type 6 exit entry.

**Notes:**

- To reconstruct a player's state at any point T during the game, query the most recent `GamePlayerState` row for that `scorecard_id` where `time <= T`. This is the primary read pattern — a composite index on `(game_id, scorecard_id, time)` is strongly recommended.
- `time` is denormalized from `GameEvent` to avoid a join on every state lookup. It must be kept consistent with `GameEvent.time` at ingest.
- `hit_points` carries over from state 2 into state 0 if the player was damaged but not fully deactivated during the vulnerable window. It resets to the position maximum on every transition to state 3.
- `accuracy` and `hit_diff` are live in-game running values and will differ from `Scorecard.accuracy` and `Scorecard.hit_diff` until the final event — the Scorecard values are authoritative for end-of-game stats. These columns exist solely for replay scoreboard display.

---

## Video & API Access Tables

### `GameVideo`

One row per YouTube link attached to a game. A row is either a **game-level video** (scoreboard or arena cam footage of the whole game) or a **player POV video** (footage from one player's perspective), distinguished solely by whether `player_id` is set.

Videos are added two ways: by an admin or center admin through the Videos tab on the game page, or by an external tool through `POST /api/videos` (see `API.md`).

| Column                  | Type      | Null      | Description                                                                                                                                                     |
| ----------------------- | --------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | uuid      | never     | Primary key.                                                                                                                                                    |
| `game_id`               | uuid FK   | never     | References `Game`. Cascades on delete — removing a game removes its videos.                                                                                     |
| `player_id`             | uuid FK   | sometimes | References `Player`. **Null means a game-level video**; set means this is that player's POV footage. Cascades on delete.                                        |
| `youtube_video_id`      | string    | never     | The 11-character YouTube video id, parsed from the submitted URL at write time. Used to build watch and thumbnail URLs, and to dedupe.                          |
| `youtube_url`           | string    | never     | The URL exactly as submitted. Retained for display and debugging — the canonical identity is `youtube_video_id`, since the same video has many valid URL forms. |
| `start_seconds`         | integer   | sometimes | Offset into the video where playback begins, normalized to whole seconds. Null means the link starts at the beginning.                                          |
| `game_start_offset`     | integer   | sometimes | Offset into the video where the game clock hits 0:00, measured from the video's start (**not** from `start_seconds`). Null means unknown. See below.            |
| `label`                 | string    | sometimes | Free-text caption, e.g. `Arena Cam 2` or `Red Commander POV`. Null renders as "Untitled video".                                                                 |
| `source`                | enum      | never     | `admin` (added through the game page UI) or `api` (posted by an external tool). Surfaced in the UI as an "Auto" badge for `api` rows.                           |
| `created_by_user_id`    | text FK   | sometimes | References `AuthUser`. Set when `source = 'admin'`, null otherwise.                                                                                             |
| `created_by_api_key_id` | uuid FK   | sometimes | References `ApiKey`. Set when `source = 'api'`, null otherwise. Gives an audit trail of which tool posted a video.                                              |
| `created_at`            | timestamp | never     | Insert time.                                                                                                                                                    |

**Constraints:**

- `(game_id, player_id, youtube_video_id)` is unique **with `NULLS NOT DISTINCT`**. The clause is required, not incidental: Postgres treats NULLs as distinct in unique indexes by default, so without it game-level videos (`player_id IS NULL`) would not dedupe at all and only POV rows would be protected. This constraint is what makes `POST /api/videos` idempotent under retries.
- `start_seconds` and `game_start_offset` are deliberately **excluded** from that constraint. Centers commonly publish one multi-hour recording covering a whole night, so a re-post with a corrected offset must update the existing row rather than insert a near-duplicate. Including an offset in the key would make every resync add another copy of the same link.
- Indexes on `game_id` and `player_id` back the game-page and player-profile reads respectively.

**Notes:**

- Exactly one of `created_by_user_id` / `created_by_api_key_id` is set in practice, matching `source`. This is a convention, not a database constraint.
- `start_seconds` is parsed from the submitted URL's `t`/`start` parameter (`parseYoutubeLink` in `apps/web/src/lib/youtube.ts`), or set explicitly via the API's `start_seconds` field, which takes precedence. Every link the site renders is rebuilt from `youtube_video_id` + `start_seconds`, so the stored offset — not `youtube_url` — is what determines where a viewer lands.
- **The two offsets answer different questions and are both absolute.** `start_seconds` is where the viewer is dropped in; `game_start_offset` is where the game itself begins. They differ when a link deliberately opens on preroll worth watching — a team huddle, an intro, the countdown — so the gap between them is that preroll's length. Measuring `game_start_offset` from the video's start rather than from `start_seconds` means re-cutting how much preroll a link opens on never invalidates it.
- `game_start_offset >= start_seconds` whenever both are set, enforced in `resolveVideoOffsets` (`apps/web/src/lib/youtube.ts`) for the admin UI and inline in the API route. `0` is a meaningful value — a recording that opens on the starting horn — and is preserved rather than coerced to null the way a `start_seconds` of 0 is.
- `game_start_offset` is the anchor a replay engine syncs against: `videoPosition = game_start_offset + gameClockSeconds`. Nothing consumes it that way yet; today it only drives a "Game @ h:mm:ss" link on the game page's Videos tab.
- A conflicting write updates `youtube_url`, `start_seconds`, `game_start_offset` and `label` only when the caller opts in (`overwrite` on the API, always on for the admin UI, where re-adding a listed video means correcting it). `created_at` and the original creator are preserved.
- A POV video may only be attached to a player with a scorecard in that game — enforced in the API path by `getScorecardPlayerIdByIplId`, not by the schema. Guest players have no `Player` row and therefore cannot be the subject of a POV video.
- The Laserball game page renders a whole match (both halves plus overtime) on one page, so it reads videos across every game in the match, while a newly added video attaches to the half currently being viewed.

---

### `ApiKey`

Service credentials that let external tools write through the public API. Currently used only by `POST /api/videos`.

Keys are **global** — a valid key may post for any center. There is no per-center scoping; if that becomes necessary, add a nullable `center_id` mirroring the `UserRole` convention where null means "all centers".

| Column               | Type      | Null      | Description                                                                                                                                                 |
| -------------------- | --------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | uuid      | never     | Primary key.                                                                                                                                                |
| `name`               | string    | never     | Human label identifying the tool the key was issued to, e.g. `OBS Capture Tool`.                                                                            |
| `key_hash`           | string    | never     | SHA-256 hex digest of the secret. Unique. **The plaintext key is never stored** — it is shown once at creation and is not recoverable.                      |
| `key_prefix`         | string    | never     | First 8 characters of the plaintext (e.g. `lfs_ab12`), so a key is identifiable in the admin list without revealing it.                                     |
| `created_by_user_id` | text FK   | never     | References `AuthUser` — the superAdmin who issued the key.                                                                                                  |
| `created_at`         | timestamp | never     | Issue time.                                                                                                                                                 |
| `revoked_at`         | timestamp | sometimes | Set when revoked. A revoked key is rejected immediately; rows are retained rather than deleted so `GameVideo.created_by_api_key_id` references stay intact. |
| `last_used_at`       | timestamp | sometimes | Updated on every successful authentication. Null means the key has never been used — useful for confirming a key is unused before revoking it.              |

**Notes:**

- All key crypto lives in `packages/db/src/queries/apiKeys.ts`. Callers pass plaintext in and never handle a hash; `authenticateApiKey` hashes, checks `revoked_at`, and touches `last_used_at` in one call.
- Key management lives at `/admin/api-keys` and is restricted to `superAdmin`. This is stricter than the rest of `/admin`, which also admits `admin` and `centerAdmin` at both the `src/proxy.ts` and `app/admin/layout.tsx` layers — so the restriction is enforced by a dedicated `app/admin/api-keys/layout.tsx` plus a `requireSuperAdmin()` call in every Server Action (`apps/web/src/lib/auth-guards.ts`). The action-level checks are the real boundary; Server Actions are invocable independently of the page that renders them.
