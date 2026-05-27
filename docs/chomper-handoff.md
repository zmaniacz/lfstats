# Chomper — Implementation Handoff

**Tool:** Chomper  
**Location:** `apps/chomper`  
**Purpose:** TDF file ingestion — parses SM5 game files from S3, populates the database, and archives the file.

---

## Overview

Chomper is a Lambda function triggered by S3 upload events. When a TDF file is uploaded to the incoming S3 bucket, Lambda fires a Chomper instance for that file. Chomper parses the file, simulates the game state machine to compute all derived stats, writes everything to the database in a single transaction, and moves the file to the archive bucket.

Multiple Chomper instances run concurrently without coordination — Lambda handles parallelism naturally. Chomper is stateless and insert-only.

---

## Repository Structure

```
apps/chomper/
  src/
    index.ts          ← Lambda entry point
    parser.ts         ← Phase 1: TDF file parsing
    simulator.ts      ← Phase 2: state machine simulation and stat computation
    ingester.ts       ← Phase 3: database writes
    mvp.ts            ← MVP score calculation
    s3.ts             ← S3 fetch and archive move helpers
    types.ts          ← shared TypeScript interfaces and types
  tsconfig.json
  package.json

packages/db/
  schema.ts           ← existing Drizzle schema (add ChomperJob table here)
  queries/
    chomper.ts        ← all Chomper query functions (create this file)
```

All database query functions used by Chomper must live in `packages/db/queries/chomper.ts` as named exports. No inline SQL or Drizzle calls inside `apps/chomper`. This keeps the db package as the single source of query logic.

---

## Entry Point — `index.ts`

The Lambda handler receives an S3 event. Extract the bucket name and object key from the event. The flow is:

```
1. Write ChomperJob record (status: processing)        ← outside main transaction
2. Fetch TDF file from S3
3. Check for duplicate game — if found, mark job skipped and exit
4. Parse TDF into structured in-memory object (Phase 1)
5. Validate — if mission type is not SM5, mark job skipped and exit
6. Simulate state machine, compute all derived stats (Phase 2)
7. Open database transaction
8. Write all rows to database (Phase 3)
9. Commit transaction
10. Update ChomperJob (status: completed, game_id: ...)  ← outside main transaction
11. Move TDF file to archive bucket with renamed key
```

On any unhandled error, catch it, rollback the transaction if open, and update `ChomperJob` to `status: failed` with `error_message` and stack trace. Never let an error escape without updating the job record.

### Environment variables

| Variable | Description |
|---|---|
| `INCOMING_BUCKET` | S3 bucket name where TDF files are uploaded by the web app |
| `ARCHIVE_BUCKET` | S3 bucket name where processed TDF files are moved after successful ingest |

Both are required. Chomper should throw immediately on startup if either is absent.

### Deployment and secrets

Chomper uses AWS SAM for deployment and reads database credentials from AWS Secrets Manager in production. For local development, `DATABASE_URL` may be provided from `packages/db/.env` or the environment. The production Lambda expects `DATABASE_SECRET_ARN` and resolves a JSON secret with keys `username`, `password`, `host`, `port`, and `dbname`.

See `apps/chomper/README.md` for the exact secret shape, pipeline secrets, and deploy commands.

### Archive filename

The archive key is constructed as: `{center_id}-{game_start_timestamp}.tdf`

Where `center_id` is the UUID of the Center record and `game_start_timestamp` is the `start` field from line type 1 formatted as `YYYYMMDDHHmmss`. This string is constructed before the transaction and stored in `Game.tdf_filename` as part of the insert. The actual S3 move happens after the transaction commits.

---

## ChomperJob Table

Add this table to `packages/db/schema.ts`:

```typescript
export const chomperJob = pgTable('chomper_job', {
  id: uuid('id').primaryKey().defaultRandom(),
  s3Key: text('s3_key').notNull(),
  status: text('status').notNull(), // 'processing' | 'completed' | 'failed' | 'skipped'
  lambdaRequestId: text('lambda_request_id'),
  gameId: uuid('game_id').references(() => game.id),
  skipReason: text('skip_reason'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
})
```

