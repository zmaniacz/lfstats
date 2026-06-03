# Chomper Design

**Tool:** Chomper  
**Location:** `apps/chomper`  
**Purpose:** TDF file ingestion — parses SM5 game files from S3, simulates the game state machine to compute derived stats, writes all data to the database, and archives the file.

---

## Overview

Chomper has two execution modes:

- **Lambda handler** (`src/index.ts`) — triggered by S3 upload events; processes one file per invocation
- **Bulk ingest CLI** (`src/bulk-ingest.ts`) — manually invoked tool for re-processing files from the archive bucket

Both share the same core pipeline: parse → simulate → consistency check → ingest. The local dev CLI (`src/cli.ts`) runs parse + simulate without touching the database and writes a `.debug.json` file for inspection.

---

## Repository Structure

```
apps/chomper/
  src/
    index.ts          ← Lambda entry point
    bulk-ingest.ts    ← Bulk re-ingest CLI tool
    cli.ts            ← Local dev CLI (parse + simulate + debug output, no DB)
    parser.ts         ← Phase 1: TDF file parsing
    simulator.ts      ← Phase 2: state machine simulation and stat computation
    ingester.ts       ← Phase 3: database writes
    mvp.ts            ← MVP score calculation
    s3.ts             ← S3 fetch, archive, delete helpers
    types.ts          ← Shared TypeScript interfaces and types

packages/db/
  schema.ts           ← Drizzle schema (includes ChomperJob table)
  queries/
    chomper.ts        ← All Chomper query functions
```

All database query functions used by Chomper live in `packages/db/queries/chomper.ts` as named exports. No inline SQL or Drizzle calls inside `apps/chomper`.

---

## Lambda Flow (`index.ts`)

The Lambda handler receives an S3 event, extracts bucket name and key, and runs this pipeline:

```
1.  Write ChomperJob (status: processing) — idempotent on lambdaRequestId
2.  Fetch TDF file from S3
3.  Parse TDF (Phase 1)
        → RejectionError: mark "rejected", move to error bucket, exit
        → ParseError:     mark "failed",   move to error bucket, exit
4.  Validate mission type == 5
        → if not: mark "skipped", delete from incoming bucket, exit
5.  Validate player entities present
        → if none: mark "skipped", delete from incoming bucket, exit
6.  Check for duplicate game
        → if found: mark "skipped", delete from incoming bucket, exit
7.  Simulate (Phase 2)
        → if throws: mark "failed", move to error bucket, exit
8.  Run consistency check
        → if discrepancies: mark "failed", move to error bucket, exit
9.  Find active MVP model
10. Calculate MVP scores
11. Write all rows to database in a single transaction (Phase 3)
        — retries on Postgres deadlock (code 40P01), up to 3 attempts
12. Update ChomperJob (status: completed, gameId)
13. Move TDF to archive bucket with normalized key
```

Any unhandled error caught by the outer try/catch marks the job `failed` with the error message and moves the file to the error bucket.

Re-invocation with the same Lambda request ID is idempotent: the handler checks `findChomperJobByLambdaRequestId` on startup and skips if already completed.

---

## ChomperJob Status Lifecycle

| Status | Meaning |
|---|---|
| `processing` | Pipeline in progress |
| `completed` | Successfully ingested into the database |
| `skipped` | Not ingested — non-SM5 game, duplicate, no players; file deleted |
| `rejected` | Structurally invalid game (e.g. player registered on multiple teams); file moved to error bucket |
| `failed` | Parse, simulation, or ingest error; file moved to error bucket |

---

## Environment Variables

### Lambda (`index.ts`)

| Variable | Description |
|---|---|
| `INCOMING_BUCKET` | S3 bucket where new TDF files arrive |
| `ARCHIVE_BUCKET` | S3 bucket for successfully processed files |
| `ERROR_BUCKET` | S3 bucket for failed or rejected files |

All three are required — Lambda throws immediately on startup if any is absent.

