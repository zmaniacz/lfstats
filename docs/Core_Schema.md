# SM5 Core Database Schema

**Game Type:** Space Marines 5 (SM5)  
**Scope:** Tables required to record the complete end state of a single game  
**Last Updated:** 2026

---

## Overview

This document specifies the core table set required to record a single SM5 game from a TDF file. It covers identity and reference tables (`Center`, `Player`, `PlayerCallsignHistory`, `Battlesuit`, `Target`), game structure tables (`Game`, `GameTeam`), non-player entity tables (`GameTarget`, `GameTargetDestruction`, `GameReferee`), player performance tables (`Scorecard`, `GamePlayerInteraction`), penalty tracking (`GamePenalty`), MVP scoring tables (`MvpModel`, `ScorecardMvp`), and replay data tables (`GameEvent`, `GamePlayerState`).

Replay data is out of scope for this document and is specified separately.

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `country_code` | integer | never | Numeric country code from the TDF composite identifier. |
| `site_code` | integer | never | Numeric site code from the TDF composite identifier. Unique within a country, not globally. |
| `name` | string | never | Human-readable name of the center (e.g. "Laserforce Auckland"). Manually entered. |
| `short_name` | string | never | Abbreviation used to refer to the center in compact display contexts (e.g. "LLT", "SYR"). Manually entered. |
| `city` | string | nullable | City the center is located in. Manually entered. Optional — useful for display but not required for any system function. |
| `country_name` | string | nullable | Human-readable country name. Manually entered. Separate from `country_code` which is an opaque integer in the TDF. |
| `timezone` | string | nullable | IANA tz database string for the center's local timezone (e.g. `Pacific/Auckland`, `America/Los_Angeles`). Not used in any timestamp computation — all timestamps are stored as local time. Stored for display purposes only, so the UI can render timezone labels. Manually entered. |

**Constraints:**
- `(country_code, site_code)` is a unique key — the composite is the natural identifier used to match TDF records to Center rows at ingest time.

**Notes:**
- All game timestamps ingested from this center's TDF files are stored as local time with no UTC conversion. The `timezone` column is purely informational.
- There is no active/inactive flag. Centers are present in the database if they have games; removal is handled manually if ever needed.

---

### `Player`

One row per registered Laserforce member, keyed by their globally unique iplId. Created on first encounter during TDF ingestion. Guest players (hardware `@NNN` ids with no iplId) do not get a `Player` row — they appear in `Scorecard` with a null `player_id`.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `ipl_id` | string | never | Globally unique Laserforce member identifier (`#xxxxxxx`). Natural key — used for cross-site identity and as the lookup key at ingest time. Also used to construct the iPlayLaserforce profile URL: `https://www.iplaylaserforce.com/mission-stats/?t={ipl_id_without_hash}`. |
| `member_id` | string | nullable | Center-scoped member identifier (`{country-code}-{site-code}-{member-code}`), sourced from the `memberId` field on line type 3. A stable human-readable alias for the iplId — the same player will always have the same `member_id` at a given center. Set once on first encounter from a 2.006 or later file; never updated after that. Null if the player has only been seen in older file versions where this field is absent. |
| `current_callsign` | string | never | The player's most recently seen display name. Updated on every ingest where this player appears, regardless of whether the callsign changed. |
| `first_seen_at` | timestamp | never | Timestamp of the first game this player appeared in. Set once on row creation, never updated. Stored in the local time of the center where they were first seen. |

**Constraints:**
- `ipl_id` is a unique key.

**Ingest behavior:**
- On first encounter, create a new row. Set `member_id` if present in the file, otherwise leave null.
- If `member_id` is null on an existing row and the player appears in a 2.006 file with a `memberId` field, populate it then. Never overwrite an existing `member_id` value.
- Update `current_callsign` on every ingest regardless of whether it changed.

---

### `PlayerCallsignHistory`

Tracks callsigns used over time for display on player profile pages. One row per distinct callsign per player, recording when it was first and last observed. The current callsign is always also reflected on `Player.current_callsign` — this table exists for historical display, not as the authoritative per-game record (that is `Scorecard.callsign`).

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `player_id` | uuid FK | never | References `Player`. |
| `callsign` | string | never | The callsign as it appeared in TDF files during this period. |
| `first_seen_at` | timestamp | never | Timestamp of the first game where this callsign was observed for this player. |
| `last_seen_at` | timestamp | never | Timestamp of the most recent game where this callsign was observed. Updated on ingest if the player is still using this callsign. |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. Referenced by `Scorecard.battlesuit_id` and `GameReferee.battlesuit_id`. |
| `center_id` | uuid FK | never | References `Center`. |
| `name` | string | never | Display name of the battlesuit as configured at the center (e.g. "Viper", "Ghost"). Updated on ingest if changed — no name history is kept. |
| `hardware_id` | string | nullable | The `@NNN` hardware identifier for this suit. Opportunistically populated — present when an unregistered guest uses the suit or it appears as a referee suit, null otherwise. Updated on ingest if encountered. |