---

## Drizzle Patterns

All queries in `packages/db/queries/chomper.ts` must follow these patterns. Do not use raw SQL. Do not use patterns not shown here.

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
  // all inserts inside the transaction use tx, not db
  await tx.insert(game).values(...)
  await tx.insert(gameTeam).values(...)
  // etc.
})
```

### Queries needed in `packages/db/queries/chomper.ts`

| Function | Purpose |
|---|---|
| `createChomperJob(data)` | Insert a new job record |
| `updateChomperJob(id, data)` | Update status, gameId, error, completedAt |
| `findGameByNaturalKey(centerId, startTime)` | Idempotency check — returns game or null |
| `upsertCenter(data)` | Insert or update on (countryCode, siteCode) |
| `upsertPlayer(data)` | Insert or update on iplId |
| `upsertPlayerCallsignHistory(data)` | Insert or update on (playerId, callsign) |
| `upsertBattlesuit(data)` | Insert or update on (centerId, name) |
| `upsertTarget(data)` | Insert or update on (centerId, hardwareId) |
| `insertGame(data)` | Single insert |
| `insertGameTeams(rows)` | Bulk insert |
| `insertGameTargets(rows)` | Bulk insert |
| `insertGameTargetDestructions(rows)` | Bulk insert |
| `insertGameReferees(rows)` | Bulk insert |
| `insertGamePenalties(rows)` | Bulk insert |
| `insertScorecards(rows)` | Bulk insert |
| `insertGamePlayerInteractions(rows)` | Bulk insert |
| `insertGameEvents(rows)` | Bulk insert |
| `insertGamePlayerStates(rows)` | Bulk insert — highest row count |
| `insertScorecardMvps(rows)` | Bulk insert |
| `findActiveMvpModel()` | Returns the MvpModel row where retiredAt is null |

---

## TypeScript

Chomper is written in TypeScript throughout. Key conventions:

- All shared interfaces and types live in `src/types.ts` and are imported where needed — do not define types inline in individual files
- Use strict mode (`"strict": true` in `tsconfig.json`)
- Drizzle provides inferred types from the schema — use `typeof table.$inferInsert` and `typeof table.$inferSelect` for insert and select types rather than defining them manually
- The Lambda handler signature should use the `S3Event` type from `@types/aws-lambda`
- Prefer `unknown` over `any` — narrow types explicitly when parsing TDF fields from raw strings
- Use discriminated unions for the `status` field on `ChomperJob` and `deactivationCause` on `PlayerSimState` rather than plain strings where possible

---



Read the TDF file from S3. The file is **UTF-16 LE with BOM**, line endings are `\r\n`, delimiter is tab.

Walk every line. Lines beginning with `;` are schema comment lines — parse them to determine which columns are present for the following line type. This is the **authoritative source** for column presence — do not rely on `file-version` alone. Store the most recently seen schema comment for each line type and use it when parsing subsequent lines of that type.

Define all interfaces for the parsed output in `src/types.ts` and import them in `parser.ts`, `simulator.ts`, and `ingester.ts`. Output a single structured `ParsedTdf` object:

```typescript
interface ParsedTdf {
  meta: {
    fileVersion: number
    centre: string           // e.g. "3-3"
    startTime: string        // YYYYMMDDHHmmss from line type 1
    duration: number         // ms, default 900000 if absent
    penalty: number          // default 0 if absent
    missionType: number      // skip if not 5
    missionDesc: string
  }
  teams: Array<{
    index: number
    desc: string
    colourEnum: number
    colourDesc: string
    colourRgb: string | null
  }>
  entities: Array<{
    time: number
    id: string
    type: string
    desc: string
    team: number
    level: number
    category: number
    battlesuit: string | null
    memberId: string | null
  }>
  events: Array<{
    time: number
    type: string
    actor: string | null
    target: string | null
    description: string
  }>
  scores: Array<{
    time: number
    entity: string
    old: number
    delta: number
    new: number
  }>
  entityEnds: Array<{
    time: number
    id: string
    exitType: string
    score: number
  }>
  sm5Stats: Array<{
    id: string
    shotsHit: number
    shotsFired: number
    timesZapped: number
    timesMissiled: number
    missileHits: number
    nukesDetonated: number
    nukesActivated: number
    nukeCancels: number
    medicHits: number
    ownMedicHits: number
    medicNukes: number
    scoutRapid: number
    lifeBoost: number
    ammoBoost: number
    livesLeft: number
    shotsLeft: number
    penalties: number
    shot3Hit: number
    ownNukeCancels: number
    shotOpponent: number
    shotTeam: number
    missiledOpponent: number
    missiledTeam: number
  }>
  playerStateLog: Array<{   // empty array if absent (pre-2.005)
    time: number
    entity: string
    state: number
  }>
}
```

### Version-gated field defaults

| Field | Absent default |
|---|---|
| `duration` (line type 1) | `900000` |
| `penalty` (line type 1) | `0` |
| `battlesuit` (line type 3) | `null` |
| `memberId` (line type 3) | `null` |
| `colourRgb` (line type 2) | `null` (derive from colourEnum for display) |
| line type 9 entirely | empty array — use synthetic state reconstruction |

### Entity type classification

| type value | Classification |
|---|---|
| `player` | Player entity — full stat tracking |
| `referee` | Referee — stored, no stats |
| `standard-target`, `beacon`, `generator-target` | Target — all treated identically |
| anything else | Non-player — stored for completeness, interactions not interpreted |

---

## Phase 2 — Simulation (`simulator.ts`)

Takes the parsed object from Phase 1 and produces a fully computed game object ready for database insert. This is the most complex phase — read this section carefully.

### In-memory player state object

Maintain a `Map<string, PlayerSimState>` keyed by entity id (iplId or hardwareId). One entry per player entity. Define `PlayerSimState` in `src/types.ts`. Initialize at the `0100` Mission Start event using position starting stats:

```typescript
interface PlayerSimState {
  // identity
  entityId: string
  position: number           // 1=Commander, 2=Heavy, 3=Scout, 4=Ammo, 5=Medic
  teamIndex: number