### Bulk Ingest CLI (`bulk-ingest.ts`)

| Variable | Description |
|---|---|
| `ARCHIVE_BUCKET` | Source bucket (where legacy files live) |
| `MODERN_ARCHIVE_BUCKET` | Destination bucket for successfully processed files |
| `ERROR_BUCKET` | Destination for failed or rejected files |

---

## Bulk Ingest CLI

`src/bulk-ingest.ts` processes multiple files from the archive bucket. Useful for re-ingesting historical data or recovering from errors after a fix.

```bash
pnpm bulk-ingest "1-1-"        # prefix match
pnpm bulk-ingest "*2026*"      # wildcard match
pnpm bulk-ingest "1-1-2026*"   # combined
```

- Lists matching files from `ARCHIVE_BUCKET` using the literal prefix before any wildcard
- Applies the full glob pattern client-side as a filter
- Runs with concurrency=10
- On success: moves file from `ARCHIVE_BUCKET` to `MODERN_ARCHIVE_BUCKET` with normalized key
- On failure/rejection: moves file from `ARCHIVE_BUCKET` to `ERROR_BUCKET` (preserving original key)
- Writes a timestamped JSON results file to the working directory on completion

---

## Drizzle Patterns

All queries in `packages/db/queries/chomper.ts` use these patterns:

### Upsert
```typescript
await db.insert(center)
  .values(row)
  .onConflictDoUpdate({
    target: [center.countryCode, center.siteCode],
    set: { name: sql`excluded.name` }
  })
```

### Bulk insert
```typescript
await db.insert(gamePlayerState).values(arrayOfRows)
```
Always use the array form — never loop individual inserts for high-volume tables.

### Transaction
```typescript
await db.transaction(async (tx) => {
  await tx.insert(game).values(...)
  await tx.insert(gameTeam).values(...)
  // etc.
})
```

---

## TypeScript Conventions

- All shared interfaces and types live in `src/types.ts`
- Strict mode (`"strict": true`)
- Use `typeof table.$inferInsert` / `typeof table.$inferSelect` rather than manually defined types
- Prefer `unknown` over `any` — narrow explicitly when parsing TDF fields from raw strings
- Use discriminated unions for status fields rather than plain strings

---

## Phase 1 — Parsing (`parser.ts`)

Reads a UTF-16 LE file (with BOM), splits on `\r\n`, and produces a single `ParsedTdf` object.

### Schema Comment Column Detection

Lines beginning with `;` are schema comment lines. The parser tracks the most recently seen schema comment for each line type and uses it as the authoritative column list. **Never rely solely on `file-version` to determine which columns are present.**

### ParsedTdf Structure

```typescript
interface ParsedTdf {
  meta: {
    fileVersion: number
    centre: string           // e.g. "3-3"
    countryCode: number      // parsed from centre
    siteCode: number         // parsed from centre
    startTime: string        // YYYYMMDDHHmmss from line type 1
    duration: number         // ms, default 900000 if absent
    penalty: number          // default 0 if absent
    missionType: number      // skip if not 5
    missionDesc: string
  }
  teams: ParsedTeam[]
  entities: ParsedEntity[]   // internalId may differ from originalId for multi-gen players
  events: ParsedEvent[]
  scores: ParsedScore[]
  entityEnds: ParsedEntityEnd[]
  sm5Stats: ParsedSm5Stats[] // duplicate entries merged by mergeDuplicateSm5Stats
  playerStateLog: ParsedPlayerState[]  // empty array for pre-2.005 files (type 9 lines discarded if fileVersion < 2.005)
  entityRouting: EntityRouting[]       // routing table for multi-generation players
}
```

### Version-Gated Field Defaults

