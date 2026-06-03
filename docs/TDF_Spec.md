# TDF File Format Specification

**Version:** 2.000 — 2.006  
**Game Type:** Space Marines 5 (SM5)  
**Last Updated:** 2026

---

## Overview

TDF (Tab Delimited File) files are the raw game logs produced by the Laserforce software system at each laser tag center. They are stored on S3 and represent a live event stream recorded as the game is played — the file is written sequentially from initialization through to game end.

Each line begins with a numeric type code that determines the meaning and structure of the remaining tab-delimited fields. Lines beginning with `;` are schema comment lines indicating the column names for the following line type — they are not data and should be ignored during parsing. Schema comment lines appear immediately before the first use of their line type, not necessarily grouped at the top of the file.

**Encoding:** UTF-16 LE with BOM  
**Line endings:** `\r\n`  
**Delimiter:** Tab (`\t`)

### File Structure Overview

A TDF file follows this general sequence:

1. **Header** — software and center metadata (line type `0`)
2. **Mission initialization** — game mode and configuration (line type `1`)
3. **Team definitions** — team names and colors (line type `2`)
4. **Mission Start event** — `0100` event on line type `4`
5. **Entity registration** — players and non-player entities check in (line type `3`)
6. **Initial state transitions** — players go active (line type `9`, version-gated)
7. **Game event stream** — interleaved line types `4`, `5`, `9` throughout gameplay
8. **End-of-game summaries** — per-entity results and stats (line types `6`, `7`)

### File Naming Convention

Files are named using the pattern:
```
{centre}_{start}_{desc}.tdf
```
For example: `3-3_20260519201615_-_Space_Marines_5.tdf`

### Version Notes

TDF file format changes have been **additive** — higher versions are supersets of lower ones. The oldest known version is `2.000`; the current version is `2.006`. See Appendix D for a full version-gated feature table.

The `file-version` field on line type `0` is a useful hint but is not always a reliable indicator of which fields are present — some fields were rolled out incrementally across centers within the same version number. **Always use the schema comment line as the authoritative source for which columns are present on any given line type.**

When parsing older files, absent fields should be treated as `null` or a defined default (see per-field notes), and absent line types must be synthetically reconstructed where needed (see line type `9` notes).

### Ingestion Rules

- Files where line type `1` `type` is not `5` (SM5) should be skipped entirely.
- Files with no `player` entities (game initialized but cancelled before anyone joined) should be skipped.
- Files where a `player` entity re-registers with a different `team` index represent a hardware error that cannot be modeled and should be rejected (moved to an error bucket without ingestion).
- Files containing exit codes `01` or `17` on line type `6` may appear in the archive. When encountered, the affected players should be treated as eliminated with `livesLeft = 0`.

---

## Game Overview

### What is Space Marines 5?

Space Marines 5 (SM5) is a tactical competitive laser tag variant where two or more teams of players take on specialized roles and compete to outscore or eliminate the opposing team. Games are typically 10–15 minutes long.

### Win Conditions

At the end of a game, the team with the highest total score wins. Team score is the sum of all individual player scores on that team.

A team can also win by **eliminating** the opposing team — if all players on a team are eliminated (run out of lives) before time expires, the game ends immediately and the opposing team wins regardless of score. If 60 seconds or fewer remain when the last elimination occurs, the game runs to time instead.

Elimination is an absolute loss condition — an eliminated team is always the loser even if their total score is higher than the winning team.

Games can end in a draw if time expires with both teams at exactly equal scores.

**Competition bonus:** In organized competitions, a team that eliminates the opposing team is awarded an additional 10,000 points applied externally after the game. This bonus does not appear in the TDF and is applied during results processing. It is relevant for cumulative scoring across a competition (e.g. total points scored across multiple games for rankings), not for determining the winner of an individual game.

### Arena Targets

Most SM5 arenas include a set of static in-arena targets — referred to interchangeably as targets, beacons, or generators depending on the hardware configuration. They are all treated identically for scoring purposes.

Targets require 3 consecutive hits to destroy and award **1001 points** to the player who lands the final shot. A typical game has 3 targets, one loosely associated with each team and one neutral. Players cannot hit their own team's associated target, meaning 2 targets are typically available to each team per game.

Since a typical player score ranges from 5,000–9,000 points, destroying targets is a critical scoring opportunity — each is worth roughly 10–20% of an average player's total score. Both teams compete for the same available targets, making target control a key strategic priority.

### Special Points

Special Points (SP) are an in-game resource that players accumulate during play and spend to activate their position's special ability. SP are **not tracked in the TDF** and must be inferred from the event stream.

**Earning SP:**
- +1 SP for each tag on an opponent (regardless of whether they are deactivated)
- +2 SP for a Commander missile hit on an enemy player
- +5 SP for destroying a target

SP cap at 99 and stop accruing until spent. The Heavy Weapons position has no special ability and does not earn SP.

**Spending SP:**
- Commander: 20 SP to activate a nuke
- Scout: 10 SP to activate rapid fire
- Ammo Carrier: 15 SP to activate a team ammo boost
- Medic: 10 SP to activate a team lives boost

### Resupply Mechanics

Lives and shots are finite resources for most positions. The Ammo Carrier and Medic are the team's support roles, responsible for keeping their teammates stocked.

**Individual resupply** (`0500`, `0502`): The Ammo Carrier or Medic tags an active (state 0) teammate. The target is immediately deactivated and goes through the full 8-second respawn cycle (state 3 → state 2 → state 0). No score change occurs for either player. The target receives shots or lives (respectively) up to their position maximum.

Resupply timing is a critical tactical decision — taking a player offline for 8 seconds at the wrong moment can be as costly as losing them to enemy fire. For example, resupplying the Heavy right before an enemy attack temporarily removes your primary defender.

**Double resupply**: When the Ammo Carrier and Medic tag the same active player simultaneously (within a short hardware tolerance window), the target receives both shots and lives in a single 8-second downtime. This is highly efficient and a key coordination mechanic — without it, a full resupply would cost 16 seconds of downtime.

**Team boost** (`0510`, `0512`): A special ability that resupplies all active (state 0) teammates simultaneously without deactivating any of them. Requires 15 SP (Ammo) or 10 SP (Medic). Due to radio lag between suits and the game computer, a teammate who recently transitioned to state 3 may or may not receive the boost — the TDF cannot distinguish whether they were affected.