  // live state
  state: 0 | 2 | 3
  stateEnteredAt: number
  hitPoints: number
  lives: number
  shots: number
  missiles: number
  sp: number                 // Heavy always 0, never increments
  isRapidFire: boolean       // Scout only
  rapidFireStartedAt: number | null
  isNuking: boolean          // Commander only
  nukeActivatedAt: number | null
  isEliminated: boolean
  eliminatedAt: number | null
  deactivationCause: 'resupply' | 'other' | null
  receivedAmmoResupplyThisCycle: boolean
  receivedLivesResupplyThisCycle: boolean
  lastAmmoResuppliedBy: string | null   // entityId of Ammo Carrier
  lastLivesResuppliedBy: string | null  // entityId of Medic

  // uptime/downtime accumulators (ms)
  uptime: number
  resupplyDowntime: number
  otherDowntime: number

  // stat accumulators
  shotsFired: number
  shotsHit: number
  shotsHitOpponent: number
  shotsHitTeam: number
  shotsHitOpponent3hit: number
  shotsHitOpponentMedic: number
  shotsHitTeamMedic: number
  timesHit: number
  missileHits: number
  missilesHitOpponent: number
  missilesHitTeam: number
  missilesHitOpponentMedic: number
  missilesHitTeamMedic: number
  timesHitByMissile: number
  nukesActivated: number
  nukesDetonated: number
  nukesHitMedic: number
  livesRemovedByNuke: number
  totalNukeActivationTime: number
  nukesCanceled: number
  teamNukesCanceled: number
  rapidFire: number
  totalRapidTime: number
  shotsFiredDuringRapid: number
  shotsHitDuringRapid: number
  shotsHitOpponentDuringRapid: number
  shotsHitTeamDuringRapid: number
  ammoBoost: number
  lifeBoost: number
  resuppliesGiven: number
  doubleResuppliesGiven: number
  resuppliesReceivedAmmo: number
  resuppliesReceivedLives: number
  deactivatedOpponent: number
  deactivatedTeam: number
  eliminatedOpponent: number
  eliminatedTeam: number
  eliminatedOpponentMedic: number
  eliminatedTeamMedic: number
  assists: number
  resetOpponent: number
  resetTeam: number
  missileResetOpponent: number
  missileResetTeam: number
  spEarned: number
  spSpent: number
  targetsDestroyed: number
  penalties: number