| Field | Absent default |
|---|---|
| `duration` (line type 1) | `900000` |
| `penalty` (line type 1) | `0` |
| `battlesuit` (line type 3) | `null` |
| `memberId` (line type 3) | `null` |
| `colourRgb` (line type 2) | `null` |
| Line type 9 entirely | Empty array — simulator uses synthetic 4-second state reconstruction. Type 9 lines present in pre-2.005 files (early test artefacts) are discarded by the parser. |

### Entity Type Classification

| type value | Classification |
|---|---|
| `player` | Player entity — full stat tracking |
| `referee` | Referee — stored, no stats |
| `standard-target`, `beacon`, `generator-target` | Target — all treated identically |
| Anything else | Non-player — stored for completeness, interactions not interpreted |

### Entity Routing (Multi-Generation Players)

The parser detects scenarios where the same entity ID has multiple registrations or scorecards and creates separate "generations" so each can be simulated independently.

**Case 1: Mid-game position change** — same entity ID registered twice with different `category` values. Each additional registration becomes a new generation: gen0 uses the original ID, gen1 uses `{originalId}_gen1`. This models a player who literally changed their position mid-game via the Laserforce console.

**Case 2: Same-position hardware restart** — same entity ID, same category, but a mid-game `exitType=01`/`17` entity-end followed by a second section 7 scorecard. The hardware reset the player's suit mid-game, resetting their shot and lives counters. A synthetic entity is created for the second period (starting at the restart entity-end time) so the simulator initializes it from scratch.

**Case 3 (fatal): Player registered on multiple teams** — a player re-registering with a different `team` index is a hardware error that cannot be modeled. The parser throws a `RejectionError`, which routes the job to `status: "rejected"` and moves the file to the error bucket.

**Case 4 (fatal): Incomplete TDF** — if the file contains player entities but no section 7 scorecard lines, the game ended prematurely (e.g. server crash, aborted mission) and cannot be ingested. The parser throws a `RejectionError("Incomplete TDF - missing scorecard data")`.

**Hardware glitch (not multi-generation):** If a player ID has duplicate section 7 scorecards but no restart entity-end and no position change, it is treated as a double-printed scorecard. Duplicate entries are merged by `mergeDuplicateSm5Stats`: accumulated counters are summed; residuals (`livesLeft`, `shotsLeft`) use the last entry's values.

The entity routing table maps each external ID to an ordered list of `{ internalId, startTime }` generations. The simulator's `resolveGenerationIds()` rewrites actor/target/entity fields in events, scores, state log, and entity-ends to use internal generation IDs before the main loop — all downstream code sees the correct IDs without per-call routing logic.

---

## Phase 2 — Simulation (`simulator.ts`)

Takes the `ParsedTdf` from Phase 1 and produces a `SimulatedGame` with all derived stats computed. This is the most complex phase.

### Architecture

The simulator is a class (`Simulator`) with:
- A `Map<string, PlayerSimState>` keyed by internal entity ID for all player entities
- A sorted event queue from `parsed.events`
- Several pre-built lookup tables built before the main event loop
- An `advanceClock(T)` function that applies all pending state transitions before time T
- Per-event handler functions

### Pre-Built Lookup Tables

Built in a single O(N) pass before the main event loop:

| Map | Key | Value | Purpose |
|---|---|---|---|
| `lastActorEventTime` | entityId | Last timestamp this entity appears as actor | Actor-lookahead for premature elimination detection |
| `entityEndTimeById` | entityId | Line-type-6 timestamp | Forward simulation ceiling |
| `tdfFinalLives` | entityId | `sm5Stats.livesLeft` | Forward simulation target |
| `deactivationsReceived` | entityId | Sorted `{time, lives}[]` | Forward simulation deactivations |
| `resuppliesGained` | entityId | Sorted `{time, lives}[]` | Direct lives resupplies received (0502 events) |
| `directTeamBoostsReceived` | entityId | Sorted `{time, lives}[]` | Team lives boosts (0512) received while in state_0 (excludes boosts that fall within the respawn uncertainty window — see 0512 handler) |