**Constraints:**
- `(center_id, name)` is a unique key.

**Ingest behavior:**
- Look up by `(center_id, name)`. If not found, create a new row. Return the UUID either way.
- If `hardware_id` is null on an existing row and a `@NNN` id is encountered for this suit, update it.
- If `name` changes for a known `hardware_id`, update `name` — this is a deliberate overwrite, not a new row. No name history is kept.

---

### `Target`

One row per physical target unit at a center. Keyed by `(center_id, hardware_id)` — targets always have a reliable `@NNN` id since they are never registered as players.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. Referenced by `GameTarget`. |
| `center_id` | uuid FK | never | References `Center`. |
| `hardware_id` | string | never | The `@NNN` hardware identifier for this target unit. Unique within a center. Natural ingest key combined with `center_id`. |
| `name` | string | never | Display name of the target as configured at the center (e.g. "Alpha", "Neutral"). Updated on ingest if changed — no name history is kept. |

**Constraints:**
- `(center_id, hardware_id)` is a unique key.

---

## Game Structure Tables

### `Game`

One row per TDF file ingested. The natural key is `(center_id, start_time)` — a physical location can only run one game at a given moment.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `center_id` | uuid FK | never | References `Center`. Resolved at ingest from the `centre` composite key on line type 0. |
| `start_time` | timestamp | never | When the game was initialized, from the `start` field on line type 1. Stored in the center's local time. Combined with `center_id` forms the natural unique key. |
| `tdf_filename` | string | never | The original TDF filename as stored on S3 (e.g. `3-3_20260519201615_-_Space_Marines_5.tdf`). Used for debugging, re-ingestion, and linking to the raw file from the game view. |
| `outcome` | enum | never | How the game ended. `score` — time expired and the winner was determined by team score. `elimination` — one team was fully eliminated before time expired (or within the 60-second run-to-time window). `draw` — time expired with both teams at exactly equal scores. |
| `scheduled_duration` | integer | never | Configured game length in milliseconds from line type 1 `duration` field. Defaults to `900000` (15 minutes) for pre-2.001 files where the field is absent. Represents intended game length, not actual. |
| `actual_duration` | integer | never | Actual elapsed game time in milliseconds, calculated as the timestamp of the `0101` Mission End event minus the `0100` Mission Start event timestamp. Will be less than `scheduled_duration` for elimination games that ended early. |

**Constraints:**
- `(center_id, start_time)` is a unique key.

**Notes:**
- Only SM5 games are ingested — files where line type 1 `type` is not `5` are skipped entirely.
- `actual_duration` will equal `scheduled_duration` for score and draw outcomes. It will be shorter for elimination outcomes, except in the edge case where elimination occurred with 60 seconds or fewer remaining and the game ran to time — in that case `outcome` is still `elimination` but `actual_duration` will equal `scheduled_duration`.
- The `penalty` value from line type 1 is not stored on `Game` — it is applied per-event during ingest and its effect is captured in `GamePenalty.score_value`. For pre-2.003 files where the field is absent, default to `0`.

---

### `GameTeam`

One row per team per game, including the Neutral team. The Neutral team is included to provide a consistent FK target for `GameTarget` — all target-team associations resolve cleanly through this table.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. |
| `tdf_team_index` | integer | never | The zero-based team index from line type 2. Scoped to this game only — used during ingest to associate player Scorecards and `GameTarget` rows with their correct `GameTeam` row. |
| `is_neutral` | boolean | never | True if this is the Neutral team — the non-competing grouping for targets and referees. Always false for competing teams. Use this flag rather than filtering on `name` to ensure correct behavior regardless of language or center configuration. |
| `name` | string | never | Team name as configured at the center (e.g. "Red Team", "Green Team", "Neutral"), from line type 2 `desc`. Stored as a point-in-time fact. |
| `colour_enum` | integer | never | Canonical color identifier from line type 2. Maps to a fixed lookup (0=None through 15=Rainbow). Authoritative color reference. |
| `colour_rgb` | string | nullable | Hex RGB color value for rendering (e.g. `#FF0000`), from line type 2 `colour-rgb`. Null for pre-2.004 files — derive from `colour_enum` lookup for display in that case. |
| `score` | integer | nullable | Sum of all player scores on this team at game end. Null for the Neutral team which has no players and no score. Derivable from Scorecard but denormalized here for query performance. |
| `elimination_bonus` | integer | nullable | Competition elimination bonus. `10000` if this team won by elimination, `0` otherwise. Null for the Neutral team. |
| `result` | enum | nullable | This team's game result — `win`, `loss`, or `draw`. Null for the Neutral team. An eliminated team is always `loss` even if their `score` exceeds the winning team's. |
| `eliminated` | boolean | nullable | True if all players on this team ran out of lives before game end. Null for the Neutral team. |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. |
| `target_id` | uuid FK | never | References `Target`. |
| `game_team_id` | uuid FK | never | References `GameTeam` — the team this target is associated with, including the Neutral `GameTeam` row for neutral targets. |
| `type` | string | never | The entity type string from line type 3 (`standard-target`, `beacon`, or `generator-target`). Stored as-is — all three are treated identically for game purposes but the hardware type is worth preserving. |