  // GamePlayerState snapshots — one per state-changing event
  stateSnapshots: GamePlayerStateSnapshot[]
}
```

### Position starting stats

| Position | Category | HP | Shot Power | Initial Shots | Max Shots | Resupply Shots | Initial Lives | Max Lives | Resupply Lives | Initial Missiles |
|---|---|---|---|---|---|---|---|---|---|---|
| Commander | 1 | 3 | 2 | 30 | 60 | 5 | 15 | 30 | 4 | 5 |
| Heavy Weapons | 2 | 3 | 3 | 20 | 40 | 5 | 10 | 20 | 3 | 5 |
| Scout | 3 | 1 | 1 | 30 | 60 | 10 | 15 | 30 | 5 | 0 |
| Ammo Carrier | 4 | 1 | 1 | 15 | 15 | 0 | 10 | 20 | 3 | 0 |
| Medic | 5 | 1 | 1 | 15 | 30 | 5 | 20 | 20 | 0 | 0 |

### Assist tracking

Maintain a separate `Map` keyed by entity id for Commander and Heavy Weapons targets only. Each entry is an array of `{ actorId, timestamp }` objects representing recent damaging hits on that target. Clear an entry completely whenever the target transitions to state 3.

### Interaction tracking

Maintain a `Map` keyed by `${actorId}->${targetId}` for all ordered player pairs. Initialize all pairs to zero at simulation start before walking events. Increment `shotsHit`, `shotDeactivations`, and `missileHits` as events are processed.

### GamePlayerState snapshot rules

Record a snapshot whenever any of the following change for a player: `score`, `lives`, `shots`, `missiles`, `sp`, `hitPoints`, `state`, `isRapidFire`, `isNuking`. The snapshot captures the full current state of the player at that event's timestamp. The initial snapshot for each player is recorded at the `0100` Mission Start event.

---

### Simulation clock and state transitions

Before processing each event at timestamp `T`, call `advanceClock(T)`:

**For 2.005+ files (playerStateLog is non-empty):**
Consume all line type 9 entries with `time <= T` in file order, applying the explicit state transition to the named player. Then process the real event.

**For pre-2.005 files (playerStateLog is empty):**
Loop over all player state objects. For any player with a pending synthetic transition scheduled at `<= T`, fire it. Pending transitions are:
- Player in state 3: synthetic state 2 at `stateEnteredAt + 4000`
- Player in state 2: synthetic state 0 at `stateEnteredAt + 4000`

If multiple transitions are due before `T`, sort by scheduled time and fire in order. A player may have only one pending transition at a time.

**Applying a state transition** (whether explicit or synthetic):

```
Transition to state 3:
  - Set state = 3, stateEnteredAt = timestamp
  - Reset hitPoints to position maximum
  - If isNuking = true on this player: clear isNuking (nuke cancelled)
  - Set deactivationCause based on what triggered this (resupply vs other)
  - Reset receivedAmmoResupplyThisCycle = false
  - Reset receivedLivesResupplyThisCycle = false
  - Clear this player's assist window entry (they are no longer a valid assist target)
  - Record GamePlayerState snapshot

