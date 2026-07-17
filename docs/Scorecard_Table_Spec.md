# Scorecard Table Specification

**Game Type:** Space Marines 5 (SM5)  
**Last Updated:** 2026

---

## Overview

The `Scorecard` table is the primary record of a single player's participation and performance in a single game. It combines identity context (who played, in what role, on what team) with a full set of recorded and derived performance stats.

One row exists per player per game. Non-player entities (targets, referees) are stored separately in `GameNonPlayerEntity` and do not appear here.

All stat columns that are position-specific are stored as `null` for positions where they do not apply. A value of `0` always means the stat is applicable but the player simply recorded zero — it is never used as a substitute for null.

All derived stats are calculated at ingest time from the event stream or from other columns on the same row. They are stored rather than computed at query time for consistency and query performance.

---

## Column Reference

### Identity & Context

| Column          | Type      | Source        | Description                                                                                                                                                                                                                                     |
| --------------- | --------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid      | generated     | Primary key.                                                                                                                                                                                                                                    |
| `game_id`       | uuid FK   | line type 1   | The game this scorecard belongs to.                                                                                                                                                                                                             |
| `player_id`     | uuid FK   | line type 3   | The persistent player record. Null for unregistered guests with no iplId.                                                                                                                                                                       |
| `team_id`       | uuid FK   | line type 2/3 | The team this player was on during this game.                                                                                                                                                                                                   |
| `battlesuit_id` | uuid FK   | line type 3   | The physical battlesuit assigned to this player. Null if absent in older file versions.                                                                                                                                                         |
| `ipl_id`        | string    | line type 3   | Denormalized from Player for query convenience. The globally unique Laserforce member identifier (`#xxxxxxx`). Null for unregistered guests.                                                                                                    |
| `callsign`      | string    | line type 3   | The player's display name at the time of this game. Stored as a point-in-time fact — players can change callsigns and this reflects what they were called during this game specifically.                                                        |
| `position`      | integer   | line type 3   | The role the player selected for this game. Maps to: 1=Commander, 2=Heavy Weapons, 3=Scout, 4=Ammo Carrier, 5=Medic.                                                                                                                            |
| `eliminated`    | boolean   | line type 6   | True if the player ran out of lives before the game ended (exit code `04`). False if they survived to mission end (exit code `02`).                                                                                                             |
| `end_time`      | timestamp | line type 4/6 | The moment this player's game ended. For survivors this is the `0101` Mission End event timestamp. For eliminated players this is the timestamp of their line type 6 entry when their last life was exhausted. Used to calculate time survived. |

---

### Shot Stats

All shot stats are derived from `0205` and `0206` events in the event stream, plus line type 7 fields where noted.