**Constraints:**
- `(game_id, target_id)` is a unique key.

**Notes:**
- Players cannot destroy their own team's associated target. This is a game rule enforced by the hardware — it does not need to be encoded in the schema but is relevant context for any query filtering target destructions by team alignment.
- A `game_team_id` referencing a `GameTeam` row where `is_neutral = true` indicates a neutral target.

---

### `GameTargetDestruction`

One row per target destruction event per game. A single target can be destroyed multiple times in a game — each player maintains their own independent 3-hit sequence against each target, so multiple players can destroy the same target. Row count per player should be consistent with `Scorecard.targets_destroyed` — useful as an ingest consistency check.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_target_id` | uuid FK | never | References `GameTarget`. |
| `scorecard_id` | uuid FK | never | References `Scorecard` — the player who destroyed this target. |
| `method` | enum | never | How the target was destroyed. `shot` for a standard 3-hit sequence (`0204`), `missile` for a single missile hit (`0303`), `awarded` for a post-elimination base award (`0B03`). |
| `time` | integer | never | Milliseconds elapsed since mission start at which the destruction occurred, from the event timestamp. |

**Notes:**
- `awarded` method rows (`0B03` events) only occur on early team elimination. The awarded player may not have hit the target at all during the game — their `GamePlayerInteraction` rows will show zero hits against that target. `awarded` destructions should be excluded from any accuracy or efficiency stats derived from this table.

---

### `GameReferee`

One row per referee registered in a game. A referee may log in with their iplId — in that case they link back to a `Player` record.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. |
| `player_id` | uuid FK | nullable | References `Player` if the referee logged in with an iplId. Null for referees using only a hardware id. |
| `ipl_id` | string | nullable | Denormalized iplId for query convenience, consistent with the pattern on `Scorecard`. Null if no iplId present. |
| `callsign` | string | never | Display name of the referee entity as it appeared in the TDF, from line type 3 `desc`. |
| `battlesuit_id` | uuid FK | nullable | References `Battlesuit` if a battlesuit name was present on the line type 3 entry. Null for pre-2.003 files or if absent. |
| `hardware_id` | string | nullable | The `@NNN` hardware id from line type 3 if the referee used a hardware login rather than an iplId. |

**Notes:**
- A referee row will have either `player_id` + `ipl_id` populated (iplId login) or `hardware_id` populated (hardware login), but not both.
- Penalty counts assessed by referees during the game are captured in `Scorecard.penalties` on the penalized player and in `GamePenalty` — `GameReferee` does not track which referee issued which penalty directly. Join to `GamePenalty.referee_id` for that.
- Ingest note: duplicate referee entries for the same game should be deduplicated on the natural id field (`ipl_id` or `hardware_id`) during ingest.

---

## Penalty Table

### `GamePenalty`

One row per penalty assessed during or after a game. Populated at ingest from `0600` events and editable after the fact. The authoritative source for penalty score impact — `Scorecard.penalties` tracks only the count of in-game penalties and should not be used for score calculations.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. |
| `referee_id` | uuid FK | nullable | References `GameReferee`. Null for penalties added manually after the fact with no associated referee entity in the TDF. |
| `scorecard_id` | uuid FK | never | References `Scorecard` — the player who received the penalty. |
| `score_value` | integer | never | Score change applied to the penalized player. Negative integer (e.g. `-500`). Initialized at ingest from the `penalty` field on line type 1. Editable after the fact. |
| `description` | string | never | Human-readable description of the infraction. Defaults to `"Common Foul"` at ingest time. Free text — editable after the fact. |
| `time` | integer | nullable | Milliseconds elapsed since mission start when the penalty occurred, from the `0600` event timestamp. Null for penalties added manually after the game with no corresponding in-game event. |

**Notes:**
- At ingest, one row is created per `0600` event. `score_value` is initialized from line type 1 `penalty` (defaulting to `0` for pre-2.003 files), `description` defaults to `"Common Foul"`, and `time` is set from the event timestamp.
- Post-game manually added penalties will have `time = null` and `referee_id = null` unless explicitly provided.
- `Scorecard.penalties` reflects only the count of `0600` events recorded at ingest and is never updated after the fact. Use `sum(GamePenalty.score_value)` for any score impact calculation.

---

## Player Performance Tables

### `Scorecard`

One row per player per game. The primary record of a single player's participation and performance. Combines identity context with a full set of recorded and derived performance stats.

Non-player entities (targets, referees) are stored separately and do not appear here. Guest players with no iplId appear here with a null `player_id`.

All stat columns that are position-specific are stored as `null` for positions where they do not apply. A value of `0` always means the stat is applicable but the player recorded zero — it is never used as a substitute for null.

#### Identity & Context

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `id` | uuid | never | generated | Primary key. |
| `game_id` | uuid FK | never | line type 1 | The game this scorecard belongs to. |
| `player_id` | uuid FK | nullable | line type 3 | The persistent player record. Null for unregistered guests with no iplId. |
| `team_id` | uuid FK | never | line type 2/3 | The team this player was on during this game. References `GameTeam`. |
| `battlesuit_id` | uuid FK | nullable | line type 3 | The physical battlesuit assigned to this player. Null if absent in older file versions. |
| `ipl_id` | string | nullable | line type 3 | Denormalized from Player for query convenience. The globally unique Laserforce member identifier (`#xxxxxxx`). Null for unregistered guests. |
| `callsign` | string | never | line type 3 | The player's display name at the time of this game. Stored as a point-in-time fact. |
| `position` | integer | never | line type 3 | The role the player selected for this game. Maps to: 1=Commander, 2=Heavy Weapons, 3=Scout, 4=Ammo Carrier, 5=Medic. |
| `eliminated` | boolean | never | line type 6 | True if the player ran out of lives before the game ended (exit code `04`). False if they survived to mission end (exit code `02`). |
| `end_time` | timestamp | never | line type 4/6 | The moment this player's game ended. For survivors this is the `0101` Mission End event timestamp. For eliminated players this is the timestamp of their line type 6 entry. |