`deactivationsReceived` life costs: `0206`/`0209` = 1 life; `0306`/`0308` = 2 lives; nuke hits = 3 lives.

**Two-pass nuke detection for `deactivationsReceived`:**
- *Pass 1:* Any state_3 entry in the state log within 100ms of a `0405` event (player transitioned to state_3 at nuke time)
- *Pass 2:* Players already in state_3 strictly before the nuke (no new state_3 entry appears in the log because they were already down — but nukes hit all non-eliminated opponents regardless of current state)

### `directTeamBoostsReceived` Pre-Build

For 2.005+ files, this map is built by walking the type-9 state log to determine each player's exact state at each 0512 event time. For pre-2.005 files (empty state log), the synthetic 4+4-second state machine (`syntheticStateAt`) is run instead — replaying each player's deactivation history to determine their synthetic state at each 0512 time.

A player whose synthetic state_0 started within the last 2000ms is excluded from `directTeamBoostsReceived` (treated as pending, not direct) because the real state_0 start time can be off from the synthetic value by up to ~1 second. Including those boosts as "direct" in the forward simulation would cause `checkElimination` to under-compute `livesNeeded`. The 2000ms threshold matches the wider respawn uncertainty window used in `handle0512` for pre-2.005 files (see 0512 handler).

### 0512 Respawn Uncertainty Window

The 0512 handler applies a direct boost to state_0 teammates unless the player just became active (the **respawn uncertainty window**). Within this window, the boost is deferred to pending and `reconcilePendingBoosts` decides whether to apply it based on the TDF final lives gap.

The window width differs by file version because timing precision differs:

| File version | Window | Rationale |
|---|---|---|
| 2.005+ | 250 ms | State log is authoritative; radio lag is the only uncertainty source |
| Pre-2.005 | 2000 ms | Synthetic 4+4-second transitions are approximations; real state_0 start can be off by ~1 second |

### Two-Pass Shots Reference (`buildShotsReference`)

A pre-pass that builds `shotsRefAtBoost` — an authoritative shots count per player at each 0510 event where they are in state_3 or state_2. Used during the main loop when computing pending boost amounts for state-3 players, replacing the simulator's potentially diverged shots count with the hardware-correct value.

**Why this is needed:** When a 0510 fires while a player is in state_3, the simulator records a pending boost based on current shots, then applies it later at reconciliation. If a second 0510 fires before the first pending boost is applied, the simulator computes the second boost amount from an already-diverged shots count — under-recording it. The pre-pass walks the same state-log and event data as the main loop to compute the correct shots at each boost point. Skipped for pre-2.005 files (empty state log) since those use synthetic transitions and don't exhibit this failure mode.

### Simulation Loop

```
buildGenerationRouting() + resolveGenerationIds()  ← rewrite all IDs to internal
buildEntityMaps() + initPlayerStates() + initInteractionMap()
Sort entityEnds by time
Build all pre-built lookup tables
buildShotsReference()

for each event in parsed.events (file order):
  advanceClock(event.time)       ← consume entity-ends and state transitions up to T
  push event to output
  handleEvent(event)

detectAndFixStatSwaps()
reconcilePendingBoosts()
applyEntityEnds()                ← safety net for trailing entity-ends
buildResult()
```

### State Machine and `advanceClock(T)`

Before each event at time T, consume all pending transitions:

**For 2.005+ files** (`playerStateLog` non-empty):
Consume line type 9 entries with `time <= T` in file order, applying the explicit state transition to the named player. Entity-ends with `time <= T` are also consumed here.

**For pre-2.005 files** (empty `playerStateLog`):
For any player with a pending synthetic transition scheduled at `<= T`, fire it in time order:
- Player in state 3: synthetic state 2 at `stateEnteredAt + 4000`
- Player in state 2: synthetic state 0 at `stateEnteredAt + 4000`

