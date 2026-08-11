# Chomper Design

**Tool:** Chomper  
**Location:** `apps/chomper`  
**Purpose:** TDF file ingestion — parses game files from S3, simulates the game state machine to compute derived stats, writes all data to the database, and archives the file.

---

## Overview

Chomper ingests **two game modes** from the same package: SM5 (mission type 5) and Laserball (mission type 28). Every entry point dispatches on mission type. This document covers the shared infrastructure, the SM5 pipeline in full, the [Laserball pipeline](#laserball-pipeline-mission-type-28), and the [test suite](#test-suite).

The primary execution modes:

- **Lambda handler** (`src/index.ts`) — triggered by S3 upload events; processes one file per invocation
- **Bulk ingest CLI** (`src/bulk-ingest.ts`) — manually invoked tool for re-processing files from the archive bucket

Both share the same core pipeline: parse → simulate → validate → ingest. Validation differs by mode — SM5 runs a stat-by-stat consistency check against line type 7, Laserball asserts a goals↔score invariant because it has no line type 7.

The local dev CLI (`src/cli.ts`) runs parse + simulate without touching the database and writes a `.debug.json` file for inspection. See the [Repository Structure](#repository-structure) table below for the full set of CLI entry points.

---

## Repository Structure

```
apps/chomper/
  src/
    index.ts              ← Lambda entry point; routes on mission type
    parser.ts             ← Phase 1: TDF file parsing (shared by both modes)
    simulator.ts          ← Phase 2 (SM5): state machine simulation and stat computation
    ingester.ts           ← Phase 3 (SM5): database writes
    reingester.ts         ← Phase 3 (SM5) variant: rewrites an existing game in place
    mvp.ts                ← MVP score calculation
    s3.ts                 ← S3 fetch, archive, delete helpers
    webhook.ts            ← New-game webhook POST (fired after a successful ingest)
    types.ts              ← Shared TypeScript interfaces and types
    laserball/            ← Laserball (mission type 28) pipeline
      types.ts            ← Constants + interfaces
      simulator.ts        ← Phase 2 (LB)
      ingester.ts         ← Phase 3 (LB)

    # CLI entry points (each has a package.json script)
    cli.ts                ← `ingest`            — one file, parse + simulate, no DB
    test-suite.ts         ← `test`              — whole demo_files corpus, no DB
    bulk-ingest.ts        ← `bulk-ingest`       — ingest from S3 (both modes)
    bulk-reingest.ts      ← `bulk-reingest`     — re-ingest stored SM5 games
    bulk-reingest-lb.ts   ← `bulk-reingest-lb`  — re-ingest stored Laserball games
    ingest-local-lb.ts    ← `ingest-lb-local`   — local dir → DB, Laserball only
    recalc-mvp.ts         ← `recalcMVP`         — recompute MVP from stored scorecards

packages/db/src/
  schema.ts               ← Drizzle schema (includes the ChomperJob table)
  queries/
    chomper.ts            ← Shared + SM5 query functions
    laserball.ts          ← lb_ insert helpers
```

All database query functions used by Chomper live in `packages/db/src/queries/` as named exports — `chomper.ts` for the shared identity upserts and SM5 writes, `laserball.ts` for the `lb_` tables. No inline SQL or Drizzle calls inside `apps/chomper`.

> `recalc-mvp.ts` is the one tool that does **not** re-simulate. It reconstructs MVP inputs from the stored `sm5_scorecard` columns, so it can only be used for MVP-model changes — never to fix a stat that simulation got wrong.

---

## Lambda Flow (`index.ts`)

The Lambda handler receives an S3 event, extracts bucket name and key, and runs this pipeline:

Steps 1–6b are **shared by both game modes**; the pipeline then branches on mission type.

```
1.  Write ChomperJob (status: processing) — idempotent on lambdaRequestId
2.  Fetch TDF file from S3
3.  Parse TDF (Phase 1)
        → RejectionError: mark "rejected", move to error bucket, exit
        → ParseError:     mark "failed",   move to error bucket, exit
4.  Validate mission type is 5 (SM5) or 28 (Laserball)
        → if neither: mark "skipped", delete from incoming bucket, exit
4b. Validate player entities present
        → if none: mark "skipped", delete from incoming bucket, exit
5.  Check for duplicate game (natural key: center + start time)
        → if found: mark "skipped", delete from incoming bucket, exit
6b. Resolve competition slug prefix on the S3 key → competitionId
        → unrecognised slug: log a warning, continue with competitionId = null

    ── branch on mission type ──────────────────────────────────────────

    SM5 (type 5)                        Laserball (type 28)
    ─────────────────────────           ────────────────────────────────
    Simulate (Phase 2)                  simulateLaserball (Phase 2)
    6a. Consistency check               → no qualifying players:
        → discrepancies: throw               mark "skipped", delete, exit
    7.  Find active MVP model           Assert goals↔line-5-score invariant
    8.  Calculate MVP scores                 → mismatch: throw
    9–15. Phase 3 in one transaction    ingestLaserball (Phase 3)
                                        (no MVP model — Laserball has none)

    ── rejoin ──────────────────────────────────────────────────────────

10. Update ChomperJob (status: completed, gameId)
11. Move TDF to archive bucket with normalized key
12. POST the new-game webhook (best-effort)
```

The Phase 3 transaction retries on Postgres deadlock (code `40P01`), up to 3 attempts.

Any unhandled error caught by the outer try/catch — including the two `throw`s above — marks the job `failed` with the error message and moves the file to the error bucket.

Step 12 is the exception: `notifyNewGame` (`webhook.ts`) never throws. By the time it runs the game is committed and the file archived, so a webhook failure must not roll the job back into `failed` or send a good TDF to the error bucket — non-2xx responses and network errors are logged with `console.warn` and swallowed.

> The step numbers match the `// N.` comments in `index.ts`, which are non-contiguous for historical reasons (`4b`, `6a`, `6b`).

Re-invocation with the same Lambda request ID is idempotent: the handler checks `findChomperJobByLambdaRequestId` on startup and skips if already completed.

---

## ChomperJob Status Lifecycle

| Status       | Meaning                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `processing` | Pipeline in progress                                                                                                   |
| `completed`  | Successfully ingested into the database                                                                                |
| `skipped`    | Not ingested — mission type is neither 5 (SM5) nor 28 (Laserball), duplicate game, or no player entities; file deleted |
| `rejected`   | Structurally invalid game (e.g. player registered on multiple teams); file moved to error bucket                       |
| `failed`     | Parse, simulation, or ingest error; file moved to error bucket                                                         |

---

## Environment Variables

### Lambda (`index.ts`)

| Variable          | Description                                |
| ----------------- | ------------------------------------------ |
| `INCOMING_BUCKET` | S3 bucket where new TDF files arrive       |
| `ARCHIVE_BUCKET`  | S3 bucket for successfully processed files |
| `ERROR_BUCKET`    | S3 bucket for failed or rejected files     |

All three are required — Lambda throws immediately on startup if any is absent.

| Optional variable      | Description                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEW_GAME_WEBHOOK_URL` | Overrides the new-game webhook target (default `https://www.ebomike.com/lfserver/new_game`). Set to an empty string to disable. |

### Bulk Ingest CLI (`bulk-ingest.ts`)

| Variable                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `ARCHIVE_BUCKET`        | Source bucket (where legacy files live)             |
| `MODERN_ARCHIVE_BUCKET` | Destination bucket for successfully processed files |
| `ERROR_BUCKET`          | Destination for failed or rejected files            |

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

## Re-ingest and Maintenance CLIs

Four further tools operate on games that are **already in the database**. All are manually invoked and all read `packages/db/.env`.

| Script                                   | What it does                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter chomper bulk-reingest`    | **SM5 only.** Re-runs parse + simulate over stored SM5 games, deletes their child rows and rewrites them via `reingester.ts`, then recomputes MVP. Worker pool with deadlock retry. Laserball games are skipped. |
| `pnpm --filter chomper bulk-reingest-lb` | The Laserball counterpart. Deletes the `lb_` child rows (`deleteLbGameChildren`) and rewrites them. No MVP step — Laserball has no MVP model.                                                                    |
| `pnpm --filter chomper ingest-lb-local`  | Full three-phase Laserball ingest from a directory on disk, bypassing S3 entirely. Development convenience. Always ingests as a social game (`competitionId = null`).                                            |
| `pnpm --filter chomper recalcMVP`        | Recomputes MVP for stored scorecards under the active model.                                                                                                                                                     |

**Both re-ingest paths preserve admin-owned metadata.** Before rewriting a `game` row they snapshot `competition_id`, `exclude`, and `description`, and restore them afterwards via `restoreGameMetadata`. Without this, re-ingesting would silently detach games from their competitions.

> `recalcMVP` does **not** re-simulate — it reconstructs MVP inputs from the stored `sm5_scorecard` columns. It is therefore only valid for MVP _model_ changes. If simulation computed a stat wrongly, `bulk-reingest` is the tool; `recalcMVP` would faithfully recompute MVP from the same bad numbers.

---

## Drizzle Patterns

All queries in `packages/db/queries/chomper.ts` use these patterns:

### Upsert

```typescript
await db
  .insert(center)
  .values(row)
  .onConflictDoUpdate({
    target: [center.countryCode, center.siteCode],
    set: { name: sql`excluded.name` },
  });
```

### Bulk insert

```typescript
await db.insert(gamePlayerState).values(arrayOfRows);
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

The first field of a schema comment is the line type joined to a human-readable name — `;1/mission`, `;3/entity-start`. Only the numeric part before the `/` is the key; data lines carry the bare number. Keying on the full field silently yields an empty column list for every line type, which makes every schema-driven field (`duration`, `penalty`, `colour-rgb`, `battlesuit`, `memberId`) read as absent and fall back to its default.

### ParsedTdf Structure

```typescript
interface ParsedTdf {
  meta: {
    fileVersion: number;
    centre: string; // e.g. "3-3"
    countryCode: number; // parsed from centre
    siteCode: number; // parsed from centre
    startTime: string; // YYYYMMDDHHmmss from line type 1
    duration: number; // ms, default 900000 if absent
    penalty: number; // default 0 if absent
    penaltyDeclared: boolean; // whether line 1 carried the column at all (2.003+)
    missionType: number; // skip if not 5
    missionDesc: string;
  };
  teams: ParsedTeam[];
  entities: ParsedEntity[]; // internalId may differ from originalId for multi-gen players
  events: ParsedEvent[];
  scores: ParsedScore[];
  entityEnds: ParsedEntityEnd[];
  sm5Stats: ParsedSm5Stats[]; // duplicate entries merged by mergeDuplicateSm5Stats
  playerStateLog: ParsedPlayerState[]; // empty array for pre-2.005 files (type 9 lines discarded if fileVersion < 2.005)
  entityRouting: EntityRouting[]; // routing table for multi-generation players
}
```

### Version-Gated Field Defaults

| Field                      | Absent default                                                                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duration` (line type 1)   | `900000`                                                                                                                                                          |
| `penalty` (line type 1)    | `0`, with `penaltyDeclared: false` so the strip can tell "not configured to deduct" from "amount not recorded"                                                    |
| `battlesuit` (line type 3) | `null`                                                                                                                                                            |
| `memberId` (line type 3)   | `null`                                                                                                                                                            |
| `colourRgb` (line type 2)  | `null`                                                                                                                                                            |
| Line type 9 entirely       | Empty array — simulator uses synthetic 4-second state reconstruction. Type 9 lines present in pre-2.005 files (early test artefacts) are discarded by the parser. |

### Entity Type Classification

| type value                                      | Classification                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `player`                                        | Player entity — full stat tracking                                 |
| `referee`                                       | Referee — stored, no stats                                         |
| `standard-target`, `beacon`, `generator-target` | Target — all treated identically                                   |
| Anything else                                   | Non-player — stored for completeness, interactions not interpreted |

### Entity Routing (Multi-Generation Players)

The parser detects scenarios where the same entity ID has multiple registrations or scorecards and creates separate "generations" so each can be simulated independently.

**Case 1: Mid-game position change** — same entity ID registered twice with different `category` values. Each additional registration becomes a new generation: gen0 uses the original ID, gen1 uses `{originalId}_gen1`. This models a player who literally changed their position mid-game via the Laserforce console.

**Case 2: Same-position hardware restart** — same entity ID, same category, multiple registrations, and at least one of: a mid-game `exitType=01`/`17` entity-end, or multiple entity-ends (one per registration period, all `exitType=02`). The latter arises when the player switched to a new vest during play without a kick event being recorded — both periods ended naturally at mission complete. Each registration becomes a new generation initialized from scratch. Note: the old vest's section 7 residuals (`shotsLeft`, `livesLeft`) are recorded at mission end and include team boosts received after the player switched; the consistency check skips those fields for gen0 when a gen1 sibling exists.

**Case 3: Same-position hardware restart (single registration)** — same entity ID, ONE registration, but a mid-game `exitType=01`/`17` entity-end followed by a second section 7 scorecard. The hardware reset mid-game. A synthetic entity is created for the second period starting at the restart entity-end time.

**Case 4 (fatal): Player registered on multiple teams** — a player re-registering with a different `team` index is a hardware error that cannot be modeled. The parser throws a `RejectionError`, which routes the job to `status: "rejected"` and moves the file to the error bucket.

**Case 5 (fatal): Incomplete TDF** — if the file contains player entities but no section 7 scorecard lines, the game ended prematurely (e.g. server crash, aborted mission) and cannot be ingested. The parser throws a `RejectionError("Incomplete TDF - missing scorecard data")`.

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

| Map                        | Key      | Value                                       | Purpose                                                                                                                                 |
| -------------------------- | -------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `lastActorEventTime`       | entityId | Last timestamp this entity appears as actor | Actor-lookahead for premature elimination detection                                                                                     |
| `entityEndTimeById`        | entityId | Line-type-6 timestamp                       | Forward simulation ceiling                                                                                                              |
| `tdfFinalLives`            | entityId | `sm5Stats.livesLeft`                        | Forward simulation target                                                                                                               |
| `deactivationsReceived`    | entityId | Sorted `{time, lives}[]`                    | Forward simulation deactivations                                                                                                        |
| `resuppliesGained`         | entityId | Sorted `{time, lives}[]`                    | Direct lives resupplies received (0502 events)                                                                                          |
| `directTeamBoostsReceived` | entityId | Sorted `{time, lives}[]`                    | Team lives boosts (0512) received while in state_0 (excludes boosts that fall within the respawn uncertainty window — see 0512 handler) |

`deactivationsReceived` life costs: `0206`/`0209` = 1 life; `0306`/`0308` = 2 lives; nuke hits = 3 lives.

**Two-pass nuke detection for `deactivationsReceived`:**

- _Pass 1:_ Any state_3 entry in the state log within 100ms of a `0405` event (player transitioned to state_3 at nuke time)
- _Pass 2:_ Players already in state_3 strictly before the nuke (no new state_3 entry appears in the log because they were already down — but nukes hit all non-eliminated opponents regardless of current state)

### `directTeamBoostsReceived` Pre-Build

For 2.005+ files, this map is built by walking the type-9 state log to determine each player's exact state at each 0512 event time. For pre-2.005 files (empty state log), the synthetic 4+4-second state machine (`syntheticStateAt`) is run instead — replaying each player's deactivation history to determine their synthetic state at each 0512 time.

A player whose synthetic state_0 started within the last 2000ms is excluded from `directTeamBoostsReceived` (treated as pending, not direct) because the real state_0 start time can be off from the synthetic value by up to ~1 second. Including those boosts as "direct" in the forward simulation would cause `checkElimination` to under-compute `livesNeeded`. The 2000ms threshold matches the wider respawn uncertainty window used in `handle0512` for pre-2.005 files (see 0512 handler).

### 0512 Respawn Uncertainty Window

The 0512 handler applies a direct boost to state_0 teammates unless the player just became active (the **respawn uncertainty window**). Within this window, the boost is deferred to pending and `reconcilePendingBoosts` decides whether to apply it based on the TDF final lives gap.

The window width differs by file version because timing precision differs:

| File version | Window  | Rationale                                                                                       |
| ------------ | ------- | ----------------------------------------------------------------------------------------------- |
| 2.005+       | 250 ms  | State log is authoritative; radio lag is the only uncertainty source                            |
| Pre-2.005    | 2000 ms | Synthetic 4+4-second transitions are approximations; real state_0 start can be off by ~1 second |

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

| Event                                                          | Key behavior                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0100` Mission Start                                           | Initialize `PlayerSimState` for all players; record initial snapshots; set `missionStartTime`                                                                                                                                                                                                         |
| `0101` Mission End                                             | Record `missionEndTime`; close any open rapid fire windows; accumulate final uptime                                                                                                                                                                                                                   |
| `0205` Player Hit                                              | Apply shot power to target HP; update hit stats; if target in state 2 → re-deactivate; add to assist window if target is Commander or Heavy                                                                                                                                                           |
| `0206` Player Deactivate                                       | All 0205 logic + decrement `target.lives` by 1 + check elimination + clear assist window + award assists to assist window occupants                                                                                                                                                                   |
| `0306` Missile Hit Player (opponent)                           | Decrement `target.lives` by 2; one-hit deactivation regardless of HP; handle nuke cancel; earn SP if Commander missile; deduct missile                                                                                                                                                                |
| `0308` Missile Hit Player (friendly)                           | Same handler as 0306; friendly-fire missile deactivation; routes correctly via isOpponent/isFriendly flag                                                                                                                                                                                             |
| `0404` Nuke Activate                                           | Set `isNuking = true`; increment `nukesActivated`; deduct 20 SP                                                                                                                                                                                                                                       |
| `0405` Nuke Detonate                                           | For each non-eliminated opposing player: −3 lives, force state_3; award +500 to actor                                                                                                                                                                                                                 |
| `0400` Rapid Fire Activate                                     | Set `isRapidFire = true`; record start time; increment `rapidFire`; deduct 10 SP                                                                                                                                                                                                                      |
| `0500` Ammo Resupply                                           | Restore target shots to max; end rapid fire if active; transition target to state_3 (resupply cause)                                                                                                                                                                                                  |
| `0502` Lives Resupply                                          | Restore target lives to max; transition target to state_3 (resupply cause)                                                                                                                                                                                                                            |
| `0510` Team Ammo Boost                                         | Restore shots for all state_0 teammates; state_3/state_2 teammates receive a pending boost recorded for reconciliation                                                                                                                                                                                |
| `0512` Team Lives Boost                                        | Restore lives for all state_0 teammates (unless within the respawn uncertainty window — see below); state_3/state_2 teammates receive a pending boost                                                                                                                                                 |
| `0600` Referee Penalty                                         | Increment `penalties`; record a `SimPenalty` with `scoreValue = 0` (league policy — an in-game penalty costs nothing until referees escalate it); transition target to state_3. The matching line type 5 deduction is stripped from the score stream during setup so the score stays raw — see below. |
| `0204` Target Destroy                                          | Increment `targetsDestroyed`; earn +5 SP                                                                                                                                                                                                                                                              |
| `0303` Missile Destroy Target                                  | Increment `targetsDestroyed`; earn +5 SP; deduct missile                                                                                                                                                                                                                                              |
| `0209` Warbot Deactivate                                       | Decrement `target.lives` by 1; trigger state_3 (deactivationCause = 'other'); handle nuke cancel. Does **not** increment `timesHit` — warbot deactivations are excluded from the TDF's `timesZapped` stat. No actor playerState (actor is a non-player warbot).                                       |
| `0B00` Beacon Claim                                            | Increment `actor.shotsFired` and `actor.shotsHit` by 1; decrement shots by 1 (except Ammo Carrier). The two warm-up hits before the claim have no section 4 events — they are ghost shots (see below).                                                                                                |
| `0B03` Base Award                                              | Increment `targetsDestroyed` (no SP — post-elimination award, not an in-game action)                                                                                                                                                                                                                  |
| `0201`, `0202`, `0203`, `0300`, `0301`, `0304`, `0900`, `0902` | No state changes; skip                                                                                                                                                                                                                                                                                |

**Missiles that consume a missile:** `0301` (gen miss), `0303` (destroy target), `0304` (miss vs player), `0306`/`0308` (hit player). `0300` (missile lock) does not consume a missile.

**medicHits formula:** The TDF's `medicHits` field counts **lives removed** from opponent medics, not event count. A missile removes 2 lives (counts as 2), but if the medic has only 1 life the missile removes 1 (counts as 1). The consistency check formula is:

```
shotsHitOpponentMedic + missilesHitOpponentMedicLives = medicHits
```

where `missilesHitOpponentMedicLives` accumulates `Math.min(2, Math.max(0, target.lives))` at the moment of each missile hit — before the `target.lives -= 2` decrement.

### Elimination Handling

When a player's lives reach 0 or below after any hit, `checkElimination()` runs:

1. Check either:
   - `lastActorEventTime.get(entityId) > currentTime` (**provably alive**) — the player still appears as an actor later in the event stream, so the hardware kept them alive; or
   - the player has pending lives boosts in `pendingBoosts` (**unapplied 0512 boost**) — a 0512 team-lives boost fired while the player was in state_3, was recorded as pending, and was never consumed when they returned to state_0. Without rescue the player would be prematurely eliminated and miss subsequent events (e.g. a 0510 ammo boost that fires 20 s later).

2. If either condition is true and there are pending lives boosts: apply the minimum needed via forward simulation (see below). If no pending lives boost is available but the player is provably alive, eliminate anyway (shots shortfall — hardware kept them alive on 0 lives, which the simulator cannot replicate without a boost source).

3. Otherwise: mark `isEliminated = true`, `eliminatedAt = currentTime`.

**Forward simulation for lives needed:** When applying a pending lives boost, compute the minimum lives to grant:

```
livesNeeded = max(
  1 - minPrefixBalance,       // enough that the running balance never goes below 0
  tdfFinalLives - finalBalance // enough to match the TDF's residual livesLeft
)
livesNeeded = max(0, livesNeeded)
// If livesNeeded = 0 but future events still exist, force to 1
// so the player survives long enough to receive the next resupply —
// ONLY applied on the "provably alive" path, not the "pending lives" path.
// (On the pending-lives-only path the forward simulation is the sole
//  authority; applying the floor would over-inflate lives for surviving
//  players whose pending boosts happen not to be needed by the formula.)
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

| Exit type                | Behavior                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `04` (eliminated)        | If `lives > 0`: record `entityEndForcedLives`, zero lives                                                          |
| `01` (kicked)            | Set `lives = tdfFinalLives.get(id)` (TDF records their lives at kick time, which may be positive); mark eliminated |
| `17` (kicked by referee) | Same as `01`                                                                                                       |
| `02` (mission complete)  | No action needed                                                                                                   |

Kicked players are treated differently because TDF records their lives at the moment of kick, not at elimination. Zeroing lives as if they were eliminated produces spurious consistency check failures.

After applying exit-type logic, the final snapshot is synced from `ps.lives` **and** `ps.shots`. The shots sync handles one specific edge case: when a post-elimination `0500` ammo resupply fires after a player's last life is taken but before their entity-end, `handle0500` correctly updates `ps.shots`, but the state transition that would record a new snapshot is blocked (`isEliminated = true`). Without this sync the final snapshot would show the pre-resupply shots count, failing the consistency check.

### Post-Simulation: `mergeRestartGenerations`

Same-position hardware restarts (routing Cases 2 and 3) are simulated as separate generations so each period's counters start from the correct baseline, but they represent one human player and must collapse to a single Scorecard. Mid-game position changes (Case 1 with differing `category`) are genuinely different roles and stay separate. A route can contain both in sequence, so the merge decision is made per consecutive pair rather than once per route.

`mergeGenerationInto(target, source)` sums every cumulative counter across the two periods and adds the scores (score resets to 0 at the start of each generation, so the merged total is the sum). Which generation supplies the _end_ state depends on how the earlier one finished:

| Earlier generation's exit | End state, residual `livesLeft`/`shotsLeft`, surviving entity-end                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `01` / `17` / `02`        | Taken from the **later** generation — the usual broken-vest swap, where the newer vest holds the real end state |
| `04` (eliminated)         | Kept from the **earlier** generation — see below                                                                |

**Elimination is terminal.** An `exitType=04` means the player genuinely exhausted their lives. A later registration — a replacement vest issued in error, or a referee putting an eliminated player back in — cannot undo that, and the elimination still counts toward the opposing team's win condition. When the earlier generation ended in `04`, its end state and entity-end record are authoritative and the later exit record is discarded.

Counters and score are still summed in that case: if the player actually played a second stint, those points were scored and those shots were fired, but the player was still out. The later period's replay snapshots are also kept (the events happened and replay rows hang off them), with the final snapshot's `lives`/`shots` pinned to the eliminated values so the replay tail does not contradict the scorecard.

Getting this backwards is quiet but expensive: the surviving entity-end drives `Scorecard.eliminated` in the ingester, and `eliminatedInGame` drives the team elimination check in `buildResult()` — so a dropped elimination silently flips a game from an elimination win to a score win and strips the winning team's 10,000-point bonus. The consistency check does not catch it, because the merge leaves `sm5Stats` self-consistent with the wrong state. The test suite asserts the invariant directly instead: every `04` in a file must still surface as a genuine elimination in one of that player's surviving generations.

---

## Consistency Checks

`runConsistencyCheck()` compares simulator-computed values against TDF `sm5Stats` (line type 7). All fields are checked; any discrepancy causes a consistency check failure, which routes the game to the error bucket.

| sm5Stats field     | Computed equivalent                                    |
| ------------------ | ------------------------------------------------------ |
| `shotsHit`         | `shots_hit`                                            |
| `shotsFired`       | `shots_fired`                                          |
| `timesZapped`      | `times_hit`                                            |
| `timesMissiled`    | `times_hit_by_missile`                                 |
| `missileHits`      | `missile_hits`                                         |
| `nukesDetonated`   | `nukes_detonated`                                      |
| `nukesActivated`   | `nukes_activated`                                      |
| `nukeCancels`      | `nukes_canceled`                                       |
| `medicHits`        | `shots_hit_opponent_medic` (lives formula — see above) |
| `ownMedicHits`     | `shots_hit_team_medic`                                 |
| `medicNukes`       | `nukes_hit_medic`                                      |
| `scoutRapid`       | `rapid_fire`                                           |
| `lifeBoost`        | `life_boost`                                           |
| `ammoBoost`        | `ammo_boost`                                           |
| `livesLeft`        | `lives_left`                                           |
| `shotsLeft`        | `shots_left`                                           |
| `penalties`        | `penalties`                                            |
| `shot3Hit`         | `shots_hit_opponent_3hit`                              |
| `ownNukeCancels`   | `team_nukes_canceled`                                  |
| `shotOpponent`     | `shots_hit_opponent`                                   |
| `shotTeam`         | `shots_hit_team`                                       |
| `missiledOpponent` | `missiles_hit_opponent`                                |
| `missiledTeam`     | `missiles_hit_team`                                    |

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

**Penalty deductions are removed first.** A `0600` event generates a line type 5 entry for `-penalty`, so both the score stream and the line type 6 totals arrive with the deduction already applied.

League policy is that an **in-game penalty costs nothing**: it is logged at `score_value = 0` and `mvp_value = 0`, and only a referee escalation decided after the game carries a deduction (normally -1000 score and -5 MVP — see [SM5-penalty-definitions.md](SM5-penalty-definitions.md)). The arena's own setting is therefore taken back out of the score entirely rather than moved onto the `GamePenalty` row. Note that the line type 1 `penalty` value is a per-game arena setting, not a constant: center 4-19 runs `-1000` normally but was configured to `0` for the Internationals 2024 files.

`Simulator.stripPenaltyDeductionsFromScores()` runs during setup, right after generation-ID resolution and before any state is built. For every line 5 entry whose `(time, entity)` matches a real `0600` event it zeroes the delta and shifts that entity's subsequent `old`/`new` values back up by the same amount, keeping `new = old + delta` intact throughout. It then applies the same shift to each line type 6 `score`, counting only the penalties that landed before that entity left the game. Matching on the `0600` event rather than the delta alone keeps an ordinary score change that happens to equal the penalty amount from being stripped.

How the amount is established depends on the file version:

| line 1 `penalty` | behaviour                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| present, non-0   | the entry's `delta` must equal it exactly                                                                                                                                  |
| present, `0`     | the arena was configured not to deduct — nothing to strip, return early                                                                                                    |
| absent (< 2.003) | the column does not exist and the setting is unrecoverable, so the accompanying entry is the only record of it: strip whatever it deducted, provided the delta is negative |

`meta.penaltyDeclared` distinguishes the last two, which `meta.penalty` alone cannot — it defaults to `0` when the column is absent.

Everything downstream — replay snapshots, `Scorecard.score`, `GameTeam.score`, and the MVP score bonus (which reads line type 6) — therefore sees the score the player actually earned, and `GamePenalty.score_value` carries an escalation and nothing else. Because that escalation exists only in the database, `applyPenaltyMetadata` preserves `score_value` across a reingest alongside `type`, `mvp_value` and `rescinded`.

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

## Laserball Pipeline (mission type 28)

Laserball reuses everything above except the **event semantics** and the **destination tables**. The parser, the shared identity upserts, the shared `game` table, and every entry point are common with SM5; only Phase 2 and Phase 3 diverge.

Laserball is a distinct game mode with no lives, no shot limits, and no roles. Games end in a **score** victory or a **draw** — never an elimination. The stat set is a faithful port of the European reference implementation, `demo_files/laserball-code/process_logs.php`, which is the authoritative spec for every computation. Per-stat definitions with PHP line references are in [Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md); the format deltas are in [Laserball_TDF_Spec.md](Laserball_TDF_Spec.md).

### Phase 1 — Parsing (shared `parser.ts`)

No Laserball-specific parser is needed. The generic line parsers produce a `ParsedTdf` whose `events` array carries `{ time, type, actor, target, description }` for every line type 4 event, and whose `playerStateLog` carries line type 9 transitions. Two facts make this work:

- Laserball player entities have `category === 0`, so the "player entities but no scorecard" rejection does not fire, and `buildEntityRouting` (which only considers `category > 0`) produces empty routing.
- The line type 9 version gate is widened: line 9 is admitted when `fileVersion >= 2.005 || missionType !== 5`. This keeps SM5 behaviour identical while letting Laserball (`2.005`/`2.006`) state logs through. `2.004` Laserball files simply have no line 9.

### Phase 2 — Simulation (`laserball/simulator.ts`)

`simulateLaserball(parsed): SimulatedLbGame` is a near-line-for-line port of `process_logs.php` §5–7.

**Unified event/state timeline.** The PHP processes line 4 and line 9 lines in one document-ordered pass. The parser splits them into `events` and `playerStateLog`; `buildTimeline()` re-merges them by raw time (event-before-state on ties). Line 9 timestamps are strictly at-or-after their triggering action, so this recovers document order.

**Time smoother.** Ported verbatim (php:271-319): a running offset corrects negative time jumps (`+= lastRaw`) and large (>60s) forward gaps (`-= gap-1000`), applied across the merged stream.

**Player discovery & teams.** Player entities define team membership. The two competing teams are the first two team indices that contain players (php:155-162); all other teams (e.g. Neutral) get `score`/`result` of null.

**Ball possession.** A single `currentHolder` is tracked across `1107`/`1100`/`1109`/`1103` (gain) and `1101`/`1102`/`1106`/`1108`/`0101` (loss); `possession_time_ms` accrues per holder, with a final flush at the smoothed end time (php:357-376, 624-627).

**State machine.** Line 9 drives per-player `status` and the `state0/2/3` counters, and derives `dynamicRespawnTime` from the first state-3→state-0 gap (php:321-345). When line 9 is absent (`2.004`), `status` stays 0 and `dynamicRespawnTime` is null.

**Event handlers.** The PHP if/else-if structure is preserved exactly: round start/end & match reset; miss; target resets; get-ball; pass/clear; steal; failed clear (incl. cooldown-adjusted `failed_clears_calc`, `bad_attacks_fc`, and the inactive-clear penalty + `no_clear_blocks`); block (reset vs normal, `blocks_with_ball`, `block_serie_max`, `clutch_saves`, `reset_point`); the standalone futile-attack evaluator; and the goal handler (assist/clear-assist chain, `big_goals`, `defense_score`, `blocks_before_goal`, `futile_attacks_goal`, `pass_over_opponent`, `no_clear_goal`). `big_mid` combos and `registerAggressiveAction` mirror php:281-292.

**Replay emission** — an extension beyond the PHP. For each meaningful event (everything except `0201` misses and `0900–0902` achievements) the simulator records an `LbSimEvent` and, for the involved actor/target, a per-player snapshot (`state`, `has_ball`, running `score`). This mirrors SM5's targeted snapshot approach.

**Output.** Team scores are the sum of each team's players' goals; outcome is `score` (unequal) or `draw` (equal). Persisted players are those on a competing team with >30s playtime (php:646). The result also carries a `goalCheck` comparing per-team goal totals against line-5 score-event totals.

### Phase 3 — Insertion (`laserball/ingester.ts`)

A single transaction writes, in FK-safe order:

```
1.  upsertCenter                     (shared)
2.  upsertPlayer                     (shared; one per #… entity, sorted for deadlock-safe locking)
3.  insertGame                       (shared `game`; type = "lb", exclude = outcome === "aborted")
4.  insertLbGameTeams                (competing teams + Neutral)
5.  upsertBattlesuit                 (shared; one per battlesuit)
6.  insertLbScorecards               (persisted players only)
7.  insertLbGamePlayerInteractions   (ordered actor→target steals/blocks/passes)
8.  insertLbGameEvents               (returns UUIDs for snapshot linkage)
9.  insertLbGamePlayerStates         (chunked; the largest table)
10. upsertPlayerCallsignHistory      (shared)
```

Shared identity upserts come from `packages/db/src/queries/chomper.ts`; lb-specific inserts from `packages/db/src/queries/laserball.ts`.

### Validation

Laserball TDFs have **no line type 7**, so there is no SM5-style stat-by-stat consistency check. Validation instead uses:

- **Goal invariant** — per-team goal totals must equal per-team line-5 score-event totals. Asserted in the Lambda and bulk paths, reported by the CLI and test suite. Across the 207-game sample corpus this holds for every game.
- **Graceful non-TDF handling** — downloaded HTML 404 pages are detected and skipped, not crashed.
- **Parity spot-checks** — hand-comparison of core stats (goals, assists, steals, blocks, clears, possession time) against the raw events. The PHP remains the reference for the heuristic stats, which have no file-based ground truth.

To validate end-to-end DB writes: `pnpm db:migrate`, then ingest a few files and query `lb_scorecard`, `lb_game_team`, `lb_game_event`, and `lb_game_player_state`, confirming `game.type = 'lb'` and a correct outcome.

---

## Test Suite

The test suite runs every TDF in `demo_files/` (SM5) and `demo_files/laserball/` through Phase 1 and Phase 2 and verifies the output. **It does not touch the database.**

```bash
pnpm --filter chomper run test        # or, from apps/chomper: node_modules/.bin/tsx src/test-suite.ts
```

### What it does

1. Deletes any stale `.debug.json` files from `demo_files/` before starting.
2. Collects every `*.tdf` in `demo_files/` and `demo_files/laserball/` (sorted). A missing `laserball/` subdirectory is not an error.
3. For each file: runs `parseTdf`, dispatches on `parsed.meta.missionType`, writes `<filename>.debug.json` next to the TDF, and reports `PASS` / `FAIL` / `SKIP`.
4. Writes a timestamped log to `apps/chomper/logs/test-suite-<timestamp>.log`.
5. Exits 1 if any file failed, 0 if all passed or skipped.

Placement in `laserball/` is convention only — dispatch is on the mission type inside the file, so a misfiled Laserball TDF at the top level still runs the Laserball path.

### Pass / fail / skip criteria

| Result | When                                                                                                                                                                                                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASS` | **SM5:** `consistencyCheck.discrepancies` is empty. **Laserball:** `goalCheck.ok` is true. **Either:** the file threw a `RejectionError` — a structurally invalid game, correctly identified and rejected. |
| `SKIP` | The file is not a TDF at all (an HTML page — some downloaded samples are 404s), **or** the mission type is neither 5 nor 28.                                                                               |
| `FAIL` | **SM5:** `consistencyCheck.discrepancies` is non-empty. **Laserball:** `goalCheck.ok` is false. **Either:** the file could not be read, or an unexpected parse/simulation error.                           |

A `RejectionError` (e.g. a player registered on multiple teams) counts as `PASS` because the parser correctly identified the file as invalid. Only unexpected errors, consistency discrepancies, and goal-invariant mismatches are failures.

### Debug output

SM5 files produce the full comparison shape:

```json
{
  "consistencyCheck": { "passed": true, "discrepancies": [], "ghostShots": [], "warnings": [] },
  "events": [...],
  "playerStates": { ... }
}
```

- `discrepancies` — each mismatch between computed stats and TDF `sm5Stats` (line type 7). Non-empty means `FAIL`.
- `ghostShots` — shot anomalies that don't produce a discrepancy but flag edge cases.
- `warnings` — informational notes from simulation.
- `events` — the full simulated event list with indices, for replay debugging.
- `playerStates` — per-player computed state and snapshot history, side-by-side with the TDF `sm5Stats`.

Laserball files write a smaller shape — with no line type 7 there is nothing to reconcile against, so there is no `consistencyCheck`:

```json
{
  "missionType": 28,
  "outcome": "score",
  "actualDuration": 900000,
  "goalCheck": { "ok": true },
  "teams": [...],
  "playerCount": 10,
  "eventCount": 1234
}
```

These files are gitignored and regenerated on every run.

### Single-file testing

```bash
pnpm --filter chomper run ingest <path/to/file.tdf>
```

Runs Phase 1 + Phase 2 for one file and writes its `.debug.json`, dispatching on mission type exactly as the suite does. Identical in coverage, just scoped to one file, and it does not touch the database.

> The `pnpm ingest` root script forwards its argument to the chomper package, but path handling can be unreliable on Windows. Running `pnpm --filter chomper run ingest` from the repo root with a relative path (e.g. `../../demo_files/foo.tdf`), or from `apps/chomper` directly, is more reliable.

**Testing Phase 3.** There is no single-file SM5 tool that exercises database ingest — an SM5 file must go through the Lambda handler or a bulk-ingest run against S3. Laserball has a local escape hatch in `ingest-local-lb.ts` (see [Re-ingest and Maintenance CLIs](#re-ingest-and-maintenance-clis)).

### Adding test files

Drop an SM5 `.tdf` into `demo_files/`, or a Laserball `.tdf` into `demo_files/laserball/`, and the next run picks it up. Any other mission type is reported as `SKIP`.

---

## Reference Documents

- [`TDF_Spec.md`](TDF_Spec.md) — complete TDF format, all line types, all event codes, version-gated features
- [`Scorecard_Table_Spec.md`](Scorecard_Table_Spec.md) — full definition of every Scorecard column including derivation logic
- [`Core_Schema.md`](Core_Schema.md) — SM5 database schema, MVP formula, GamePlayerState structure
- [`Laserball_TDF_Spec.md`](Laserball_TDF_Spec.md) — Laserball's deltas to the TDF format
- [`Laserball_Scorecard_Table_Spec.md`](Laserball_Scorecard_Table_Spec.md) — every `lb_scorecard` column, with PHP line references
- [`Competition_Structure.md`](Competition_Structure.md) — what `game.competition_id` means downstream of ingest