Transition to state 2:
  - Set state = 2, stateEnteredAt = timestamp
  - hitPoints unchanged (carried from state 3, which entered at full)
  - Record GamePlayerState snapshot

Transition to state 0:
  - Accumulate downtime: if deactivationCause = 'resupply', add elapsed to resupplyDowntime; else add to otherDowntime
  - Set state = 0, stateEnteredAt = timestamp
  - hitPoints carry over unchanged (may be damaged from state 2 hits)
  - Record GamePlayerState snapshot
```

---

### Event handlers

Process each event in the `events` array after advancing the clock.

#### `0100` — Mission Start
Record initial GamePlayerState snapshots for all players. Set `missionStartTime`. All subsequent timestamps are relative to this.

#### `0101` — Mission End
Record `missionEndTime`. Close any open rapid fire windows (unlikely but defensive). Accumulate final uptime for all players still in state 0.

#### `0205` — Player Hit (non-deactivating)

Actor hit target but target has HP remaining after applying actor's shot power.

```
- Increment actor.shotsHit, actor.timesHit (wait — timesHit is on target)
- Increment actor.shotsHit
- Increment target.timesHit
- If target is opponent: increment actor.shotsHitOpponent, earn +1 SP for actor (capped at 99)
- If target is teammate: increment actor.shotsHitTeam
- If target is opponent Medic: increment actor.shotsHitOpponentMedic
- If target is team Medic: increment actor.shotsHitTeamMedic
- If target is opponent Commander or Heavy: increment actor.shotsHitOpponent3hit
- Apply shot power damage to target.hitPoints
- If target is in state 2: increment actor.resetOpponent or actor.resetTeam
  - Transition target to state 3 (re-deactivation — cause = 'other')
  - Do NOT decrement lives on a reset via 0205 — only 0206 decrements lives
- If actor.isRapidFire: increment actor.shotsHitDuringRapid
  - If target is opponent: increment actor.shotsHitOpponentDuringRapid
  - If target is teammate: increment actor.shotsHitTeamDuringRapid
- If target is Commander or Heavy opponent: add actor to target's assist window
- Record GamePlayerInteraction increment
- Record GamePlayerState snapshots for actor and target
```

#### `0206` — Player Deactivate (shot)

Actor's shot reduced target HP to 0.

```
- All of the same increments as 0205 (shotsHit, timesHit, SP, medic stats, 3hit, rapid fire)
- Additionally:
  - Decrement target.lives by 1
  - Increment actor.deactivatedOpponent or actor.deactivatedTeam
  - If target.lives <= 0: mark target eliminated (see elimination handling below)
  - If target is in state 2: increment actor.resetOpponent or actor.resetTeam
  - If target.isNuking: increment actor.nukesCanceled; increment actor's own team commander's ownNukeCancels (the actor cancelled a friendly nuke accidentally if target is same team)
    Wait — nukes_canceled tracks cancelling an ENEMY commander's nuke. ownNukeCancels tracks accidentally cancelling a FRIENDLY commander's nuke. Determine which applies based on team relationship between actor and target.
  - Transition target to state 3 (cause = 'other')
  - Clear target's assist window entry
  - Award assists: all actors in target's assist window (excluding current actor) earn an assist
  - Clear target's assist window
  - Record GamePlayerInteraction: increment shotDeactivations
  - Record GamePlayerState snapshots for actor and target