#### Shot Stats

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `shots_fired` | integer | never | line type 7 | Total shots fired including misses. |
| `shots_hit` | integer | never | line type 7 | Total shots that hit any target, player or non-player. |
| `shots_hit_opponent` | integer | never | line type 7 | Shots that hit an opposing team player (`0205` and `0206` where target is an opponent). |
| `shots_hit_team` | integer | never | line type 7 | Shots that hit a friendly team player (`0205` and `0206` where target is a teammate). |
| `shots_hit_opponent_3hit` | integer | never | line type 7 | Shots that hit an opposing Commander or Heavy Weapons player — the two 3-hit-point positions. |
| `shots_hit_opponent_medic` | integer | never | derived | Shots that hit the opposing team's Medic. Since the Medic has 1 hit point, every hit is also a deactivation. |
| `shots_hit_team_medic` | integer | never | derived | Shots that hit the friendly team's Medic. Shame stat. |
| `times_hit` | integer | never | line type 7 | Number of times this player was hit by any shot. |

#### Missile Stats

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `missile_hits` | integer | never | line type 7 | Total missiles fired by this player that hit any target, player or non-player. |
| `missiles_hit_opponent` | integer | never | line type 7 | Missiles that hit an opposing team player. |
| `missiles_hit_team` | integer | never | line type 7 | Missiles that hit a friendly team player. Shame stat. |
| `missiles_hit_opponent_medic` | integer | never | derived | Missiles that hit the opposing team's Medic. High value — a missile always deactivates in one hit. |
| `missiles_hit_team_medic` | integer | never | derived | Missiles that hit the friendly team's Medic. Shame stat. |
| `times_hit_by_missile` | integer | never | line type 7 | Number of times this player was hit by a missile. |

#### Nuke Stats — Commander only, null for all other positions

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `nukes_activated` | integer | Commander only | line type 7 | Number of nuke activation sequences begun (`0404` events), including those subsequently cancelled. |
| `nukes_detonated` | integer | Commander only | line type 7 | Number of nukes that successfully detonated (`0405` events). Always ≤ `nukes_activated`. |
| `nukes_hit_medic` | integer | Commander only | line type 7 | Number of opposing Medic lives lost due to this Commander's nuke detonations. |
| `lives_removed_by_nuke` | integer | Commander only | derived | Total lives actually removed from opposing players across all nuke detonations. Calculated as `sum(min(3, target_lives_remaining))` per affected player per detonation. |
| `total_nuke_activation_time` | integer | Commander only | derived | Total milliseconds between nuke activation and detonation across all successful nukes. Cancelled nukes excluded. |
| `average_nuke_activation_time` | integer | Commander only | derived | `total_nuke_activation_time / nukes_detonated`. Null if `nukes_detonated = 0`. |