For 2.005+ files, `triggerStateTransition()` is a no-op — all transitions come from the state log. This means transitions can fire slightly after the event that caused them (e.g. a 0502 resupply at T may not move the player to state_3 until the state-log entry at T+Δ is consumed on the next `advanceClock` call).

**Applying a state transition:**

```
→ state 3:
  - Set state = 3, stateEnteredAt = timestamp
  - Reset hitPoints to position maximum
  - If isNuking: clear isNuking (nuke cancelled)
  - Set deactivationCause (resupply vs other)
  - Reset receivedAmmoResupplyThisCycle = false
  - Reset receivedLivesResupplyThisCycle = false
  - Clear this player's assist window entry
  - Record snapshot

→ state 2:
  - Set state = 2, stateEnteredAt = timestamp
  - hitPoints unchanged (entered state 3 at full, may have taken damage during state 2)
  - Record snapshot

→ state 0:
  - Accumulate downtime: deactivationCause = 'resupply' → resupplyDowntime; else → otherDowntime
  - Set state = 0, stateEnteredAt = timestamp
  - hitPoints carry over (may be damaged from state 2 hits)
  - Record snapshot
```

### Entity-End In-Loop Processing

Entity-ends are sorted by time and consumed inside `advanceClock(T)` before each type-4 event. This ensures a player eliminated at time T is already marked `isEliminated` before any event at T+ε runs. Both `getActiveTeammates()` and the deactivation guard see the correct state.

A post-loop `applyEntityEnds()` still runs as a safety net for files where the last entity-end timestamp falls after the last type-4 event.

### Event Handlers

| Event | Key behavior |
|---|---|
| `0100` Mission Start | Initialize `PlayerSimState` for all players; record initial snapshots; set `missionStartTime` |
| `0101` Mission End | Record `missionEndTime`; close any open rapid fire windows; accumulate final uptime |
| `0205` Player Hit | Apply shot power to target HP; update hit stats; if target in state 2 → re-deactivate; add to assist window if target is Commander or Heavy |
| `0206` Player Deactivate | All 0205 logic + decrement `target.lives` by 1 + check elimination + clear assist window + award assists to assist window occupants |
| `0306` Missile Hit Player (opponent) | Decrement `target.lives` by 2; one-hit deactivation regardless of HP; handle nuke cancel; earn SP if Commander missile; deduct missile |
| `0308` Missile Hit Player (friendly) | Same handler as 0306; friendly-fire missile deactivation; routes correctly via isOpponent/isFriendly flag |
| `0404` Nuke Activate | Set `isNuking = true`; increment `nukesActivated`; deduct 20 SP |
| `0405` Nuke Detonate | For each non-eliminated opposing player: −3 lives, force state_3; award +500 to actor |
| `0400` Rapid Fire Activate | Set `isRapidFire = true`; record start time; increment `rapidFire`; deduct 10 SP |
| `0500` Ammo Resupply | Restore target shots to max; end rapid fire if active; transition target to state_3 (resupply cause) |
| `0502` Lives Resupply | Restore target lives to max; transition target to state_3 (resupply cause) |
| `0510` Team Ammo Boost | Restore shots for all state_0 teammates; state_3/state_2 teammates receive a pending boost recorded for reconciliation |
| `0512` Team Lives Boost | Restore lives for all state_0 teammates (unless within the respawn uncertainty window — see below); state_3/state_2 teammates receive a pending boost |
| `0600` Referee Penalty | Increment `penalties`; transition target to state_3 |
| `0204` Target Destroy | Increment `targetsDestroyed`; earn +5 SP |
| `0303` Missile Destroy Target | Increment `targetsDestroyed`; earn +5 SP; deduct missile |
| `0209` Warbot Deactivate | Decrement `target.lives` by 1; trigger state_3 (deactivationCause = 'other'); handle nuke cancel. Does **not** increment `timesHit` — warbot deactivations are excluded from the TDF's `timesZapped` stat. No actor playerState (actor is a non-player warbot). |
| `0B00` Beacon Claim | Increment `actor.shotsFired` and `actor.shotsHit` by 1; decrement shots by 1 (except Ammo Carrier). The two warm-up hits before the claim have no section 4 events — they are ghost shots (see below). |
| `0B03` Base Award | Increment `targetsDestroyed` (no SP — post-elimination award, not an in-game action) |
| `0201`, `0202`, `0203`, `0300`, `0301`, `0304`, `0900`, `0902` | No state changes; skip |