| Column                     | Type    | Null  | Source      | Description                                                                                                                                                                                                                                                                 |
| -------------------------- | ------- | ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shots_fired`              | integer | never | line type 7 | Total shots fired including misses.                                                                                                                                                                                                                                         |
| `shots_hit`                | integer | never | line type 7 | Total shots that hit any target, player or non-player.                                                                                                                                                                                                                      |
| `shots_hit_opponent`       | integer | never | line type 7 | Shots that hit an opposing team player (`0205` and `0206` where target is an opponent).                                                                                                                                                                                     |
| `shots_hit_team`           | integer | never | line type 7 | Shots that hit a friendly team player (`0205` and `0206` where target is a teammate).                                                                                                                                                                                       |
| `shots_hit_opponent_3hit`  | integer | never | line type 7 | Shots that hit an opposing Commander or Heavy Weapons player — the two 3-hit-point positions. Tracks high-value hits against durable targets.                                                                                                                               |
| `shots_hit_opponent_medic` | integer | never | derived     | Shots that hit the opposing team's Medic (`0205` and `0206` where target is the opponent Medic). Since the Medic has 1 hit point, every hit is also a deactivation. High strategic value — hitting the enemy Medic degrades their team's life resupply capability.          |
| `shots_hit_team_medic`     | integer | never | derived     | Shots that hit the friendly team's Medic. Shame stat — friendly Medic hits waste lives and are tactically costly.                                                                                                                                                           |
| `times_hit`                | integer | never | line type 7 | Number of times this player was hit by any shot (`0205` and `0206` events where this player is the target).                                                                                                                                                                 |
| `times_reset`              | integer | never | derived     | Number of times this player was reset by a shot — subset of `times_hit` where the player was already in state 2 (vulnerable respawn window) when hit, restarting their full 8000ms respawn cycle. Victim-side counterpart to `reset_opponent`/`reset_team` on the attacker. |

---

### Missile Stats

Missile stats are derived from `0306` events and line type 7 fields where noted. Only Commander and Heavy Weapons have missiles at game start — other positions will record 0 for firing stats but can still be hit by missiles.

| Column                        | Type    | Null  | Source      | Description                                                                                                                                                                                                                       |
| ----------------------------- | ------- | ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `missile_hits`                | integer | never | line type 7 | Total missiles fired by this player that hit any target, player or non-player.                                                                                                                                                    |
| `missiles_hit_opponent`       | integer | never | line type 7 | Missiles that hit an opposing team player.                                                                                                                                                                                        |
| `missiles_hit_team`           | integer | never | line type 7 | Missiles that hit a friendly team player. Shame stat.                                                                                                                                                                             |
| `missiles_hit_opponent_medic` | integer | never | derived     | Missiles that hit the opposing team's Medic. High value — a missile always deactivates in one hit regardless of hit points.                                                                                                       |
| `missiles_hit_team_medic`     | integer | never | derived     | Missiles that hit the friendly team's Medic. Shame stat.                                                                                                                                                                          |
| `times_hit_by_missile`        | integer | never | line type 7 | Number of times this player was hit by a missile (`0306` events where this player is the target).                                                                                                                                 |
| `times_reset_by_missile`      | integer | never | derived     | Number of times this player was reset by a missile — subset of `times_hit_by_missile` where the player was already in state 2 when hit. Victim-side counterpart to `missile_reset_opponent`/`missile_reset_team` on the attacker. |

---

### Nuke Stats

All nuke stats are Commander only. Stored as null for all other positions — a value of 0 would indicate a Commander who never activated a nuke, null indicates the stat is not applicable to this position.

| Column                         | Type    | Null           | Source      | Description                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------- | -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nukes_activated`              | integer | Commander only | line type 7 | Number of nuke activation sequences begun (`0404` events), including those subsequently cancelled.                                                                                                                                                                                                                              |
| `nukes_detonated`              | integer | Commander only | line type 7 | Number of nukes that successfully detonated (`0405` events). Always less than or equal to `nukes_activated`.                                                                                                                                                                                                                    |
| `nukes_hit_medic`              | integer | Commander only | line type 7 | Number of opposing Medic lives lost due to this Commander's nuke detonations. Tracks indirect Medic damage via nuke.                                                                                                                                                                                                            |
| `lives_removed_by_nuke`        | integer | Commander only | derived     | Total lives actually removed from opposing players across all nuke detonations. Calculated as `sum(min(3, target_lives_remaining))` per affected player per detonation — capped at actual lives remaining rather than the flat 3 the nuke applies, so a player with 1 life left counts as 1 not 3. Measures nuke effectiveness. |
| `total_nuke_activation_time`   | integer | Commander only | derived     | Total milliseconds spent waiting between nuke activation and detonation across all successful nukes. Cancelled nukes are excluded — only `0404` events with a corresponding `0405` are counted.                                                                                                                                 |
| `average_nuke_activation_time` | integer | Commander only | derived     | `total_nuke_activation_time / nukes_detonated`. Null if `nukes_detonated = 0`. Reflects the random 4–7 second countdown distribution experienced by this Commander.                                                                                                                                                             |

---

### Nuke Cancel Stats

Tracked for all positions — any player can cancel an opposing or friendly nuke by deactivating the activating Commander during their countdown.