#### Nuke Cancel Stats — all positions

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `nukes_canceled` | integer | never | line type 7 | Number of opposing team nukes cancelled by this player — times this player deactivated an enemy Commander during their nuke activation sequence. |
| `team_nukes_canceled` | integer | never | line type 7 | Number of friendly nukes accidentally cancelled by this player. Shame stat. |

#### Special Ability Stats — position-specific, null where not applicable

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `rapid_fire` | integer | Scout only | line type 7 | Number of times this Scout activated rapid fire (`0400` events). |
| `total_rapid_time` | integer | Scout only | derived | Total milliseconds spent in rapid fire across all activations. Each window runs from `0400` to the next `0500` ammo resupply targeting this Scout. |
| `average_rapid_time` | integer | Scout only | derived | `total_rapid_time / rapid_fire`. Null if `rapid_fire = 0`. |
| `shots_fired_during_rapid` | integer | Scout only | derived | Total shots fired while rapid fire was active. |
| `shots_hit_during_rapid` | integer | Scout only | derived | Total shots that hit any target while rapid fire was active. |
| `shots_hit_opponent_during_rapid` | integer | Scout only | derived | Shots that hit an opposing player while rapid fire was active. |
| `shots_hit_team_during_rapid` | integer | Scout only | derived | Shots that hit a friendly player while rapid fire was active. |
| `accuracy_during_rapid` | double | Scout only | derived | `shots_hit_during_rapid / shots_fired_during_rapid`. 0 if `shots_fired_during_rapid = 0`. |
| `ammo_boost` | integer | Ammo Carrier only | line type 7 | Number of times this Ammo Carrier used the team ammo resupply special ability (`0510` events). |
| `life_boost` | integer | Medic only | line type 7 | Number of times this Medic used the team lives resupply special ability (`0512` events). |

#### Support Stats — Ammo Carrier and Medic only, null for all other positions

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `resupplies_given` | integer | Ammo/Medic only | derived | Number of individual resupply tags given — `0500` events for Ammo Carrier, `0502` events for Medic. |
| `double_resupplies_given` | integer | Ammo/Medic only | derived | Number of successful double resupplies — simultaneous `0500` and `0502` events at the same timestamp against the same target. Tracked independently on both the Ammo Carrier and Medic row. |
| `resupplies_received_ammo` | integer | never | derived | Number of times this player received a shot resupply (`0500` events where this player is the target). Always 0 for Ammo Carriers. |
| `resupplies_received_lives` | integer | never | derived | Number of times this player received a lives resupply (`0502` events where this player is the target). Always 0 for Medics. |

#### Combat Outcomes

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `deactivated_opponent` | integer | never | derived | Number of opposing players deactivated by this player via `0206` or `0306`. |
| `deactivated_team` | integer | never | derived | Number of friendly players deactivated by this player via `0206` or `0306`. Shame stat. |
| `eliminated_opponent` | integer | never | derived | Number of opposing players personally eliminated by this player — `0206` or `0306` events that caused the target's lives to reach 0. Includes eliminations via nuke (`0405`). |
| `eliminated_team` | integer | never | derived | Number of friendly players personally eliminated by this player. Friendly nukes cannot eliminate teammates so nuke events are excluded. Shame stat. |
| `eliminated_opponent_medic` | integer | never | derived | Number of times this player personally eliminated the opposing Medic. Subset of `eliminated_opponent`. |
| `eliminated_team_medic` | integer | never | derived | Number of times this player personally eliminated their own Medic. Subset of `eliminated_team`. |
| `assists` | integer | never | derived | Assists credited to this player — landing a damaging hit (`0205`) on a Commander or Heavy Weapons opponent that is followed by a deactivating hit from any other player within 8000ms, provided the target did not transition to state 3 between this player's hit and the deactivation. The deactivating player does not also receive an assist. |
| `reset_opponent` | integer | never | derived | Number of times this player reset an opposing player — landing a `0205` or `0206` hit on an opponent currently in state 2, restarting their full 8000ms respawn cycle. |
| `reset_team` | integer | never | derived | Number of times this player accidentally reset a teammate in state 2. Shame stat. |
| `missile_reset_opponent` | integer | never | derived | Number of times this player reset an opposing player via missile (`0306`) while the target was in state 2. |
| `missile_reset_team` | integer | never | derived | Number of times this player reset a teammate via missile while in state 2. Shame stat. |

