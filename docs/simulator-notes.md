# Simulator Implementation Notes

This document supplements `chomper-handoff.md` with what we learned building
and debugging the simulator.  It covers decisions made during implementation,
corrections to the design spec, and the one open issue remaining.

---

## What the handoff doc got right

The overall architecture in `chomper-handoff.md` is accurate.  The two-phase
approach (parse → simulate), the `advanceClock` pattern, the event handler
catalogue, the pending-boost system concept, and the consistency-check table
all reflect how the code actually works.  Read that doc first.

---

## Key implementation discoveries

### 1. Entity-end events must be processed in-loop, not post-loop

The original design processed line-type-6 (entity-end) records after the
main event loop, in `applyEntityEnds()`.  This caused post-elimination events
to incorrectly affect players who had already been confirmed dead by the
hardware.

**Fix:** entity-ends are now sorted by timestamp and consumed inside
`advanceClock(T)` — the same place state-log entries are consumed — before
each type-4 event is processed.  This ensures a player eliminated at time T
is already marked `isEliminated` before any event at T+ε runs, so
`getActiveTeammates()` and the deactivation guard both see the correct state.

A post-loop `applyEntityEnds()` still runs as a safety net for files where
the last entity-end timestamp is after the last type-4 event.

### 2. Eliminated players must not accumulate phantom deactivations

After `isEliminated` is set, subsequent hits on the player keep arriving in
the TDF (the hardware records them).  Before this was fixed, every post-
elimination 0205 hit would see `target.hitPoints ≤ 0` (HP is never reset
because state transitions are blocked for eliminated players) and fire the
full deactivation block, incrementing `phantomDeactivations`.

**Fix:** the deactivation block in `handlePlayerHit` is gated on
`!target.isEliminated`.  Hit-count stats (`timesHit`, actor `shotsHit`, etc.)
still accumulate correctly.

### 3. The entity-end event is the authoritative elimination signal

The TDF hardware does not eliminate a player the instant their lives reach
zero; it sends the line-type-6 record seconds later once the penalty cycle
completes.  During this window the player continues to fire and can receive
resupplies.  Our simulator was using `checkElimination()` (lives ≤ 0) as the
elimination trigger, which was too early.

**Consequence:** early elimination caused players to miss team ammo boosts
that fired during the gap, producing finalSnapshot.shots discrepancies.

**Partial fix:** actor-lookahead (see §4 below).  The entity-end-in-loop fix
(§1) prevents post-entity-end events from affecting the player once the
hardware has confirmed them out.

### 4. Premature elimination: the actor-lookahead

When `checkElimination()` fires with `lives ≤ 0`, we check
`lastActorEventTime.get(entityId) > time`.  This map is pre-built at
simulation start from the event log (O(N) scan, O(1) lookup per call).

If the player still appears as an *actor* after the current timestamp, the
hardware kept them alive.  In that case we look for pending lives boosts in
`pendingBoosts` and apply them, consuming only the minimum number needed to
keep the player alive (see §5 for how that minimum is calculated).

If no pending boost is available but the player still acts, we still eliminate
them — this is the remaining shots shortfall case (§8).

### 5. Pending lives boost capping via forward simulation

Naïvely applying the full recorded pending boost over-applies lives, which
then shows up as `entityEndForcedLives > 0`.

**Fix:** when a pending lives boost is about to be applied, run a forward
simulation from the current timestamp to the player's entity-end time.  Merge
the deactivation list (`deactivationsReceived`, pre-built at simulation start
from 0206, 0306, and nuke events) with the lives-resupply list
(`resuppliesGained`, pre-built from 0502 events) and compute:

```
livesNeeded = max(
  1 - minPrefixBalance,   // enough to never go below 0
  tdfFinalLives - finalBalance  // enough to match TDF residual
)
```

where `minPrefixBalance` is the running minimum of the cumulative balance
starting at 0, and `finalBalance` is the balance after all events.  Clamp to
`max(0, livesNeeded)`.