```

#### `0306` — Missile Hit Player

Actor's missile deactivated target in one hit regardless of HP.

```
- Decrement target.lives by 2
- Increment actor.missileHits, actor.missilesHitOpponent or actor.missilesHitTeam
- Increment target.timesHitByMissile
- If target is opponent Medic: increment actor.missilesHitOpponentMedic
- If target is team Medic: increment actor.missilesHitTeamMedic
- If actor is Commander and target is opponent: earn +2 SP for actor (capped at 99)
- If target is in state 2: increment actor.missileResetOpponent or actor.missileResetTeam
- If target.isNuking: handle nuke cancel (same logic as 0206)
- If target.lives <= 0: mark target eliminated
- Transition target to state 3 (cause = 'other')
- Clear target's assist window entry
- Decrement actor.missiles by 1
- Record GamePlayerInteraction: increment missileHits
- Record GamePlayerState snapshots for actor and target
```

#### `0404` — Nuke Activate

```
- Set actor.isNuking = true
- Set actor.nukeActivatedAt = event.time
- Increment actor.nukesActivated
- Deduct 20 SP from actor
- Record GamePlayerState snapshot for actor
```

#### `0405` — Nuke Detonate

```
- Set actor.isNuking = false
- Increment actor.nukesDetonated
- Compute activation time: event.time - actor.nukeActivatedAt
- Add to actor.totalNukeActivationTime
- Award +500 points to actor (verify against line type 5)
- For each opposing player currently in the game (not eliminated):
  - livesLost = min(3, player.lives)
  - Decrement player.lives by 3 (may go to 0 or below)
  - Add livesLost to actor.livesRemovedByNuke
  - If player is opposing Medic: add livesLost to actor.nukesHitMedic
  - If player.lives <= 0: mark player eliminated
  - Transition player to state 3 (cause = 'other')
  - Clear player's assist window entry
  - Record GamePlayerState snapshot for each affected player
- Record GamePlayerState snapshot for actor
```

#### `0400` — Rapid Fire Activate

```
- Set actor.isRapidFire = true
- Set actor.rapidFireStartedAt = event.time
- Increment actor.rapidFire
- Deduct 10 SP from actor
- Record GamePlayerState snapshot for actor
```

#### `0500` — Ammo Resupply

```
- Increment actor.resuppliesGiven
- Increment target.resuppliesReceivedAmmo
- Set target.receivedAmmoResupplyThisCycle = true
- If target.receivedLivesResupplyThisCycle = true: increment actor.doubleResuppliesGiven AND find the Medic who gave the lives resupply this cycle and increment their doubleResuppliesGiven too
- Restore target.shots to position max shots
- If target.isRapidFire = true:
  - Close rapid fire window: add (event.time - target.rapidFireStartedAt) to target.totalRapidTime
  - Set target.isRapidFire = false
  - Record GamePlayerState snapshot for target
- Transition target to state 3 (cause = 'resupply')
- Record GamePlayerState snapshots for actor and target
```

#### `0502` — Lives Resupply

```
- Increment actor.resuppliesGiven
- Increment target.resuppliesReceivedLives
- Set target.receivedLivesResupplyThisCycle = true
- If target.receivedAmmoResupplyThisCycle = true: increment actor.doubleResuppliesGiven AND find the Ammo Carrier who gave the ammo resupply this cycle and increment their doubleResuppliesGiven too
- Restore target.lives to position max lives
- Transition target to state 3 (cause = 'resupply')
- Record GamePlayerState snapshots for actor and target
```

#### `0510` — Team Ammo Boost

```
- Increment actor.ammoBoost
- Deduct 15 SP from actor
- For each active (state 0) teammate: restore shots to position max
- Record GamePlayerState snapshots for actor and all affected teammates
```

#### `0512` — Team Lives Boost

```
- Increment actor.lifeBoost
- Deduct 10 SP from actor
- For each active (state 0) teammate: restore lives to position max
- Record GamePlayerState snapshots for actor and all affected teammates
```

#### `0600` — Referee Penalty

```
- Increment target.penalties
- Transition target to state 3 (cause = 'other')
- Score change is captured from line type 5
- Record GamePlayerState snapshot for target
```

#### `0204` — Target Destroy (shot)

```
- Increment actor.targetsDestroyed
- Earn +5 SP for actor (capped at 99)
- Record GamePlayerState snapshot for actor
```

#### `0303` — Missile Destroy Target

```
- Increment actor.targetsDestroyed
- Earn +5 SP for actor (capped at 99)
- Decrement actor.missiles by 1
- Record GamePlayerState snapshot for actor
```

#### `0B03` — Base Award

```
- Increment actor.targetsDestroyed
- No SP (post-elimination award, not an in-game action)
```

#### `0201`, `0202`, `0203`, `0300`, `0301`, `0304`, `0900`, `0902`

No state changes required. Skip.

---

### Elimination handling

When a player's lives reach 0 or below:

```
- Set player.isEliminated = true
- Set player.eliminatedAt = current event timestamp
- Increment actor.eliminatedOpponent or actor.eliminatedTeam
- If target is Medic: increment actor.eliminatedOpponentMedic or actor.eliminatedTeamMedic
- Note: nuke eliminations (0405) count toward actor.eliminatedOpponent but NOT actor.eliminatedTeam — friendly nukes cannot eliminate teammates
- Check if all players on the target's team are now eliminated → team elimination event
  - If 60 seconds or fewer remain in the game: game runs to time, outcome = elimination
  - If more than 60 seconds remain: game ends immediately, outcome = elimination