#### SP Tracking — null for Heavy Weapons only

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `sp_earned` | integer | Heavy only | derived | Total SP earned during the game, capped at 99 at any point. Earned at: +1 per opponent tag (`0205`/`0206`), +2 per Commander missile hit on an opponent (`0306`), +5 per target destroyed (`0204`/`0303`). Must be tracked cumulatively through the event stream — cannot be derived from end-state stats alone due to the 99 cap. |
| `sp_spent` | integer | Heavy only | derived | Total SP spent on special abilities. Commander: `nukes_activated × 20`. Scout: `rapid_fire × 10`. Ammo Carrier: `ammo_boost × 15`. Medic: `life_boost × 10`. |

#### Targets

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `targets_destroyed` | integer | never | derived | Number of non-player targets destroyed by this player. Counts both `0204` and `0303` destructions. Consistent with row count in `GameTargetDestruction` where `scorecard_id` matches and `method` is `shot` or `missile` — use as an ingest consistency check. |

#### Penalties

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `penalties` | integer | never | line type 7 | Number of referee penalties assessed against this player during the game (`0600` events where this player is the target). Fixed at ingest — never updated after the fact. Use `sum(GamePenalty.score_value)` for score impact calculations. |

#### End State

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `lives_left` | integer | never | line type 7 | Lives remaining at game end. Always 0 for eliminated players. |
| `shots_left` | integer | never | line type 7 | Shots remaining at game end. |

#### Uptime & Downtime

All values in milliseconds. The three columns always sum to total time between the `0100` Mission Start event and this player's `end_time` — useful as a consistency check at ingest. Derived from line type 9 player state transitions, or synthetic reconstruction for pre-2.005 files using 4000ms + 4000ms timers from each deactivating event.

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `uptime` | integer | never | derived | Total milliseconds spent in state 0 (active). |
| `resupply_downtime` | integer | never | derived | Total milliseconds spent in state 2 or 3 following a resupply event (`0500` or `0502`). Determined by checking whether a resupply event at the same timestamp targeting this player preceded the state 3 transition. |
| `other_downtime` | integer | never | derived | Total milliseconds spent in state 2 or 3 for any reason other than resupply — enemy fire, nuke, penalty, or friendly fire. |

#### Derived Performance

| Column | Type | Null | Source | Description |
|--------|------|------|--------|-------------|
| `score` | integer | never | line type 6 | Final score at game end. Matches the `new` value of this player's last line type 5 score entry. Authoritative value is from line type 6. |
| `accuracy` | double | never | derived | `shots_hit / shots_fired`. Stored as 0 if `shots_fired = 0`. |
| `hit_diff` | double | never | derived | `shots_hit_opponent / max(times_hit, 1)`. Values above 1.0 indicate this player is landing more hits on opponents than they are receiving. `max(times_hit, 1)` used as divisor so players who were never hit produce a meaningful ratio. |
| `mvp_points` | double | never | derived | Total MVP points under the model version active at ingest time. Sum of all `ScorecardMvp.points` for this scorecard under `mvp_model_id`. Denormalized for query performance — MVP is heavily used for sorting and aggregation. Updated if a newer model is applied post-ingest. |
| `mvp_model_id` | uuid FK | never | derived | References `MvpModel` — the version used to calculate `mvp_points`. Required to interpret the value correctly and to identify when a newer model is available for re-calculation. |

#### Position-Specific Null Summary

| Column Group | Commander | Heavy Weapons | Scout | Ammo Carrier | Medic |
|---|---|---|---|---|---|
| Nuke stats | ✓ stored | null | null | null | null |
| `rapid_fire` + rapid fire group | null | null | ✓ stored | null | null |
| `ammo_boost` | null | null | null | ✓ stored | null |
| `life_boost` | null | null | null | null | ✓ stored |
| `resupplies_given` | null | null | null | ✓ stored | ✓ stored |
| `double_resupplies_given` | null | null | null | ✓ stored | ✓ stored |
| `sp_earned` / `sp_spent` | ✓ stored | null | ✓ stored | ✓ stored | ✓ stored |

#### Ingest Notes

Several columns require event stream replay at ingest rather than being readable directly from line type 7:

- **SP tracking** — must simulate SP accrual through the event stream respecting the 99 cap.
- **Rapid fire windows** — must track `0400` → `0500` pairs to identify rapid fire periods.
- **State tracking** — uptime/downtime, resets, and assists all require knowing each player's current state (0, 2, or 3) at each event timestamp. For pre-2.005 files, state must be reconstructed synthetically using 4000ms + 4000ms timers from each deactivating event.
- **Resupply downtime attribution** — distinguish resupply-caused state 3 transitions from other causes by checking whether a `0500`/`0502` event at the same timestamp targeting this player preceded the transition.
- **Medic hit stats** — `shots_hit_opponent_medic`, `shots_hit_team_medic`, `missiles_hit_opponent_medic`, `missiles_hit_team_medic` require knowing which players are Medics. In non-standard compositions with multiple Medics per team, all qualifying players should be counted.
- **Missile medic stats** — `missiles_hit_opponent_medic` and `missiles_hit_team_medic` are not in line type 7 and must be derived from `0306` events.
- **Elimination detection** — requires tracking each player's running life count through the event stream to identify when a deactivation causes lives to reach 0.
- **Lives removed by nuke** — requires knowing each affected player's life count at the moment of each `0405` event to correctly apply the `min(3, lives_remaining)` cap.
- **Assists** — requires an 8000ms sliding window of damaging hits against Commander and Heavy Weapons targets, cleared on state 3 transitions.