**Missiles that consume a missile:** `0301` (gen miss), `0303` (destroy target), `0304` (miss vs player), `0306`/`0308` (hit player). `0300` (missile lock) does not consume a missile.

**medicHits formula:** The TDF's `medicHits` field counts **lives removed** from opponent medics, not event count. A missile removes 2 lives (counts as 2), but if the medic has only 1 life the missile removes 1 (counts as 1). The consistency check formula is:

```
shotsHitOpponentMedic + missilesHitOpponentMedicLives = medicHits
```

where `missilesHitOpponentMedicLives` accumulates `Math.min(2, Math.max(0, target.lives))` at the moment of each missile hit — before the `target.lives -= 2` decrement.

### Elimination Handling

When a player's lives reach 0 or below after any hit, `checkElimination()` runs:

1. Check `lastActorEventTime.get(entityId) > currentTime`. If the player still appears as an actor later in the event stream, the hardware kept them alive — the game computer sends the line-type-6 entity-end record seconds after the hardware actually processes elimination.

2. If still acting later: look for pending lives boosts in `pendingBoosts`. Apply the minimum needed (via forward simulation — see below). If no pending boost is available but the player still acts, eliminate anyway (shots shortfall case — the hardware kept them alive on 0 lives, which the simulator cannot fully replicate without a boost source).

3. If not acting later: mark `isEliminated = true`, `eliminatedAt = currentTime`.

**Forward simulation for lives needed:** When applying a pending lives boost, compute the minimum lives to grant:

```
livesNeeded = max(
  1 - minPrefixBalance,       // enough that the running balance never goes below 0
  tdfFinalLives - finalBalance // enough to match the TDF's residual livesLeft
)
livesNeeded = max(0, livesNeeded)
// Edge case: if livesNeeded = 0 but future events still exist, force to 1
// so the player survives long enough to receive the next resupply
```

The forward simulation merges `deactivationsReceived`, `resuppliesGained`, and `directTeamBoostsReceived` from the current timestamp to `entityEndTimeById[entityId]`.

**Eliminated player deactivation guard:** After `isEliminated` is set, the deactivation block in `handlePlayerHit` is gated on `!target.isEliminated`. The hardware continues recording hits after elimination; the simulator accumulates hit-count stats but does not process them as further deactivations or state transitions.

**Entity-end is the authoritative signal:** The entity-end record is the final word on elimination. If `applyEntityEnds()` finds a player with `exitType=04` and `lives > 0`, it records `entityEndForcedLives` (for the consistency check to report) and zeros the lives.

### Post-Simulation: `detectAndFixStatSwaps`