| Column                | Type    | Null  | Source      | Description                                                                                                                                                                                        |
| --------------------- | ------- | ----- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nukes_canceled`      | integer | never | line type 7 | Number of opposing team nukes cancelled by this player — i.e. times this player deactivated an enemy Commander during their nuke activation sequence before detonation. High value defensive play. |
| `team_nukes_canceled` | integer | never | line type 7 | Number of friendly nukes accidentally cancelled by this player — i.e. times this player deactivated their own Commander during an active nuke sequence. Shame stat.                                |

---

### Special Ability Stats

Position-specific stats. Null for positions where the ability does not exist.

| Column                            | Type    | Null              | Source      | Description                                                                                                                                                                                                         |
| --------------------------------- | ------- | ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rapid_fire`                      | integer | Scout only        | line type 7 | Number of times this Scout activated rapid fire (`0400` events).                                                                                                                                                    |
| `total_rapid_time`                | integer | Scout only        | derived     | Total milliseconds spent in rapid fire across all activations. Each activation window runs from `0400` to the next `0500` ammo resupply targeting this Scout, which is the event that ends rapid fire per the spec. |
| `average_rapid_time`              | integer | Scout only        | derived     | `total_rapid_time / rapid_fire`. Null if `rapid_fire = 0`. Average duration of a single rapid fire activation in milliseconds.                                                                                      |
| `shots_fired_during_rapid`        | integer | Scout only        | derived     | Total shots fired while rapid fire was active.                                                                                                                                                                      |
| `shots_hit_during_rapid`          | integer | Scout only        | derived     | Total shots that hit any target while rapid fire was active.                                                                                                                                                        |
| `shots_hit_opponent_during_rapid` | integer | Scout only        | derived     | Shots that hit an opposing player while rapid fire was active.                                                                                                                                                      |
| `shots_hit_team_during_rapid`     | integer | Scout only        | derived     | Shots that hit a friendly player while rapid fire was active.                                                                                                                                                       |
| `accuracy_during_rapid`           | double  | Scout only        | derived     | `shots_hit_during_rapid / shots_fired_during_rapid`. 0 if `shots_fired_during_rapid = 0`. Compare with `accuracy` to measure whether rapid fire improves or degrades this Scout's precision.                        |
| `ammo_boost`                      | integer | Ammo Carrier only | line type 7 | Number of times this Ammo Carrier used the team ammo resupply special ability (`0510` events), resupplying shots for all active teammates simultaneously. Costs 15 SP.                                              |
| `life_boost`                      | integer | Medic only        | line type 7 | Number of times this Medic used the team lives resupply special ability (`0512` events), resupplying lives for all active teammates simultaneously. Costs 10 SP.                                                    |

---

### Support Stats

Resupply activity for Ammo Carrier and Medic. Null for all other positions — other positions cannot give resupplies.