```

---

### Uptime and downtime accumulation

```
On transition TO state 0:
  - The period in states 3+2 just ended
  - Duration = current timestamp - timestamp when state 3 began
  - If deactivationCause = 'resupply': add to resupplyDowntime
  - If deactivationCause = 'other': add to otherDowntime

While in state 0:
  - Do not accumulate uptime continuously — calculate at the end
  - On transition OUT of state 0 (to state 3): record stateEnteredAt
  - At mission end (or player elimination): add (endTime - stateEnteredAt) to uptime for players currently in state 0

Consistency check: uptime + resupplyDowntime + otherDowntime = total game time for this player
Total game time = player.endTime - missionStartTime
```

---

### SP rules

- Heavy Weapons: SP is always 0, never increments, stored as null in Scorecard
- All other positions: cap at 99 on every increment — `sp = Math.min(99, sp + earned)`
- SP earning events:
  - `0205` or `0206` hitting an opponent: +1
  - `0306` Commander missile hitting an opponent: +2 (Commander only per the spec — but actually any position can fire a missile in theory; apply +2 whenever a missile hits an opponent)
  - `0204` or `0303` destroying a target: +5
- SP spending: deduct at the moment the ability is activated (`0400`, `0404`, `0510`, `0512`)
- `spEarned` tracks total SP earned before capping — i.e. the running capped accumulator, not the theoretical uncapped total. When sp would exceed 99, spEarned only gets credit for the amount that actually accrued.

---

### Double resupply detection

Track `receivedAmmoResupplyThisCycle` and `receivedLivesResupplyThisCycle` on each player. Both flags reset to `false` when the player transitions to state 3. When either flag is set to `true`, check if the other is already `true` — if so, this is a double resupply. Increment `doubleResuppliesGiven` on both the Ammo Carrier and the Medic who completed the pair.

To find the Medic who gave the lives resupply (or the Ammo Carrier who gave the ammo resupply) when the second resupply arrives, track `lastAmmoResuppliedBy` and `lastLivesResuppliedBy` on the target player state object.

---

### Rapid fire windows

Rapid fire begins on `0400` and ends on the next `0500` targeting this Scout. During the window, tag every `0205`/`0206` event where the actor is this Scout as occurring during rapid fire, incrementing the `DuringRapid` stat columns. Track `shotsFiredDuringRapid` by counting `0205`, `0206`, and `0201` (misses) events by this actor while `isRapidFire = true`.

---

### Score

Do not compute score from events. Read the authoritative final score from line type 6 `score` field for each entity and store it on the Scorecard. Use line type 5 entries only for `GamePlayerState.score` snapshots during replay — read the `new` field from the line type 5 entry at each event's timestamp.

---

### Game outcome

After processing all events:

```
- If any team has eliminated = true: outcome = 'elimination'
- Else if all competing teams have equal score: outcome = 'draw'
- Else: outcome = 'score'