When a player has a hardware restart mid-game, the TDF sometimes writes entity-ends and section-7 scorecards in the wrong generation order (the newer vest gets kicked before the older vest's end record is written). `resolveGenerationIds()` assigns each generation the wrong TDF stats — producing perfectly mirrored discrepancies.

`detectAndFixStatSwaps()` compares the simulator's computed `shotsFired` and `shotsHit` for each generation pair against both TDF stat assignments. If swapping assignments produces a strictly smaller total discrepancy, it swaps the `sm5Stats` IDs and entity-end IDs so all downstream steps use the correct mapping.

### Post-Simulation: `reconcilePendingBoosts`

Applies remaining pending boosts accumulated from team boosts that fired while a player was in state_3 or state_2:

- **Lives:** applied earliest-first; patches only the final snapshot (mid-game replay accuracy is handled by the actor-lookahead during simulation)
- **Shots:** applied latest-first (most recent pending boost is most likely to have applied closest to a state transition); retroactively propagated through all state snapshots from the boost's event index

### Post-Simulation: `applyEntityEnds`

Safety net for entity-ends not yet processed in-loop, plus special handling for kicked players:

| Exit type | Behavior |
|---|---|
| `04` (eliminated) | If `lives > 0`: record `entityEndForcedLives`, zero lives |
| `01` (kicked) | Set `lives = tdfFinalLives.get(id)` (TDF records their lives at kick time, which may be positive); mark eliminated |
| `17` (kicked by referee) | Same as `01` |
| `02` (mission complete) | No action needed |

Kicked players are treated differently because TDF records their lives at the moment of kick, not at elimination. Zeroing lives as if they were eliminated produces spurious consistency check failures.

---

## Consistency Checks

`runConsistencyCheck()` compares simulator-computed values against TDF `sm5Stats` (line type 7). All fields are checked; any discrepancy causes a consistency check failure, which routes the game to the error bucket.

| sm5Stats field | Computed equivalent |
|---|---|
| `shotsHit` | `shots_hit` |
| `shotsFired` | `shots_fired` |
| `timesZapped` | `times_hit` |
| `timesMissiled` | `times_hit_by_missile` |
| `missileHits` | `missile_hits` |
| `nukesDetonated` | `nukes_detonated` |
| `nukesActivated` | `nukes_activated` |
| `nukeCancels` | `nukes_canceled` |
| `medicHits` | `shots_hit_opponent_medic` (lives formula — see above) |
| `ownMedicHits` | `shots_hit_team_medic` |
| `medicNukes` | `nukes_hit_medic` |
| `scoutRapid` | `rapid_fire` |
| `lifeBoost` | `life_boost` |
| `ammoBoost` | `ammo_boost` |
| `livesLeft` | `lives_left` |
| `shotsLeft` | `shots_left` |
| `penalties` | `penalties` |
| `shot3Hit` | `shots_hit_opponent_3hit` |
| `ownNukeCancels` | `team_nukes_canceled` |
| `shotOpponent` | `shots_hit_opponent` |
| `shotTeam` | `shots_hit_team` |
| `missiledOpponent` | `missiles_hit_opponent` |
| `missiledTeam` | `missiles_hit_team` |

Additional checks:
- `Scorecard.score` must equal `entityEnds[id].score`
- `Scorecard.targets_destroyed` must equal the count of `GameTargetDestruction` rows for this scorecard
- `phantomDeactivations > 0` — HP reached 0 on a `0205` (non-deactivating) event; signals HP drift from hardware
- `entityEndForcedLives > 0` — `applyEntityEnds()` found the player alive when hardware said eliminated

**Ghost shot detection:** `0B00` (Beacon Claim) events occur when SM5 targets are left active from a prior game mode. The claim shot itself has a section 4 event and is handled normally. But the two warm-up hits that precede it do not generate section 4 events — they appear only in section 7 stat totals as 2 extra `shotsHit` and `shotsFired` that the simulator cannot account for.

The consistency check detects this pattern: if `stats.shotsFired - ps.shotsFired > 0` and the same delta applies to `shotsHit`, but `shotsHitOpponent` and `shotsHitTeam` match exactly, all the extra shots are unattributed target hits (ghost shots). These are logged in `ghostShots` (informational) and the `shotsHit`/`shotsFired` checks are suppressed for that player — the game still passes consistency.

---

## Supporting Mechanics

### SP Rules

- Heavy Weapons: SP is always 0, never increments; stored as null in Scorecard
- All other positions: cap at 99 on every increment: `sp = Math.min(99, sp + earned)`
- SP earning: +1 per `0205`/`0206` opponent hit; +2 per `0306` missile opponent hit; +5 per `0204`/`0303` target destroy
- SP spending at activation: `0400` (Scout rapid fire) −10; `0404` (Commander nuke) −20; `0510` (Ammo team boost) −15; `0512` (Medic team boost) −10
- `spEarned` tracks actual accrued SP (capped), not the theoretical uncapped total

### Rapid Fire Windows

Rapid fire begins on `0400` and ends on the next `0500` targeting this Scout. All `0205`, `0206`, and `0201` events from this actor while `isRapidFire = true` contribute to `shotsFiredDuringRapid`. Hit events increment the corresponding `DuringRapid` stat columns.

### Double Resupply Detection

Track `receivedAmmoResupplyThisCycle` and `receivedLivesResupplyThisCycle` per player. Both reset when the player transitions to state 3. When either flag is set, check if the other is already true — if so, increment `doubleResuppliesGiven` on both the Ammo Carrier and the Medic. Use `lastAmmoResuppliedBy` and `lastLivesResuppliedBy` on the target to identify the other resupplier.

### Uptime and Downtime

- Uptime is accumulated at game end (or player elimination): sum `(endTime - stateEnteredAt)` for all periods in state 0
- On each transition to state 0: `duration = currentTimestamp - stateEnteredAt(state 3)`; route to `resupplyDowntime` if cause was resupply, else `otherDowntime`
- Invariant: `uptime + resupplyDowntime + otherDowntime = player.endTime - missionStartTime`

### Score

Do not compute score from events. Read the authoritative final score from line type 6 `score` field. Use line type 5 entries only for `GamePlayerState.score` snapshots during replay — read the `new` field from the matching line 5 entry at each event's timestamp.

### Game Outcome

```
if any team is eliminated → outcome = 'elimination'
else if all competing teams have equal score → outcome = 'draw'
else → outcome = 'score'

GameTeam.result: 'win' | 'loss' | 'draw' (null for Neutral team)
GameTeam.elimination_bonus: 10000 if won by elimination; 0 otherwise (null for Neutral team)
```

An eliminated team always loses regardless of score.

---

## Phase 3 — Insertion (`ingester.ts`)

Writes to the database in a single transaction. Insert in this exact order to satisfy FK dependencies:

```
1.  upsertCenter
2.  upsertPlayer (one per player entity with iplId)
3.  insertGame
4.  insertGameTeams (bulk)
5.  upsertBattlesuit (one per distinct battlesuit name)
6.  upsertTarget (one per target entity)
7.  insertGameTargets (bulk)
8.  insertGameReferees (bulk)
9.  insertScorecards (bulk)
10. insertGamePlayerInteractions (bulk)
11. insertGameTargetDestructions (bulk)
12. insertGamePenalties (bulk)
13. insertGameEvents (bulk)
14. insertGamePlayerStates (bulk) — largest table
15. insertScorecardMvps (bulk)
16. upsertPlayerCallsignHistory (one per player)
```

After the transaction commits:
```
17. updateChomperJob (status: completed, gameId)
18. Move TDF file to archive bucket with normalized key
```

---

## MVP Calculation (`mvp.ts`)

Query the active `MvpModel` (where `retiredAt` is null) before the transaction. Calculate MVP points for each player using the formula in `MvpModel.parameters`. Store results as `ScorecardMvp` rows and set `Scorecard.mvp_points` and `Scorecard.mvp_model_id`.

Key notes:
- Accuracy input is `ceil(accuracy × 100)` — ceiling to nearest whole percent
- `elimination_bonus` component: applies only if this player's team won by elimination; input is seconds of game time remaining above the 3-minute threshold at elimination
- `score_bonus` threshold and multiplier are position-specific
- `eliminated` component does not apply to Medic
- All components stored for every player — zero-value rows included

---

## Reference Documents

- `TDF_Spec.md` — complete TDF format, all line types, all event codes, version-gated features
- `Scorecard_Table_Spec.md` — full definition of every Scorecard column including derivation logic
- `Core_Schema.md` — complete database schema, all tables, MVP formula, GamePlayerState structure