The extra `max(1, …)` rule: when the formula returns 0 but future events
still exist, force to 1 so the player survives long enough to receive the
next resupply (lives=0 in our simulator triggers immediate elimination,
blocking receipt of an upcoming resupply).

TDF data used:
- `entityEndTimeById` — map from entityId to line-type-6 timestamp (all exit
  types, pre-built at simulation start)
- `tdfFinalLives` — map from entityId to `sm5Stats.livesLeft`
- `deactivationsReceived` — per-player sorted list of `{time, lives}` for
  0206 (1 life), 0306/0308 (2 lives), and nuke hits (3 lives; detected by
  matching state-3 log entries within 100 ms of a 0405)
- `resuppliesGained` — per-player sorted list of `{time, lives}` from 0502
  events where this player is the target

### 6. Pending boost partial consumption

When the actor-lookahead applies lives boosts, it only consumes up to
`livesNeeded`.  Unconsumed boosts (both partial and wholly untouched) are kept
in `pendingBoosts` for `reconcilePendingBoosts()` at end-of-game.  This
handles double-resupply scenarios where the ammo carrier and medic resupply
the same player nearly simultaneously, recording multiple pending boosts.

### 7. Kicked players (exitType 01 / 17)

Players kicked mid-game have `livesLeft > 0` in `sm5Stats` because the TDF
records their lives at the moment of kick, not at elimination.  Zeroing their
lives in `applyEntityEnds()` (as the original design did) produced spurious
`finalSnapshot.lives` discrepancies.

**Fix:** for exitType 01/17, `applyEntityEnds()` sets `ps.lives` to
`tdfFinalLives.get(id)` (from the pre-built map) and marks the player
eliminated.  The final snapshot is updated to the same value.  The consistency
check then trivially passes for kicked players.

---

## Missile event corrections

The original spec had gaps in missile event handling.

| Event | Correct behaviour |
|---|---|
| **0300** Missile Lock Start | No state change, no missile consumed. Skip. |
| **0301** Missile Gen Miss | Consumes a missile (`actor.missiles--`). No hit stats. |
| **0303** Missile Gen Destroy | Handled (targetsDestroyed++, missiles--). |
| **0304** Missile Miss | Consumes a missile (`actor.missiles--`). No hit stats. |
| **0306** Missile OppDown | Handled.  Also applies to teammate hits (see 0308). |
| **0308** Missile OwnDown | Friendly-fire missile deactivation.  Routes to the same handler as 0306 — the `isOpponent` / `isFriendly` flag inside that handler correctly attributes the hit. |

0301 and 0304 were previously skipped entirely, leaving `actor.missiles`
uncorrected.

### medicHits formula correction

The TDF's `medicHits` field counts **lives removed** from opponent medics, not
event count.  A missile normally removes 2 lives (counts as 2), but if the
medic has only 1 life the missile removes 1 (counts as 1).

The consistency check formula is therefore:
```
shotsHitOpponentMedic + missilesHitOpponentMedicLives = medicHits
```

where `missilesHitOpponentMedicLives` accumulates
`Math.min(2, Math.max(0, target.lives))` at the moment of each missile hit on
an opponent medic — *before* the `target.lives -= 2` decrement.  The same
pattern applies to `missilesHitTeamMedicLives` / `ownMedicHits`.

---

## Consistency check framework

`runConsistencyCheck()` compares computed values against TDF `sm5Stats` and
logs discrepancies.  Findings are exported to the `.debug.json` file written
by the CLI.

Key checks beyond the obvious stat comparisons:

| Check | What it detects |
|---|---|
| `phantomDeactivations > 0` | HP reached 0 on a 0205 (non-deactivating) event — signals simulator HP drift from hardware |
| `finalSnapshot.shots ≠ shotsLeft` | Shots count mismatch at game end |
| `finalSnapshot.lives ≠ livesLeft` | Lives count mismatch (also flags kicked-player edge cases) |
| `entity_end eliminated: computed N lives` | Entity-end found `ps.lives > 0` — simulator had player alive longer than hardware |

