# Laserball TDF Spec (delta to TDF_Spec.md)

**Game Type:** Laserball

Laserball TDF files share the same overall structure as SM5 (see [TDF_Spec.md](TDF_Spec.md)).
This document records only the **differences**. Line types `0`, `2`, `3`, `5`, `6`, and `9` are
parsed identically to SM5; only the line type `1` mission code and the line type `4` event
codes differ.

## Mission Type (Line Type 1)

| Field      | Laserball value                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `type`     | **`28`** (`Laserball Ranked`). SM5 is `5`. Files whose mission type is neither `5` nor `28` are ignored during ingestion. |
| `duration` | Scheduled game length in ms (typically `900000`). Same semantics as SM5.                                                  |

Observed file versions: `2.004`, `2.005`, `2.006`.

## No Line Type 7 (no post-game scorecard)

Laserball TDFs **do not contain line type 7** (`sm5-stats`). There is therefore no
hardware-provided per-player scorecard to validate against. All per-player statistics are
derived entirely by simulating the line type 4 event stream. Validation instead relies on a
derivable invariant: **per-team goal totals must equal the number of line type 5 score events
for that team's players** (see below).

## Line Type 9 (player state) availability

Line type 9 state logs appear in `2.005`/`2.006` files and are **absent in `2.004`** files.
Unlike SM5 (where pre-`2.005` line 9 is an unreliable test artefact and is discarded), the
laserball simulator consumes line 9 whenever present. The parser admits line 9 for any non-SM5
mission type regardless of file version. In `2.004` files (no line 9) the simulator runs without
state information — player `status` stays `0` and `dynamicRespawnTime` falls back to the default
`FAILED_CLEAR_COOLDOWN`, matching the reference PHP behaviour.

States: `0` = active, `1`/`2` = down/resettable, `3` = down (deactivated).

## Line Type 4 — Events

Laserball uses a distinct set of 4-character event codes. The line layout is identical to SM5
(`4 <time> <code> <actor> <verb-phrase> <target>`), so the generic actor/verb/target tokenizer
applies. Codes observed in the sample corpus:

| Code                 | Name                      | Example payload            | Meaning                                                                                                                     |
| -------------------- | ------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `0100`               | Mission Start             | `* Mission Start *`        | Start of gameplay (t=0).                                                                                                    |
| `0101`               | Mission End / Match Reset | `* Mission End *`          | End of gameplay; also resets all player `status` to 0. Actual duration = this timestamp.                                    |
| `0201`               | Miss                      | `actor misses`             | A shot that hit nothing. Very high volume (~75% of events). Counted as `misses`; **not** stored in the replay event log.    |
| `1100`               | Pass                      | `actor passes to target`   | Ball passed to a teammate.                                                                                                  |
| `1101`               | Goal                      | `actor scores!`            | Actor scored a goal. Emits one line type 5 score event. (`1102` is also treated as a goal for safety; not seen in samples.) |
| `1103`               | Steal                     | `actor steals from target` | Actor took the ball from an opponent.                                                                                       |
| `1104`               | Block                     | `actor blocks target`      | Actor tagged/blocked a player.                                                                                              |
| `1105`               | Round Start               | `★ Round Start ★`          | Start of a possession round.                                                                                                |
| `1106`               | Round End                 | `★ Round End ★`            | End of a round; clears possession tracking.                                                                                 |
| `1107`               | Get Ball                  | `actor gets the ball`      | Actor gained possession at round start.                                                                                     |
| `1108`               | Ball Timeout              | —                          | Ball held too long; possession ends.                                                                                        |
| `1109`               | Clear                     | `actor clears to target`   | Defensive clear/pass.                                                                                                       |
| `110A`               | Failed Clear              | —                          | A clear attempt that failed.                                                                                                |
| `110B`               | Target Reset (self)       | —                          | Actor reset their own target.                                                                                               |
| `110C`               | Target Reset (player)     | —                          | Target player was reset.                                                                                                    |
| `0900`/`0901`/`0902` | Achievement               | —                          | Informational; not interpreted, not stored.                                                                                 |

## Line Type 5 — Score

Same layout as SM5 (`5 <time> <entity> <old> <delta> <new>`). In Laserball each goal (`1101`)
emits exactly one line type 5 event with `delta = 1` for the scoring player. Summing line-5
deltas per team yields each team's goal total — the simulator cross-checks this against the
goal counts it accumulates from `1101`/`1102` events.

## Win Condition

A game ends in a **score** victory (higher team goal total) or a **draw** (equal totals).
There is no elimination outcome. Outcome and per-team `win`/`loss`/`draw` results are computed
from the team goal totals.