---

### `GamePlayerInteraction`

One row per ordered player pair per game, including pairs with zero interactions. Records all hits and missiles between two players in a single direction — player A acting on player B. The full picture of any two players' interaction is reconstructed from two rows: A→B and B→A.

Friendly and opponent interactions are both recorded — team relationship is derivable by comparing `scorecard_id` and `target_scorecard_id` via their respective `team_id` references on `Scorecard`.

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. Denormalized from Scorecard for query performance — kept consistent with Scorecard FKs at ingest. |
| `scorecard_id` | uuid FK | never | References `Scorecard` — the acting player (the one landing hits). |
| `target_scorecard_id` | uuid FK | never | References `Scorecard` — the receiving player. |
| `shots_hit` | integer | never | Total shots that hit the target player (`0205` and `0206` events). Includes both damaging and deactivating hits. |
| `shot_deactivations` | integer | never | Subset of `shots_hit` — times this player's shot deactivated the target (`0206` events only). For 1-HP positions (Scout, Ammo Carrier, Medic) this will always equal `shots_hit`. Only meaningfully distinct for Commander and Heavy Weapons targets. |
| `missile_hits` | integer | never | Total missiles that hit the target player (`0306` events). Missiles always deactivate in one hit regardless of position. |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. Referenced by `Scorecard.mvp_model_id` and `ScorecardMvp.mvp_model_id`. |
| `version` | string | never | Human-readable version identifier in `year.month` format (e.g. `2021.12`). Unique. Used to identify which formula was active at ingest time and for display in historical comparisons. |
| `released_at` | timestamp | never | When this version became active. Used to determine which model was current at the time of any given game's ingest. |
| `retired_at` | timestamp | nullable | When this version was superseded by a newer model. Null for the currently active version. Only one row should have `retired_at = null` at any time. |
| `description` | string | nullable | Human-readable notes on what changed in this version relative to the previous one. Free text. |
| `parameters` | json | never | The complete formula definition for this version. Contains all component types, multipliers, thresholds, and position applicability. See JSON schema below. |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `scorecard_id` | uuid FK | never | References `Scorecard`. |
| `mvp_model_id` | uuid FK | never | References `MvpModel` — the formula version used to calculate this component value. |
| `component` | string | never | The component identifier. See component table below. |
| `input_value` | double | never | The raw stat value fed into the formula for this component before the multiplier is applied (e.g. accuracy as a decimal, count of medic hits). Stored for transparency and debugging — allows verification that the MVP calculation was applied correctly without re-reading the Scorecard. |
| `points` | double | never | The MVP points awarded for this component after applying the formula multiplier. Positive or negative. Zero for inapplicable or zero-value components. |

**Constraints:**
- `(scorecard_id, mvp_model_id, component)` is a unique key.

**Component identifiers and calculation methods (version 2021.12):**