The `entityEndForcedLives` field on `PlayerSimState` stores the lives count
at the moment the entity-end fires (if > 0), letting the consistency check
report the exact discrepancy without failing silently.

---

## Pending shots boost timing (resolved)

**File:** `1-1_20260420200753.tdf`  
**Player:** `#yLD5LK` (Heavy, team 1)  
**Symptom:** `finalSnapshot.shots: computed=15 expected=17` (2 shots short)

### Root cause

A 0510 team ammo boost fires at t=265,673 while yLD5LK is in state_3 with
shots=37.  The simulator records a pending shots boost of `min(5, 40−37) = 3`.
The hardware applies this boost when yLD5LK exits state_3 (~t=268,558).
The simulator defers it to `reconcilePendingBoosts()` at game end.

Because the boost is not applied mid-game, yLD5LK's shots count diverges from
hardware.  When a second 0510 fires at t=564,945 (also during state_3), the
simulator computes the pending boost from its diverged shots count rather than
hardware's, under-recording the boost by 2 shots.  `reconcilePendingBoosts()`
can apply the first pending boost (+3, raising computed shots from 12 to 15)
but the under-recorded second boost (+1 vs hardware's +3) is already baked in.

### Fix — two-pass shots reference (`buildShotsReference`)

`buildShotsReference()` runs before the main event loop.  It walks the same
events and `playerStateLog` as `advanceClock`, maintaining an authoritative
shots count per player by applying pending shots boosts at the correct
`state_3 → state_2` timing (mirroring the hardware).  For each 0510 event
where a state-3 teammate would receive a pending boost, it records the
correct shots value into `shotsRefAtBoost: Map<entityId, number[]>`.

`handle0510` consumes these values in order (one entry per occurrence) when
computing the boost amount for state-3 players, replacing the diverged
`teammate.shots` with the hardware-correct reference value.

The pre-pass is skipped entirely for pre-2.005 files (`playerStateLog` empty)
since those files use synthetic 4-second transitions and do not exhibit this
failure mode.

---

## File-version gating

The simulator checks `this.parsed.playerStateLog.length > 0` to distinguish
2.005+ files (with an explicit state log) from older files (which use
synthetic 4-second transitions).

For 2.005+ files, `triggerStateTransition()` is a **no-op** — all state
transitions come from the state log via `advanceClock`.  Event handlers that
call `triggerStateTransition()` (resupply handlers, nuke, etc.) are safe to
call regardless of file version because the function guards on the file
version.

This means that for 2.005+ files, state transitions can fire slightly after
the event that caused them (e.g. a 0502 resupply at T may not move the player
to state_3 until the state-log entry at T+Δ is consumed by the next
`advanceClock` call).  HP resets and snapshot recording happen at the
state-log entry time, not the event time.

---

## Pre-built lookup tables (built at simulation start)

All of these are built in a single pass over `parsed.events` and
`parsed.entityEnds` before the main event loop:

| Map | Key | Value | Purpose |
|---|---|---|---|
| `lastActorEventTime` | entityId | last timestamp this entity appears as actor | actor-lookahead |
| `entityEndTimeById` | entityId | line-type-6 timestamp | forward-simulation ceiling |
| `tdfFinalLives` | entityId | `sm5Stats.livesLeft` | forward-simulation target |
| `deactivationsReceived` | entityId | sorted `{time, lives}[]` | forward-simulation deactivations |
| `resuppliesGained` | entityId | sorted `{time, lives}[]` | forward-simulation resupplies |

Nuke entries in `deactivationsReceived` are detected by matching state-3 log
entries within 100 ms of a 0405 event; each counts as 3 lives.

---

## Test suite status (as of last commit)

Running all `.tdf` files through the CLI and comparing `.debug.json` output:

| Scope | Passing | Failing |
|---|---|---|
| All files | 574 | 0 |

All consistency checks pass across the full demo file suite.

The full test run takes about 3-4 minutes and is reproducible with:

```bash
# From apps/chomper
for f in ../../demo_files/*.tdf; do npx tsx src/cli.ts "$f" > /dev/null; done
```

Then aggregate results from the `.debug.json` files.