**Emergency resupply** (beacon entity `0500`/`0502`): Certain arena configurations include an Emergency Resupply beacon (entity type `beacon`, team `Neutral`). When the beacon actor appears on a `0500` or `0502` event, the same resupply rules apply to the target — shots or lives are restored up to the position maximum. The beacon resupply can apply regardless of the target's current state.

**Resupply rules:**
- Individual player resupply (`0500`, `0502`) targets state 0 players under normal conditions. Simultaneous double resupply (Ammo Carrier and Medic targeting the same player at nearly the same moment) can result in a second resupply event firing while the target is already in state 3 from the first resupply.
- Resupply does not cost shots for the Ammo Carrier (infinite shots) or Medic (tagging an active friendly is free — shots are only consumed on misses, opponent tags, target hits, or state 2 friendly tags)
- The Medic cannot resupply themselves; the Ammo Carrier cannot resupply their own shots (but an Ammo Carrier can resupply a Medic's shots)

### Positions

Each player chooses a position at the start of the game. Position determines starting stats, shot power, hit points, special ability, and strategic role. Teams are not required to have a specific composition, though competitive teams typically field one of each position.

---

#### Commander — Category 1

**Role:** Primary offensive player and team anchor.

The Commander is the highest-impact offensive position. Their primary goal is to apply sustained pressure on the opposing team, score hits on high-value targets (especially the enemy Medic), and deploy nukes at critical moments to swing the game.

**Nuke (20 SP):** The Commander's signature ability. On activation, a 4–7 second random countdown begins. If the Commander remains active (state 0) for the full countdown, the nuke detonates — all opposing players immediately lose 3 lives and are put into state 3 (invulnerable), resetting their respawn timers regardless of their current state. Players already in state 2 or 3 are still affected and still lose lives. Players whose lives reach 0 or below are eliminated. A successful nuke awards +500 points to the Commander.

If the Commander transitions to state 3 for any reason before detonation — enemy fire, friendly fire, or being resupplied — the nuke is cancelled with no effect. There is no explicit cancellation event in the TDF; a `0404` with no subsequent `0405` before the Commander's next state 3 transition indicates a cancelled nuke.

The typical Commander rotation involves alternating between offensive pressure and returning to the defensive resupply position to top up lives and shots, building SP toward additional nukes.

| Stat | Value |
|------|-------|
| Hit Points | 3 |
| Shot Power | 2 |
| Initial Shots | 30 |
| Max Shots | 60 |
| Resupply Shots | 5 |
| Initial Lives | 15 |
| Max Lives | 30 |
| Resupply Lives | 4 |
| Initial Missiles | 5 |
| SP Cost | 20 (nuke) |

---

#### Heavy Weapons — Category 2

**Role:** Primary defensive player and high-impact attacker.

The Heavy is the most powerful individual combat position — their shot power of 3 means a single hit deactivates any position in the game, including other Heavies and Commanders. However they receive the fewest shots and lives on each resupply, making them resource-constrained and heavily dependent on their Ammo Carrier.

The typical Heavy rotation involves holding a defensive position while the team's resupply establishes itself early in the game, then rotating to offense to maintain pressure while the Commander returns to resupply. Coordinated Commander/Heavy rotations — one attacking while the other resupplies — are the hallmark of competitive SM5 play.

The Heavy has 5 missiles at game start with no replenishment. Missiles always deactivate a player in one hit regardless of position, and are worth +500 points on opponent hits. The Heavy has no special ability and does not earn SP.

| Stat | Value |
|------|-------|
| Hit Points | 3 |
| Shot Power | 3 |
| Initial Shots | 20 |
| Max Shots | 40 |
| Resupply Shots | 5 |
| Initial Lives | 10 |
| Max Lives | 20 |
| Resupply Lives | 3 |
| Initial Missiles | 5 |
| SP Cost | N/A |

---

#### Scout — Category 3

**Role:** Versatile skirmisher.

The Scout is a flexible position that adapts to the game's needs — attacking, defending, or harassing as the situation demands. They receive the most lives and shots on each resupply, allowing them to return to action quickly. Their 1 hit point makes them fragile but their shot volume and mobility compensate.

**Rapid Fire (10 SP):** The Scout can activate rapid fire, allowing sustained fire by holding the trigger. This burns through shots faster but dramatically increases damage output — critical for taking down high-HP positions like Commanders and Heavies before they can respond. SP do not accrue during rapid fire. Rapid fire ends when the Scout is resupplied by an Ammo Carrier (not a Medic).

The `shot3Hit` stat in line type 7 specifically tracks Scout hits on Commander and Heavy Weapons players, reflecting the strategic value of a Scout taking down a 3-hit-point target.

| Stat | Value |
|------|-------|
| Hit Points | 1 |
| Shot Power | 1 |
| Initial Shots | 30 |
| Max Shots | 60 |
| Resupply Shots | 10 |
| Initial Lives | 15 |
| Max Lives | 30 |
| Resupply Lives | 5 |
| Initial Missiles | 0 |
| SP Cost | 10 (rapid fire) |

---

#### Ammo Carrier — Category 4

**Role:** Shot resupply support.

The Ammo Carrier keeps the team's shots topped up, allowing offensive players to maintain sustained fire throughout the game. They have effectively infinite shots — their shot count never decrements — and can resupply any active teammate's shots by tagging them. This deactivates the target for 8 seconds, so timing is critical.

**Team Ammo Boost (15 SP):** Resupplies shots for all active teammates simultaneously without deactivating anyone. A powerful mid-fight ability that avoids the individual resupply downtime cost.

The Ammo Carrier's shots are only consumed on misses, opponent tags, target hits, and accidental state 2 friendly tags — not on successful resupply tags.

| Stat | Value |
|------|-------|
| Hit Points | 1 |
| Shot Power | 1 |
| Initial Shots | 15 |
| Max Shots | 15 |
| Resupply Shots | 0 (infinite) |
| Initial Lives | 10 |
| Max Lives | 20 |
| Resupply Lives | 3 |
| Initial Missiles | 0 |
| SP Cost | 15 (team ammo boost) |

---

#### Medic — Category 5

**Role:** Lives resupply support. The most irreplaceable position on the team.

The Medic keeps the team alive by resupplying lives. Once a Medic is eliminated, their team can no longer gain lives for the rest of the game — making the Medic the highest-priority target for the opposing team and the most important player to protect.

The Medic has 20 lives and **cannot be resupplied by anyone** — not even a second Medic. Their lives are a finite non-renewable resource for the entire game. Their shots, however, can be resupplied by an Ammo Carrier.

**Team Lives Boost (10 SP):** Resupplies lives for all active teammates simultaneously without deactivating anyone. The Medic counterpart to the Ammo Carrier's team boost.

Resupply tags do not consume the Medic's shots. Shots are only used on misses, opponent tags, target hits, and accidental state 2 friendly tags.

| Stat | Value |
|------|-------|
| Hit Points | 1 |
| Shot Power | 1 |
| Initial Shots | 15 |
| Max Shots | 30 |
| Resupply Shots | 5 |
| Initial Lives | 20 |
| Max Lives | 20 |
| Resupply Lives | 0 (cannot be resupplied) |
| Initial Missiles | 0 |
| SP Cost | 10 (team lives boost) |

---

## Line Type 0 — `info`

**Appears:** Once, always the first line in the file.

**Schema:**
```
0	file-version	program-version	centre
```

| Field | Type | Description |
|-------|------|-------------|
| `file-version` | decimal | Version of the TDF file format. Changes are additive — higher versions are supersets of lower ones. Use as a parsing hint only; always verify field presence via schema comment lines. Known versions: `2.000` through `2.006`. |
| `program-version` | decimal | Version of the Laserforce software that generated the file. Informational only — stored for auditing purposes but does not affect parsing or data interpretation. |
| `centre` | string | Composite identifier for the physical location, formatted as `{country-code}-{site-code}`. Country code and site code are integers. Site codes are unique within a country but not globally — the unique key is the combination of both. Resolves to a `Center` record in the database by this identifier; the human-readable name is stored there, not in the TDF. |

**Notes:**
- The `centre` field is a foreign key reference — every game belongs to exactly one Center.
- Always use schema comment lines to determine which fields are present rather than relying solely on `file-version`.

---

## Line Type 1 — `mission`

**Appears:** Once, near the top of the file after line type `0`.

**Schema (2.001 and later):**
```
1	type	desc	start	duration
```

**Schema (2.003 and later):**
```
1	type	desc	start	duration	penalty
```

**Schema (2.000):**
```
1	type	desc	start
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | integer | Numeric code for the game mode. Only type `5` (Space Marines 5 / SM5) is tracked by this system. Files with other mission types should be ignored during ingestion. |
| `desc` | string | Human-readable name for the local game variant as configured in the Laserforce software. Centers can customize duration, penalty, and other settings and save them under a named variant. Stored as metadata — not interpreted. |
| `start` | datetime | Timestamp when the game was initialized, formatted as `YYYYMMDDHHmmss`. Combined with `centre` from line type `0`, forms the natural unique key for a game — a physical location can only run one game at a given moment. |
| `duration` | integer \| null | Scheduled game length in milliseconds. This is the configured duration at initialization time — not the actual elapsed time. Use the timestamp of the `0101` (Mission End) event to determine actual game length. Added in `2.001` — absent in `2.000`. When absent, assume `900000` (15 minutes). |
| `penalty` | integer \| null | Default score penalty amount applied when a referee penalizes a player mid-game (`0600` event). Added in `2.003` — absent in `2.000` and `2.001`. When absent, assume `0`. |

**Notes:**
- Files where `type` is not `5` should be skipped at ingestion time.
- `centre` + `start` is the natural unique key for a game record in the database.
- Actual game duration = timestamp of event `0101` minus `start`.
- The `desc` field reflects local center configuration and may vary widely between centers and over time at the same center.
- When `duration` is absent (2.000 files), default to `900000`ms (15 minutes).
- When `penalty` is absent (2.000 and 2.001 files), default to `0`.

---

## Line Type 2 — `team`

**Appears:** Multiple times, once per team. Always includes a `Neutral` team as the final entry.

**Schema (2.003 and earlier):**
```
2	index	desc	colour-enum	colour-desc
```

**Schema (2.004 and later):**
```
2	index	desc	colour-enum	colour-desc	colour-rgb
```

| Field | Type | Description |
|-------|------|-------------|
| `index` | integer | Zero-based position of the team within this game. Used to associate entities with their team via the `team` field on line type `3`. |
| `desc` | string | Human-readable team name as configured by the center (e.g. "Red Team", "Green Team"). The name `Neutral` is reserved for the non-player entity team and will always appear last. |
| `colour-enum` | integer | Canonical color identifier. Present in all TDF versions. Maps to a fixed lookup table (see below). |
| `colour-desc` | string | Human-readable color name derived from `colour-enum`. Present in all known TDF versions. When absent, derive from the `colour-enum` lookup table. |
| `colour-rgb` | string \| null | Hex RGB color value for display purposes (e.g. `#FF0000`). Stored and used for rendering team colors in the UI. Added in `2.004` — absent in `2.003` and earlier. When absent, use a hardcoded default RGB value per `colour-enum`. |

**Colour enum lookup table:**

| Value | Name | Value | Name |
|-------|------|-------|------|
| 0 | None | 8 | Orange |
| 1 | Red | 9 | Pink |
| 2 | Green | 10 | Black |
| 3 | Yellow | 11 | Fire |
| 4 | Blue | 12 | Ice |
| 5 | Aqua | 13 | Earth |
| 6 | Purple | 14 | Crystal |
| 7 | White | 15 | Rainbow |

**Notes:**
- SM5 games currently always have exactly 2 competing teams plus the Neutral team, but the schema should not assume a fixed team count — 3 or more competing team variants are possible.
- The `Neutral` team (always the last entry) is not a competing team. It exists to group non-player entities such as in-arena targets and referees.
- `colour-enum` is the authoritative color identifier. `colour-desc` and `colour-rgb` are supplementary and must be derived from the enum lookup when absent in older files.
- Team `index` is game-scoped — it has no meaning outside the context of a single game.

---

## Line Type 3 — `entity-start`

**Appears:** Multiple times, once per entity participating in the game. Entities are registered as they check in, so multiple line 3 entries may share the same `time` value. The schema comment line appears immediately before the first line 3 entry in the file.

**Schema (2.000 and 2.001):**
```
3	time	id	type	desc	team	level	category
```

**Schema (2.003 through 2.005, and some 2.006 files):**
```
3	time	id	type	desc	team	level	category	battlesuit
```

**Schema (current — 2.006 with memberId):**
```
3	time	id	type	desc	team	level	category	battlesuit	memberId
```

**Always use the schema comment line to determine which fields are present.**

| Field | Type | Description |
|-------|------|-------------|
| `time` | integer | Milliseconds elapsed since mission start at which this entity was registered. Stored as-is, but for stat calculation purposes all entities are treated as having started at the `0100` Mission Start event timestamp. |
| `id` | string | Entity identifier. Two formats: `#xxxxxxx` (iplId) for registered Laserforce members — globally unique across all sites; `@NNN` for physical hardware units — unique within a site but not globally. A `player` entity with an `@NNN` id is an unregistered guest using the suit's hardware ID as a fallback. |
| `type` | string | Class of entity. See entity type classification table below. |
| `desc` | string | Display name for the entity. For registered players this is their chosen callsign. For non-player entities this is the hardware unit's configured name. |
| `team` | integer | The `index` of the team this entity belongs to, referencing line type `2`. Non-player entities such as targets and referees are assigned to the `Neutral` team. |
| `level` | integer | Not meaningful for SM5. Ignored. |
| `category` | integer | The position/role the player is playing for this game. Maps to: 0=N/A (non-player entities), 1=Commander, 2=Heavy Weapons, 3=Scout, 4=Ammo Carrier, 5=Medic. Each position has distinct starting stats, powers, and abilities. |
| `battlesuit` | string \| null | The persistent display name of the physical battlesuit assigned to this entity for the game. Each battlesuit has a fixed name and a corresponding `@NNN` hardware ID at its center. Added in `2.003` — null if absent. Stored to enable suit-level stats (e.g. which battlesuit a player wears most often). |
| `memberId` | string \| null | Center-scoped member identifier, formatted as `{country-code}-{site-code}-{member-code}` (e.g. `4-19-165107`). Identifies the member as known at a specific center. Added in a later `2.006` sub-version — null if absent. Presence must be determined by the schema comment line, not `file-version`. Also null for non-player entities and unregistered guests. |

**Entity type classification:**

| Category | Types | Treatment |
|----------|-------|-----------|
| Player | `player` | Full stat tracking if iplId present; stored but no stats if `@NNN` guest |
| Referee | `referee` | Stored as game participant, listed per game; no stats tracked even if iplId present |
| Target | `standard-target`, `beacon`, `generator-target` | Stored for interaction context; all treated identically for event purposes |
| Warbot | `warbot` | Non-player combat entity that can deactivate players via `0209` events. Stored as a target-type entity; warbot deactivations cost the target 1 life but are not counted in `timesZapped`. |
| Edge case | `flag`, `phaser-station`, `gallery-target`, `serpent`, `reload`, `vortex`, `mini-target`, `unknown` | Stored as non-player entities for completeness; interactions not interpreted |

**Position stats reference:**

| Position | Category | Hit Points | Shot Power | Initial Shots | Max Shots | Resupply Shots | Initial Lives | Max Lives | Resupply Lives | Initial Missiles |
|----------|----------|------------|------------|---------------|-----------|----------------|---------------|-----------|----------------|-----------------|
| Commander | 1 | 3 | 2 | 30 | 60 | 5 | 15 | 30 | 4 | 5 |
| Heavy Weapons | 2 | 3 | 3 | 20 | 40 | 5 | 10 | 20 | 3 | 5 |
| Scout | 3 | 1 | 1 | 30 | 60 | 10 | 15 | 30 | 5 | 0 |
| Ammo Carrier | 4 | 1 | 1 | 15 | 15 | 0 | 10 | 20 | 3 | 0 |
| Medic | 5 | 1 | 1 | 15 | 30 | 5 | 20 | 20 | 0 | 0 |

**Notes:**
- The iplId (`#xxxxxxx`) is the canonical cross-site persistent identity for a player. It can be used to construct a link to their iPlayLaserforce profile: `https://www.iplaylaserforce.com/mission-stats/?t={iplId_without_hash}`.
- `memberId` is centre-scoped and should not be used as a global player identifier — use iplId for that.
- All entity `time` values are stored as-is. For stat calculation purposes, all entities are treated as having started at the time of the `0100` Mission Start event.
- Player entities with an `@NNN` id are unregistered guests. They appear in game summaries and details but no persistent stats are recorded for them.
- `battlesuit` is a physical asset tied to a specific center. The same battlesuit name maps to the same `@NNN` hardware ID at that center, enabling tracking of player-suit history.
- Referee participation is tracked at the game level but referees are excluded from all stat aggregation.
- All three target types (`standard-target`, `beacon`, `generator-target`) are treated identically for event and interaction tracking purposes.
- Ammo Carriers have effectively infinite shots — their shot count does not decrement during gameplay. They gain nothing from being resupplied.
- Only Commander and Heavy Weapons have missiles. Scout, Ammo Carrier, and Medic have `initialMissiles: 0`.

---

## Line Type 4 — `event`

**Appears:** Many times throughout the file. This is the primary event log — a timestamped stream of all meaningful game actions. The structure of columns after `type` varies based on the event type code.

**Schema:**
```
4	time	type	varies...
```

| Field | Type | Description |
|-------|------|-------------|
| `time` | integer | Milliseconds elapsed since mission start at which this event occurred. |
| `type` | string | 4-digit event type code. Determines the meaning and structure of all subsequent columns on the line. |
| `varies` | — | Additional fields whose meaning and count depend on `type`. See event type tables below. |

### Mission Lifecycle Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0100` | Mission Start | `* Mission Start *` | Marks the true start of gameplay. All entity stat calculations use this timestamp as t=0. |
| `0101` | Mission End | `* Mission End *` | Marks the end of gameplay. Actual game duration = this timestamp minus `start` from line type `1`. |

### Shot Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0201` | Miss | `actor	 misses` | Actor fired a shot that hit nothing. No score change. |
| `0202` | Gen Miss | `actor	 misses	target` | Actor had hit a non-player target at least once but missed before completing the 3-hit destroy sequence, resetting the hit counter on that target to zero. No score change. |
| `0203` | Target Hit | `actor	 zaps	target` | Actor hit a non-player target (`@NNN`). Targets require exactly 3 consecutive hits to destroy regardless of shooter position or shot power. No score change on hit alone. |
| `0204` | Target Destroy | `actor	 destroys	target` | Actor landed the 3rd consecutive hit, destroying the target. Awards +1001 points to actor. Always preceded by exactly two `0203` events against the same target with no intervening miss. |
| `0205` | Player Hit | `actor	 zaps	target` | Actor hit a player who was not deactivated by this hit (target has remaining hit points after applying shot power). Awards +100 to actor if target is an opponent; -100 if target is a teammate. Target always loses 20 points regardless of team. |
| `0206` | Player Deactivate | `actor	 zaps	target` | Actor's hit reduced target's hit points to 0, deactivating them. Same scoring as `0205`. Always the final hit in a sequence since the target's last respawn. |
| `0209` | Warbot Deactivate | `actor	 zaps	target` | A non-player warbot entity deactivated a player. Deducts 1 life and triggers the standard respawn cycle. Unlike `0206`, warbot deactivations are **not** counted in the target's `timesZapped` stat in line type 7. No score change. |

**Hit point and shot power by position:**

| Position | Hit Points | Shot Power |
|----------|------------|------------|
| Commander | 3 | 2 |
| Heavy Weapons | 3 | 3 |
| Scout | 1 | 1 |
| Ammo Carrier | 1 | 1 |
| Medic | 1 | 1 |

Hit points are reduced by the shooter's shot power per hit (straight subtraction). Hit points are not tracked directly in the TDF — remaining hit points must be inferred from the event stream. Shot power has no bearing on non-player targets, which always require exactly 3 standard shots regardless of shooter position.

### Missile Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0300` | Missile Lock | `actor	 locking	target` | Actor has begun locking onto a target (player or non-player). Always precedes a missile fire event. Only Commander and Heavy Weapons positions have missiles. |
| `0301` | Missile Miss vs Target | `actor	 misses	target` | Actor fired a missile that missed a non-player target. No score change. Resets the 3-hit counter on the target. |
| `0303` | Missile Destroy Target | `actor	 destroys	target` | Actor's missile destroyed a non-player target in one hit. Awards +1001 points to actor. Always a one-hit destruction regardless of current hit counter state. |
| `0304` | Missile Miss vs Player | `actor	 misses	target` | Actor fired a missile that missed a player target. No score change. |
| `0306` | Missile Hit Player | `actor	 missiles	target` | Actor's missile deactivated a player in one hit regardless of remaining hit points or position. Awards +500 to actor if target is an opponent; -500 if target is a teammate. Target loses 100 points regardless of team. |
| `0308` | Missile Hit Player (friendly) | `actor	 missiles	target` | Friendly-fire missile deactivation. Identical mechanics to `0306` but target is always a teammate. Actor receives -500; target loses 100 points. |

### Special Ability Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0400` | Rapid Fire Activate | `actor	 activates rapid fire` | Scout activates rapid fire, allowing sustained trigger hold for faster shooting. Scout only. No explicit deactivation event — rapid fire ends implicitly when an Ammo Carrier resupplies that scout's shots (`0500`). |
| `0404` | Nuke Activate | `actor	 activates nuke` | Commander begins nuke activation sequence. Commander only. A detonation (`0405`) follows unless the commander transitions to state 3 before detonation. |
| `0405` | Nuke Detonate | `actor	 detonates nuke` | Commander's nuke detonates. All opposing players lose 3 lives and are immediately deactivated (state 3). Players whose lives reach 0 or below are eliminated. Awards a fixed +500 points to the actor regardless of how many players are affected. |

**Nuke cancellation:** A nuke is cancelled with no effect if the activating commander transitions to state 3 for **any reason** before detonation — including being deactivated by an opponent, friendly fire, being resupplied by a Medic, or any other cause. There is no explicit cancellation event. A `0404` with no subsequent `0405` before the commander's next state 3 transition indicates a cancelled nuke.

### Resupply Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0500` | Ammo Resupply | `actor	 resupplies	target` | Actor resupplies a single teammate's shots up to their position maximum. Actor is normally an Ammo Carrier player, but may be a neutral beacon entity (Emergency Resupply). Also implicitly ends rapid fire for a Scout target. |
| `0502` | Lives Resupply | `actor	 resupplies	target` | Actor resupplies a single teammate's lives up to their position maximum. Actor is normally a Medic player, but may be a neutral beacon entity (Emergency Resupply). If a Medic is eliminated, their team can no longer receive Medic-sourced life resupply for the rest of the game. |
| `0510` | Team Ammo Resupply | `actor	 resupplies team` | Ammo Carrier special ability. Resupplies shots for all state 0 teammates simultaneously. State 3 teammates may or may not be affected depending on radio timing. |
| `0512` | Team Lives Resupply | `actor	 resupplies team` | Medic special ability. Resupplies lives for all state 0 teammates simultaneously. State 3 teammates may or may not be affected depending on radio timing. |

A simultaneous individual resupply by both an Ammo Carrier and a Medic targeting the same player generates both a `0500` and `0502` event at the same timestamp, granting the target both shots and lives in a single interaction.

### Referee Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0600` | Penalty | `actor	 is penalised` | A player is deactivated by a referee as a penalty. The `actor` field is the **penalized player** — there is no explicit referee identity in the event line. The player is immediately deactivated (state 3) and respawns normally after the standard respawn timer. Score adjustment equals the `penalty` value from line type `1` (typically `0`). Generates accompanying line type `5` and line type `9` entries. |

### Other Events

| Code | Name | Structure | Description |
|------|------|-----------|-------------|
| `0900` | Achievement | `actor	 completes an achievement!` | Actor completed an in-game achievement. Informational only — stored but not interpreted. No score impact. |
| `0902` | Reward | `actor	 earns a reward!` | Actor earned a site-based reward such as a free game. Informational only — stored but not interpreted. No score impact. Present in `2.005` and later. |
| `0B00` | Beacon Claim | `actor	 claims	target` | Actor landed the final (3rd) hit on a beacon-mode target, claiming it. The two warm-up hits that precede the claim do not generate section 4 events — they appear only in the section 7 stat totals (`shotsHit`, `shotsFired`) as unattributed hits, referred to as **ghost shots**. The `0B00` event itself counts as 1 shot fired and 1 hit. This event should not appear in a normal SM5 game, but can occur if arena beacons are left active from a prior game mode. |
| `0B03` | Base Award | `actor	 is awarded	target` | A non-player target is automatically awarded to a player on the winning team at the end of a game that ended early due to full opposing team elimination. Awarded for each target the player did not personally destroy during the game. Awards +1001 points to actor, consistent with a normal `0204` target destroy. Only triggered by early team elimination. |

**Notes:**
- Score changes for all events are recorded separately in accompanying line type `5` entries at the same timestamp — the event line is the human-readable log, the score line is the authoritative numeric record.
- `0205` and `0206` are analogous to `0203` and `0204` for players: `0205` is a damaging hit that does not deactivate, `0206` is the deactivating hit.
- A sequence of `0203` events against a target is reset to zero by a `0202` (gen miss) or a `0301` (missile miss against target).
- `penalties` in line type `7` sm5-stats tracks the count of `0600` events where this entity was the target.

---

## Line Type 5 — `score`

**Appears:** Many times throughout the file, always accompanying a line type `4` event at the same timestamp. Multiple line 5 entries may share a timestamp when a single event affects more than one entity's score simultaneously.

**Schema:**
```
5	time	entity	old	delta	new
```

| Field | Type | Description |
|-------|------|-------------|
| `time` | integer | Milliseconds elapsed since mission start. Always matches the timestamp of the accompanying line type `4` event that caused this score change. |
| `entity` | string | The iplId (`#xxxxxxx`) or hardware ID (`@NNN`) of the entity whose score changed. |
| `old` | integer | The entity's score immediately before this change. |
| `delta` | integer | The signed score change applied. Positive for gains, negative for losses. |
| `new` | integer | The entity's score after this change. Always equals `old + delta`. |

**Score change reference by event:**

| Event | Code | Actor delta | Target delta | Notes |
|-------|------|-------------|--------------|-------|
| Hit opposing player (survive) | `0205` | +100 | -20 | Target has remaining hit points |
| Hit friendly player (survive) | `0205` | -100 | -20 | Target has remaining hit points |
| Deactivate opposing player | `0206` | +100 | -20 | Target's hit points reach 0 |
| Deactivate friendly player | `0206` | -100 | -20 | Target's hit points reach 0 |
| Hit non-player target | `0203` | none | none | No score change on non-final hit |
| Destroy non-player target | `0204` | +1001 | none | After 3 consecutive standard shots |
| Miss (generic) | `0201` | none | none | |
| Gen miss (target hit counter reset) | `0202` | none | none | Resets 3-hit counter on target |
| Missile lock | `0300` | none | none | |
| Missile miss vs player | `0304` | none | none | |
| Missile miss vs target | `0301` | none | none | Resets 3-hit counter on target |
| Missile deactivate player (opponent) | `0306` | +500 | -100 | Always one-hit deactivation |
| Missile deactivate player (friendly) | `0306` | -500 | -100 | Always one-hit deactivation |
| Missile destroy target | `0303` | +1001 | none | Always one-hit destruction |
| Nuke detonate | `0405` | +500 | none | Fixed reward regardless of players affected |
| Referee penalty | `0600` | none | -penalty | Penalty value from line type `1`, typically 0 |
| Base award | `0B03` | +1001 | none | Awarded per unearned target on early team elimination |
| Achievement | `0900` | none | none | |
| Reward | `0902` | none | none | |

**Target hit counter rules:**
- A non-player target requires exactly 3 consecutive standard shots (`0203`) to destroy, regardless of shooter position or shot power.
- The hit counter resets to zero on a `0202` (gen miss) or `0301` (missile miss against target).
- A missile (`0303`) always destroys a target in one hit regardless of the current hit counter state.
- Shot power applies only to player vs player interactions — targets always require exactly 3 hits.

**Notes:**
- Scores can go negative — there is no floor.
- `new` always equals `old + delta` — there are no rounding or adjustment exceptions within the TDF.
- Line 5 is the complete and authoritative score record within the TDF. All score changes that occur during a game are captured here.
- Post-game penalties or bonuses applied by staff after the game are not reflected in the TDF and must be tracked separately in the database.
- The final score for an entity is the `new` value from their last line 5 entry, which should match the score recorded in their line type `6` entity-end record.

---

## Line Type 6 — `entity-end`

**Appears:** Once per entity at the end of the game, or mid-game if a player is eliminated before time expires. All entities including non-player types receive a line 6 entry.

**Schema:**
```
6	time	id	type	score
```

| Field | Type | Description |
|-------|------|-------------|
| `time` | integer | Milliseconds elapsed since mission start at which this entity's game ended. For players who survive to game end this will be at or near the `0101` Mission End timestamp. For eliminated players this will be mid-game at the point their last life was exhausted. |
| `id` | string | The iplId (`#xxxxxxx`) or hardware ID (`@NNN`) of the entity. |
| `type` | string | Exit type code. See exit type table below. |
| `score` | integer | The entity's final score at the point of exit. Should match the `new` value from the entity's last line type `5` entry. Always `0` for non-player entities. |

**Exit type codes:**

| Code | Name | Description |
|------|------|-------------|
| `02` | Mission Complete | Entity survived until mission time expired. Normal end for most players and all non-player entities. |
| `04` | Eliminated | Player ran out of lives before the mission ended, or was force-eliminated due to a game victory condition (mission kill). Their line 6 entry appears mid-game. `livesLeft` in line type 7 will be `0`. |
| `01` | Kicked | Player was removed from the mission (e.g. removed from a broken suit mid-game). May appear in archived games. `livesLeft` in line type 7 should be treated as `0`. |
| `17` | Kicked by Referee | Player was removed from the mission by a referee. May appear in archived games. `livesLeft` in line type 7 should be treated as `0`. |

**Notes:**
- A player with exit type `04` has their line 6 entry appear mid-game. No further line type `5` or `9` entries will appear for that entity after this point.
- The `score` field should always equal the `new` value of the entity's last line type `5` score entry. This can be used as a consistency check during ingestion.
- Non-player entities (`standard-target`, `beacon`, `referee`, etc.) always receive exit type `02` and a score of `0`.
- `@NNN` guest players are treated the same as registered players for exit type purposes.
- Exit codes `01` and `17` may appear in archived games. Ingestion must handle them: treat the player as eliminated and set `livesLeft = 0`.
- Exit code `04` covers both natural elimination (lives reached 0) and force-elimination from a game victory condition (mission kill where remaining team players are eliminated with lives still remaining).

---

## Line Type 7 — `sm5-stats`

**Appears:** Once per entity at the end of the game, immediately following that entity's line type `6` entry. Only present in SM5 games.

**Schema:**
```
7	id	shotsHit	shotsFired	timesZapped	timesMissiled	missileHits	nukesDetonated	nukesActivated	nukeCancels	medicHits	ownMedicHits	medicNukes	scoutRapid	lifeBoost	ammoBoost	livesLeft	shotsLeft	penalties	shot3Hit	ownNukeCancels	shotOpponent	shotTeam	missiledOpponent	missiledTeam
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | The iplId (`#xxxxxxx`) or hardware ID (`@NNN`) of the entity these stats belong to. |
| `shotsHit` | integer | Total number of shots that hit any target (player or non-player). |
| `shotsFired` | integer | Total number of shots fired including misses. |
| `timesZapped` | integer | Number of times this entity was hit by any shot (`0205` and `0206` events where this entity is the target). |
| `timesMissiled` | integer | Number of times this entity was hit by a missile. |
| `missileHits` | integer | Number of missiles fired by this entity that hit a target (player or non-player). |
| `nukesDetonated` | integer | Number of nukes successfully detonated by this entity (`0405` events). Commander only — will be 0 for all other positions. |
| `nukesActivated` | integer | Number of nukes activated by this entity (`0404` events), including those subsequently cancelled. Commander only — will be 0 for all other positions. |
| `nukeCancels` | integer | Number of opposing team nukes cancelled by this entity — i.e. times this player deactivated an enemy commander during their nuke activation sequence. Tracked for all positions. |
| `medicHits` | integer | Number of times this entity tagged the opposing team's medic. High-value strategic stat — eliminating the enemy medic shuts off the opposing team's life resupply. Tracked for all positions. |
| `ownMedicHits` | integer | Number of times this entity accidentally tagged their own medic. Shame stat — causes the friendly medic to lose a life. Tracked for all positions. |
| `medicNukes` | integer | Number of opposing medic lives lost due to this entity's nuke detonations. Credits the commander for indirect medic damage via nuke. Commander only — will be 0 for all other positions. |
| `scoutRapid` | integer | Number of times this entity activated rapid fire (`0400` events). Scout only — will be 0 for all other positions. |
| `lifeBoost` | integer | Number of times this entity used the team lives resupply special ability (`0512` events). Medic only — will be 0 for all other positions. |
| `ammoBoost` | integer | Number of times this entity used the team ammo resupply special ability (`0510` events). Ammo Carrier only — will be 0 for all other positions. |
| `livesLeft` | integer | Number of lives remaining at game end. |
| `shotsLeft` | integer | Number of shots remaining at game end. |
| `penalties` | integer | Count of referee penalties (`0600` events) assessed against this entity during the game. |
| `shot3Hit` | integer | Number of times this entity tagged an opposing Commander or Heavy Weapons player (the two 3-hit-point positions). Scout-specific prestige stat tracking high-value hits against durable targets. |
| `ownNukeCancels` | integer | Number of times this entity accidentally cancelled a friendly commander's nuke by deactivating them during the activation sequence. Shame stat. Tracked for all positions. |
| `shotOpponent` | integer | Total shots that hit an opposing team player (`0205` and `0206` events where target is an opponent). |
| `shotTeam` | integer | Total shots that hit a friendly team player (`0205` and `0206` events where target is a teammate). |
| `missiledOpponent` | integer | Total missiles that hit an opposing team player. |
| `missiledTeam` | integer | Total missiles that hit a friendly team player. |

**Notes:**
- Line 7 is a post-game summary and should be consistent with what can be derived from the line type `4` and `5` event stream. It can be used as a consistency check during ingestion.
- Several stats are position-specific by design. Non-applicable stats will always be `0` for other positions.
- `medicHits`, `ownMedicHits`, `nukeCancels`, and `ownNukeCancels` are tracked for all positions since any player can perform these actions.
- Non-player entities receive a line 7 entry with all stat fields set to `0`.

---

## Line Type 9 — `player-state`

**Appears:** Many times throughout the file, recording state transitions for player entities. Added in `2.005` — absent in `2.004` and earlier. Non-player entities do not receive line 9 entries.

**Schema:**
```
9	time	entity	state
```

| Field | Type | Description |
|-------|------|-------------|
| `time` | integer | Milliseconds elapsed since mission start at which this state transition occurred. |
| `entity` | string | The iplId (`#xxxxxxx`) or hardware ID (`@NNN`) of the player entity whose state changed. |
| `state` | integer | The new state of the entity. See state table below. |

**Player state values:**

| State | Name | Description |
|-------|------|-------------|
| `0` | Active | Player is fully active and participating in the game. Can fire, be tagged, and receive resupply. Hit points carry over from the previous state 2 window if the player was damaged but not fully deactivated during it. |
| `3` | Invulnerable | Player has just been deactivated. Cannot be tagged by anyone. Hit points are reset to the position maximum on every transition into this state, regardless of cause. Lasts exactly 4000ms before transitioning to state 2. Resupply attempts have no effect during this state. |
| `2` | Vulnerable | Player is still deactivated but can now be tagged again. Full hit point and shot power rules apply — including for Ammo Carriers and Medics whose tags are treated as standard damage (shot power 1) with no resupply effect. Damage accumulates and carries over into state 0 if the player is not fully deactivated. A player fully deactivated in this state returns to state 3 with hit points reset to full. Lasts exactly 4000ms before transitioning to state 0 if not re-deactivated. |

**Hit point behaviour across state transitions:**

| Transition | Hit Points |
|------------|------------|
| Any → state 3 | Reset to position maximum |
| State 3 → state 2 | Unchanged (full) |
| State 2 → state 0 | Carry over — damaged but non-zero hit points persist into active play |
| State 2 → state 3 (re-deactivated) | Reset to position maximum |

**Respawn cycle:**

```
Deactivating event (0206, 0306, 0405, 0600)
    → state 3 (invulnerable, 4000ms, hit points reset to full)
        → state 2 (vulnerable, 4000ms, hit points may accumulate damage)
            → state 0 (active, carrying any unresolved hit point damage forward)
```

A re-deactivation during state 2 restarts the full cycle from state 3 with hit points reset. This is called a **reset** and is a valuable suppression mechanic.

**State 2 tagging rules:**

During state 2, ALL incoming tags are treated as standard damage regardless of the tagger's position or team. The resupply mechanic is completely inactive:
- An Ammo Carrier or Medic tagging a vulnerable teammate generates a standard `0205` hit event applying 1 shot power of damage — identical to any other 1 shot power position.
- A Commander or Heavy (3 hit points) can absorb up to 2 hits during state 2 without being fully deactivated, carrying those damaged hit points into state 0.
- A Scout, Ammo Carrier, or Medic (1 hit point) is always fully deactivated by any single hit during state 2, resetting their timer.
- Players must be in state `0` to receive any resupply.

**Notes:**
- Line type 9 is absent in `2.004` and earlier. For older files, state transitions must be synthetically generated during ingestion by simulating the 4000ms + 4000ms timer from each deactivating event (`0206`, `0306`, `0405`, `0600`). This mirrors the approach used in the legacy system.
- A player eliminated via lives exhaustion (`04` exit code on line type `6`) will have their final state transition to `3` with no subsequent `2` or `0` transitions.
- The total respawn duration is always exactly 8000ms (4000ms invulnerable + 4000ms vulnerable) regardless of position or game configuration.
- Hit points only reset on transition to state 3. Partial damage sustained during state 2 that does not result in full deactivation carries over into state 0.
- Only `player` type entities receive state transitions. Non-player entities do not have state entries.
- Positions with 1 hit point (Scout, Ammo Carrier, Medic) are always fully deactivated by any single hit regardless of shot power, so the hit point carry-over mechanic only applies to Commander and Heavy Weapons.

---

## Appendix A — Event Code Quick Reference

| Code | Name | Actor | Target | Actor Δ | Target Δ |
|------|------|-------|--------|---------|----------|
| `0100` | Mission Start | — | — | — | — |
| `0101` | Mission End | — | — | — | — |
| `0201` | Miss | player | — | 0 | — |
| `0202` | Gen Miss | player | target | 0 | 0 |
| `0203` | Target Hit | player | target | 0 | 0 |
| `0204` | Target Destroy | player | target | +1001 | 0 |
| `0205` | Player Hit | player | player | ±100 | -20 |
| `0206` | Player Deactivate | player | player | ±100 | -20 |
| `0209` | Warbot Deactivate | warbot | player | 0 | 0 |
| `0300` | Missile Lock | player | any | 0 | 0 |
| `0301` | Missile Miss vs Target | player | target | 0 | 0 |
| `0303` | Missile Destroy Target | player | target | +1001 | 0 |
| `0304` | Missile Miss vs Player | player | player | 0 | 0 |
| `0306` | Missile Hit Player | player | player | ±500 | -100 |
| `0308` | Missile Hit Player (friendly) | player | player | -500 | -100 |
| `0400` | Rapid Fire Activate | scout | — | 0 | — |
| `0404` | Nuke Activate | commander | — | 0 | — |
| `0405` | Nuke Detonate | commander | — | +500 | 0 |
| `0500` | Ammo Resupply | ammo | player | 0 | 0 |
| `0502` | Lives Resupply | medic | player | 0 | 0 |
| `0510` | Team Ammo Resupply | ammo | team | 0 | 0 |
| `0512` | Team Lives Resupply | medic | team | 0 | 0 |
| `0600` | Penalty | player (penalized) | — | -penalty | — |
| `0900` | Achievement | player | — | 0 | — |
| `0902` | Reward | player | — | 0 | — |
| `0B00` | Beacon Claim | player | target | 0 | 0 |
| `0B03` | Base Award | player | target | +1001 | 0 |

*For `0205`/`0206` and `0306`: actor delta is +value vs opponent, -value vs teammate.*

---

## Appendix B — Position Quick Reference

| Position | Category | HP | Shot Power | Missiles | Special Ability |
|----------|----------|----|------------|----------|-----------------|
| Commander | 1 | 3 | 2 | 5 | Nuke (`0404`/`0405`) |
| Heavy Weapons | 2 | 3 | 3 | 5 | — |
| Scout | 3 | 1 | 1 | 0 | Rapid Fire (`0400`) |
| Ammo Carrier | 4 | 1 | 1 | 0 | Team Ammo Resupply (`0510`) |
| Medic | 5 | 1 | 1 | 0 | Team Lives Resupply (`0512`) |

---

## Appendix C — Entity ID Format Reference

| Format | Example | Meaning |
|--------|---------|---------|
| `#xxxxxxx` | `#Gw2gH6` | iplId — globally unique Laserforce member identifier. Used as primary cross-site player identity. Profile URL: `https://www.iplaylaserforce.com/mission-stats/?t={id_without_hash}` |
| `@NNN` | `@80` | Hardware ID — physical battlesuit or target unit at a specific center. Unique within a center, not globally. Used for guest players and all non-player entities. |

---

## Appendix D — Version-Gated Features

| Feature | Line Type | Introduced | Default When Absent | Notes |
|---------|-----------|------------|---------------------|-------|
| `duration` | `1` | `2.001` | `900000` (15 min) | Absent in `2.000` |
| `penalty` | `1` | `2.003` | `0` | Absent in `2.000` and `2.001` |
| `battlesuit` | `3` | `2.003` | `null` | Absent in `2.000` and `2.001` |
| `colour-rgb` | `2` | `2.004` | Derive from `colour-enum` lookup | Absent in `2.003` and earlier |
| Player state log | `9` | `2.005` | Reconstruct synthetically | Absent in `2.004` and earlier; use 4000ms + 4000ms timers from deactivating events |
| `0902` reward event | `4` | `2.005` | N/A — event simply won't appear | Absent in `2.004` and earlier |
| `memberId` | `3` | `2.006` (partial) | `null` | Rolled out incrementally — presence determined by schema comment line, not `file-version` |