| Column                      | Type    | Null            | Source  | Description                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resupplies_given`          | integer | Ammo/Medic only | derived | Number of individual resupply tags given — `0500` events for Ammo Carrier, `0502` events for Medic. Each deactivates the target for a full 8-second respawn cycle.                                                                                                                                                                                                                                |
| `double_resupplies_given`   | integer | Ammo/Medic only | derived | Number of successful double resupplies — simultaneous `0500` and `0502` events at the same timestamp against the same target, resulting in a single 8-second downtime that grants both shots and lives. Tracked independently on both the Ammo Carrier and Medic row — in standard games with one of each these numbers will match, but custom variants with multiple support players may differ. |
| `resupplies_received_ammo`  | integer | never           | derived | Number of times this player received a shot resupply (`0500` events where this player is the target). Will always be 0 for Ammo Carriers (cannot resupply their own shots).                                                                                                                                                                                                                       |
| `resupplies_received_lives` | integer | never           | derived | Number of times this player received a lives resupply (`0502` events where this player is the target). Will always be 0 for Medics (cannot be resupplied by anyone per the spec).                                                                                                                                                                                                                 |

---

### Combat Outcomes

| Column                      | Type    | Null  | Source  | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------- | ------- | ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deactivated_opponent`      | integer | never | derived | Number of opposing players deactivated by this player via `0206` or `0306`, regardless of whether lives were exhausted. Measures combat output — how often this player put an opponent out of action.                                                                                                                                                                                                                                                                                   |
| `deactivated_team`          | integer | never | derived | Number of friendly players deactivated by this player via `0206` or `0306`. Shame stat — includes accidental friendly fire and ill-timed resupply tags on state 2 teammates.                                                                                                                                                                                                                                                                                                            |
| `eliminated_opponent`       | integer | never | derived | Number of opposing players this player personally eliminated — `0206` or `0306` events that caused the target's lives to reach 0. A subset of `deactivated_opponent`. Includes eliminations caused via nuke (`0405`).                                                                                                                                                                                                                                                                   |
| `eliminated_team`           | integer | never | derived | Number of friendly players this player personally eliminated via `0206` or `0306`. Shame stat. Friendly nukes cannot eliminate teammates so nuke events are excluded.                                                                                                                                                                                                                                                                                                                   |
| `eliminated_opponent_medic` | integer | never | derived | Number of times this player personally eliminated the opposing Medic. The highest-value individual action in the game — an eliminated Medic shuts off the opposing team's life resupply for the rest of the game. Subset of `eliminated_opponent`.                                                                                                                                                                                                                                      |
| `eliminated_team_medic`     | integer | never | derived | Number of times this player personally eliminated their own Medic. Subset of `eliminated_team`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `assists`                   | integer | never | derived | Number of assists credited to this player — defined as landing a damaging hit (`0205`) on a Commander or Heavy Weapons opponent that is followed by a deactivating hit from any other player within 8000ms, provided the target did not transition to state 3 between this player's hit and the deactivation (i.e. the target did not fully respawn in between). Multiple players can earn an assist on a single deactivation. The deactivating player does not also receive an assist. |
| `reset_opponent`            | integer | never | derived | Number of times this player reset an opposing player — landing a `0205` or `0206` hit on an opponent currently in state 2 (vulnerable respawn window), restarting their full 8000ms respawn cycle. A key suppression mechanic.                                                                                                                                                                                                                                                          |
| `reset_team`                | integer | never | derived | Number of times this player accidentally reset a teammate in state 2. Shame stat — extends a friendly player's downtime.                                                                                                                                                                                                                                                                                                                                                                |
| `missile_reset_opponent`    | integer | never | derived | Number of times this player reset an opposing player via missile (`0306`) while the target was in state 2.                                                                                                                                                                                                                                                                                                                                                                              |
| `missile_reset_team`        | integer | never | derived | Number of times this player reset a teammate via missile (`0306`) while the target was in state 2. Shame stat.                                                                                                                                                                                                                                                                                                                                                                          |

---

### SP Tracking

Tracked for all positions except Heavy Weapons, which has no special ability and does not earn or spend SP. Null for Heavy Weapons.

SP are not recorded in the TDF and must be inferred from the event stream at ingest. The SP cap of 99 means `sp_earned` cannot be derived from end-state stats alone — it must be tracked cumulatively through the event stream, clamping at 99 whenever the running total would exceed it.