Winner determination:
- Eliminated team always loses regardless of score
- Otherwise highest score wins
- Equal scores = draw

GameTeam.result:
- 'win', 'loss', or 'draw' for competing teams
- null for Neutral team

GameTeam.elimination_bonus:
- 10000 if this team won by elimination
- 0 otherwise
- null for Neutral team
```

---

## Phase 3 — Insertion (`ingester.ts`)

Takes the fully computed game object from Phase 2 and writes to the database in a single transaction. Insert in this exact order to satisfy FK dependencies:

```
1.  upsertCenter
2.  upsertPlayer (one per player entity with iplId)
3.  insertGame
4.  insertGameTeams (bulk)
5.  upsertBattlesuit (one per distinct battlesuit name)
6.  upsertTarget (one per target entity)
7.  insertGameTargets (bulk)
8.  insertGameReferees (bulk)
9.  insertScorecards (bulk) — all players
10. insertGamePlayerInteractions (bulk) — all ordered pairs
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
18. Move TDF file to archive bucket with renamed key
```

---

## MVP Calculation (`mvp.ts`)

Query the active `MvpModel` (where `retiredAt` is null) before the transaction. Calculate MVP points for each player using the formula in `MvpModel.parameters`. Store results as `ScorecardMvp` rows (one per component per player) and set `Scorecard.mvp_points` and `Scorecard.mvp_model_id`.

The MVP formula and component table are fully specified in `SM5_Core_Schema.md` under the `MvpModel` and `ScorecardMvp` sections. Implement the formula exactly as documented. Key notes:

- Accuracy input is `ceil(accuracy × 100)` — ceiling to nearest whole percent
- `elimination_bonus` component: applies only if this player's team won by elimination; input value is seconds of game time remaining above the 3-minute threshold at the moment of elimination
- `score_bonus` threshold and multiplier are position-specific — read from the position-specific section of the parameters JSON
- `eliminated` component does not apply to Medic
- All components are stored for every player — zero-value rows are included, the UI filters them

---

## Consistency Checks

Use line type 7 (sm5Stats) as a consistency check during development. After Phase 2, compare computed values against sm5Stats fields before inserting. Log warnings on mismatches — do not throw, as the event stream is authoritative and line type 7 may have edge case discrepancies. Fields to cross-check:

| sm5Stats field | Scorecard column |
|---|---|
| `shotsHit` | `shots_hit` |
| `shotsFired` | `shots_fired` |
| `timesZapped` | `times_hit` |
| `timesMissiled` | `times_hit_by_missile` |
| `missileHits` | `missile_hits` |
| `nukesDetonated` | `nukes_detonated` |
| `nukesActivated` | `nukes_activated` |
| `nukeCancels` | `nukes_canceled` |
| `medicHits` | `shots_hit_opponent_medic` |
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

Also: `Scorecard.score` must equal `Game.entityEnds[id].score`. `Scorecard.targets_destroyed` must equal the count of `GameTargetDestruction` rows for this scorecard where method is `shot` or `missile`.

---

## Error Types

Chomper distinguishes three error categories for job status:

| Category | status | Examples |
|---|---|---|
| Skip | `skipped` | Mission type != 5, duplicate game already ingested, non-SM5 entity types only |
| Parse error | `failed` | Malformed TDF, unreadable encoding, missing required line types |
| Ingest error | `failed` | Database constraint violation, transaction failure, unexpected state |

Both `failed` categories store `error_message` and stack trace on the `ChomperJob` row.

---

## Reference Documents

The following documents are authoritative and should be consulted for any ambiguity:

- `TDF_Specification.md` — complete TDF format, all line types, all event codes, version-gated features
- `Scorecard_Specification.md` — full definition of every Scorecard column including derivation logic
- `SM5_Core_Schema.md` — complete database schema, all tables, MVP formula, GamePlayerState structure