| Component | Applies To | Input Value | Points Calculation |
|-----------|------------|-------------|-------------------|
| `accuracy` | all | `Scorecard.accuracy` converted to percentage, ceiling to nearest whole percent | `ceil(accuracy × 100) × accuracy_points_per_percent` |
| `shots_hit_opponent_medic` | all | `Scorecard.shots_hit_opponent_medic` | `value × medic_hit_opponent_points` |
| `shots_hit_team_medic` | all | `Scorecard.shots_hit_team_medic` | `value × medic_hit_team_points` |
| `elimination_bonus` | all | seconds of game time remaining above 3-minute threshold at elimination, 0 if team did not win by elimination | `elimination_bonus_minimum + (seconds_above_threshold × elimination_bonus_points_per_second)` if elimination win, else 0 |
| `nukes_canceled` | all | `Scorecard.nukes_canceled` | `value × nuke_cancel_opponent_points` |
| `team_nukes_canceled` | all | `Scorecard.team_nukes_canceled` | `value × nuke_cancel_team_points` |
| `times_hit_by_missile` | all | `Scorecard.times_hit_by_missile` | `value × missiled_points` |
| `eliminated` | all except Medic | `Scorecard.eliminated` as 1 or 0 | `value × eliminated_points` |
| `missiles_hit_opponent` | Commander, Heavy | `Scorecard.missiles_hit_opponent` | `value × missile_opponent_points` |
| `nukes_detonated` | Commander | `Scorecard.nukes_detonated` | `value × nuke_detonated_points` |
| `nukes_canceled_by_opponent` | Commander | `Scorecard.nukes_activated - Scorecard.nukes_detonated` | `value × nuke_canceled_points` |
| `shots_hit_opponent_3hit` | Scout | `Scorecard.shots_hit_opponent_3hit` | `value × shot_3hit_points` |
| `ammo_boost` | Ammo Carrier | `Scorecard.ammo_boost` | `value × ammo_boost_points` |
| `life_boost` | Medic | `Scorecard.life_boost` | `value × life_boost_points` |
| `survival_bonus` | Medic | `Scorecard.eliminated` inverted — 1 if survived, 0 if eliminated | `value × survival_bonus_points` |
| `score_bonus` | all | `max(0, Scorecard.score - threshold) / 1000` | `value × score_bonus_points_per_1000` |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. Referenced by `GamePlayerState.event_id`. |
| `game_id` | uuid FK | never | References `Game`. |
| `time` | integer | never | Milliseconds elapsed since mission start, from the line type 4 `time` field. |
| `event_type` | string | never | The 4-character event type code from the TDF (e.g. `0205`, `0404`, `0101`). Stored as-is — the UI maps these to human-readable labels. |
| `actor_scorecard_id` | uuid FK | nullable | References `Scorecard` — the player who performed the action. Null for events with no actor (e.g. `0100` Mission Start, `0101` Mission End). |
| `target_scorecard_id` | uuid FK | nullable | References `Scorecard` — the player who received the action. Null for events with no player target — misses, ability activations, team events, and target interactions. |
| `target_game_target_id` | uuid FK | nullable | References `GameTarget` — the non-player target involved in the event. Null for all non-target events. Mutually exclusive with `target_scorecard_id` — an event targets either a player or a non-player entity, never both. |
| `description` | string | never | The middle portion of the plain text description from the TDF line type 4 entry (e.g. `" zaps "`, `" destroys "`, `" activates nuke"`). Combined with actor and target callsigns by the UI to produce the full human-readable event string. |

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

| Column | Type | Null | Description |
|--------|------|------|-------------|
| `id` | uuid | never | Primary key. |
| `game_id` | uuid FK | never | References `Game`. Denormalized for query performance — state lookups are always scoped to a game. |
| `event_id` | uuid FK | never | References `GameEvent` — the event that caused this state change. Provides precise coupling between the event log and state log, ensuring the scoreboard and event display stay in sync. |
| `scorecard_id` | uuid FK | never | References `Scorecard` — the player whose state is recorded here. |
| `time` | integer | never | Milliseconds elapsed since mission start. Denormalized from `GameEvent.time` for query performance — state lookups by timestamp are the primary read pattern. |
| `score` | integer | never | Player's current score after this event. |
| `lives` | integer | never | Lives remaining after this event. |
| `shots` | integer | never | Shots remaining after this event. |
| `missiles` | integer | never | Missiles remaining after this event. |
| `sp` | integer | never | Special points after this event. Capped at 99. Stored as 0 for Heavy Weapons rather than null — the state table requires a consistent numeric type across all positions for scoreboard display. |
| `hit_points` | integer | never | Current hit points after this event. Always 1 for Scout, Ammo Carrier, and Medic. Meaningful for Commander and Heavy Weapons (max 3) — tracks partial damage carried across state 2 windows. Resets to position maximum on every transition to state 3 regardless of cause. |
| `state` | integer | never | Current player state after this event. 0 = active, 2 = vulnerable, 3 = invulnerable. Matches the state values from line type 9. |
| `is_rapid_fire` | boolean | never | True if this Scout currently has rapid fire active. Always false for all other positions. Set to true on `0400`, false on the next `0500` targeting this Scout. |
| `is_nuking` | boolean | never | True if this Commander is currently in an active nuke countdown. Always false for all other positions. Set to true on `0404`, false on `0405` or any transition to state 3 — there is no explicit cancellation event in the TDF so the state 3 transition itself is the cancellation signal. |
| `accuracy` | double | never | Live shot accuracy at this point in the game — `shots_hit / shots_fired` tracked cumulatively through the event stream. Stored as 0 until the player has fired at least one shot. Exists solely for replay scoreboard display — `Scorecard.accuracy` is the authoritative end-of-game value. |
| `hit_diff` | double | never | Live hit differential at this point in the game — `shots_hit_opponent / max(times_hit, 1)` tracked cumulatively through the event stream. Stored as 0 until the player has hit at least one opponent. Matches the definition of `Scorecard.hit_diff` but reflects in-game state rather than the final value. Exists solely for replay scoreboard display. |

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