| Column      | Type    | Null       | Source  | Description                                                                                                                                                                                                                          |
| ----------- | ------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sp_earned` | integer | Heavy only | derived | Total SP earned during the game, capped at the maximum accrual of 99 at any point. Earned at: +1 per opponent tag (0205/0206), +2 per Commander missile hit on an opponent (0306), +5 per target destroyed (0204/0303).              |
| `sp_spent`  | integer | Heavy only | derived | Total SP spent on special abilities during the game. Calculated as: Commander `nukes_activated × 20`, Scout `rapid_fire × 10`, Ammo Carrier `ammo_boost × 15`, Medic `life_boost × 10`. Always 0 for Heavy Weapons (stored as null). |

---

### Targets

| Column              | Type    | Null  | Source  | Description                                                                                                                                                                                                                                                                                       |
| ------------------- | ------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `targets_destroyed` | integer | never | derived | Number of non-player targets destroyed by this player. Counts both standard shot destructions (`0204`) and missile destructions (`0303`). Each destroyed target awards +1001 points and represents a significant scoring opportunity — typically worth 10–20% of an average player's total score. |

---

### Penalties

| Column      | Type    | Null  | Source      | Description                                                                                                               |
| ----------- | ------- | ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `penalties` | integer | never | line type 7 | Number of referee penalties assessed against this player during the game (`0600` events where this player is the target). |

---

### End State

| Column       | Type    | Null  | Source      | Description                                                   |
| ------------ | ------- | ----- | ----------- | ------------------------------------------------------------- |
| `lives_left` | integer | never | line type 7 | Lives remaining at game end. Always 0 for eliminated players. |
| `shots_left` | integer | never | line type 7 | Shots remaining at game end.                                  |

---

### Uptime & Downtime

All values in milliseconds. The three columns always sum to total time between the `0100` Mission Start event and this player's `end_time` — useful as a consistency check at ingest. Derived from line type 9 player state transitions, or synthetic reconstruction for pre-2.005 files using 4000ms + 4000ms timers from each deactivating event.

| Column              | Type    | Null  | Source  | Description                                                                                                                                      |
| ------------------- | ------- | ----- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `uptime`            | integer | never | derived | Total milliseconds spent in state 0 (active). The primary measure of how much of the game a player was actually participating.                   |
| `resupply_downtime` | integer | never | derived | Total milliseconds spent in state 2 or 3 following a resupply event (`0500` or `0502`). Voluntary downtime — the cost of being resupplied.       |
| `other_downtime`    | integer | never | derived | Total milliseconds spent in state 2 or 3 for any reason other than resupply — enemy fire, nuke, penalty, or friendly fire. Involuntary downtime. |

---

### Derived Performance

| Column     | Type    | Null  | Source      | Description                                                                                                                                                                                                                                                                                             |
| ---------- | ------- | ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `score`    | integer | never | line type 6 | Final score at game end. Matches the `new` value of this player's last line type 5 score entry. Authoritative value is from line type 6.                                                                                                                                                                |
| `accuracy` | double  | never | derived     | `shots_hit / shots_fired`. Stored as 0 if `shots_fired = 0`. Whole-game shot accuracy including rapid fire periods. Compare with `accuracy_during_rapid` for Scouts to measure the impact of rapid fire on precision.                                                                                   |
| `hit_diff` | double  | never | derived     | `shots_hit_opponent / max(times_hit, 1)`. Measures exchange efficiency — values above 1.0 indicate this player is landing more hits on opponents than they are receiving. `max(times_hit, 1)` is used as the divisor so players who were never hit still produce a meaningful ratio rather than a null. |

---

## Position-Specific Null Summary

| Column Group                    | Commander | Heavy Weapons | Scout    | Ammo Carrier | Medic    |
| ------------------------------- | --------- | ------------- | -------- | ------------ | -------- |
| Nuke stats                      | ✓ stored  | null          | null     | null         | null     |
| `rapid_fire` + rapid fire group | null      | null          | ✓ stored | null         | null     |
| `ammo_boost`                    | null      | null          | null     | ✓ stored     | null     |
| `life_boost`                    | null      | null          | null     | null         | ✓ stored |
| `resupplies_given`              | null      | null          | null     | ✓ stored     | ✓ stored |
| `double_resupplies_given`       | null      | null          | null     | ✓ stored     | ✓ stored |
| `sp_earned` / `sp_spent`        | ✓ stored  | null          | ✓ stored | ✓ stored     | ✓ stored |

---

## Ingest Notes

Several columns require event stream replay at ingest rather than being readable directly from line type 7:

- **SP tracking** — must simulate SP accrual through the event stream respecting the 99 cap
- **Rapid fire windows** — must track `0400` → `0500` pairs to identify rapid fire periods
- **State tracking** — uptime/downtime, resets, and assists all require knowing each player's current state (0, 2, or 3) at each event timestamp. For pre-2.005 files, state must be reconstructed synthetically using 4000ms + 4000ms timers from each deactivating event
- **Missile medic stats** — `missiles_hit_opponent_medic` and `missiles_hit_team_medic` are not in line type 7 and must be derived from `0306` events
- **Elimination detection** — requires tracking each player's running life count through the event stream to identify when a deactivation causes lives to reach 0
- **Lives removed by nuke** — requires knowing each affected player's life count at the moment of each `0405` event to correctly apply the `min(3, lives_remaining)` cap
- **Assists** — requires an 8000ms sliding window of damaging hits against Commander and Heavy Weapons targets, cleared on state 3 transitions
