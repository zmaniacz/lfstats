# Laserball Chomper Design

## Overview

Laserball ingestion lives **inside the chomper package** (`apps/chomper/src/laserball/`) and
reuses chomper's three-phase architecture (parse → simulate → ingest). The parser, the shared
identity upserts, the shared `game` table, and the Lambda/CLI/bulk entry points are shared with
SM5; only the **event semantics** (the stat simulation) and the destination tables differ.

Laserball is a distinct game mode with no lives, no shot limits, and no roles. Games end in a
**score** victory or a **draw**. The stat set is a faithful port of the European reference
implementation, `demo_files/laserball-code/process_logs.php`, which is the authoritative spec for
every computation.

See also: [Laserball_TDF_Spec.md](Laserball_TDF_Spec.md),
[Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md), and the SM5
[chomper-design.md](chomper-design.md) for the shared infrastructure.

## Repository Structure

```
apps/chomper/src/
  parser.ts                 # shared — line 9 admitted for non-SM5 regardless of file version
  laserball/
    types.ts                # constants (mission type 28, $CONF windows, event codes) + interfaces
    simulator.ts            # Phase 2 — port of process_logs.php §5–7 + replay emission
    ingester.ts             # Phase 3 — writes lb_ tables in one transaction
  index.ts / cli.ts / test-suite.ts / bulk-ingest.ts   # routing by mission type
packages/db/src/
  schema.ts                 # lb_game_team, lb_scorecard, lb_game_event,
                            #   lb_game_player_state, lb_game_player_interaction
  queries/laserball.ts      # lb_ insert helpers (shared upserts reused from queries/chomper.ts)
```

## Routing by Mission Type

All entry points dispatch on `parsed.meta.missionType`: `5` → SM5 pipeline, `28`
(`LASERBALL_MISSION_TYPE`) → laserball pipeline, anything else → skipped.

- **`index.ts`** (Lambda): after the shared player/duplicate checks, branches into
  `simulateLaserball` → `ingestLaserball`. No MVP model and no line-7 consistency check; instead
  it asserts the goals↔line-5-score invariant and fails on mismatch.
- **`cli.ts`**: `pnpm ingest <file.tdf>` runs parse+simulate for laserball and writes a
  `.debug.json` (no DB).
- **`test-suite.ts`**: scans both `demo_files/` (SM5) and `demo_files/laserball/`. For laserball
  it passes a game when the goal invariant holds; HTML 404 pages are detected and skipped.
- **`bulk-ingest.ts`**: ingests laserball from S3 with the same goal-invariant gate.
- **`bulk-reingest.ts`**: SM5-only (it preserves SM5-specific metadata); laserball is skipped.

## Phase 1 — Parsing (shared `parser.ts`)

No laserball-specific parser is needed. The generic line parsers produce a `ParsedTdf` whose
`events` array carries `{ time, type, actor, target, description }` for every line type 4 event,
and whose `playerStateLog` carries line type 9 transitions. Two facts make this work:

- Laserball player entities have `category === 0`, so the "player entities but no scorecard"
  rejection (`parser.ts`) does not fire, and `buildEntityRouting` (which only considers
  `category > 0`) produces empty routing.
- The line type 9 version gate was widened: line 9 is admitted when
  `fileVersion >= 2.005 || missionType !== 5`. This keeps SM5 behaviour identical while letting
  laserball (`2.005`/`2.006`) state logs through. `2.004` laserball files simply have no line 9.

## Phase 2 — Simulation (`laserball/simulator.ts`)

`simulateLaserball(parsed): SimulatedLbGame` is a near-line-for-line port of
`process_logs.php` §5–7. Key mechanics:

### Unified event/state timeline

The PHP processes line 4 and line 9 lines in one document-ordered pass. The parser splits them
into `events` and `playerStateLog`; `buildTimeline()` re-merges them by raw time
(event-before-state on ties). Line 9 timestamps are strictly at-or-after their triggering action,
so this recovers document order.

### Time smoother

Ported verbatim (php:271-319): a running offset corrects negative time jumps (`+= lastRaw`) and
large (>60s) forward gaps (`-= gap-1000`), applied across the merged stream.

### Player discovery & teams

Player entities define team membership. The two competing teams are the first two team indices
that contain players (php:155-162); all other teams (e.g. Neutral) get `score`/`result` of null.

### Ball possession

A single `currentHolder` is tracked across `1107`/`1100`/`1109`/`1103` (gain) and
`1101`/`1102`/`1106`/`1108`/`0101` (loss); `possession_time_ms` accrues per holder, with a final
flush at the smoothed end time (php:357-376, 624-627).

### State machine

Line 9 drives per-player `status` and the `state0/2/3` counters, and derives
`dynamicRespawnTime` from the first state-3→state-0 gap (php:321-345). When line 9 is absent
(`2.004`), `status` stays 0 and `dynamicRespawnTime` is null.

### Event handlers

The PHP if/else-if structure is preserved exactly: round start/end & match reset; miss; target
resets; get-ball; pass/clear; steal; failed clear (incl. cooldown-adjusted `failed_clears_calc`,
`bad_attacks_fc`, and the inactive-clear penalty + `no_clear_blocks`); block (reset vs normal,
`blocks_with_ball`, `block_serie_max`, `clutch_saves`, `reset_point`); the standalone
futile-attack evaluator; and the goal handler (assist/clear-assist chain, `big_goals`,
`defense_score`, `blocks_before_goal`, `futile_attacks_goal`, `pass_over_opponent`,
`no_clear_goal`). `big_mid` combos and `registerAggressiveAction` mirror php:281-292.

Per-stat definitions and PHP line references are in
[Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md).

### Replay emission (extension beyond the PHP)

For each meaningful event (everything except `0201` misses and `0900–0902` achievements) the
simulator records an `LbSimEvent` and, for the involved actor/target, a per-player snapshot
(`state`, `has_ball`, running `score`). This mirrors SM5's targeted snapshot approach.

### Output: scores, outcome, filtering

Team scores are the sum of each team's players' goals; outcome is `score` (unequal) or `draw`
(equal). Persisted players are those on a competing team with >30s playtime (php:646). The
result also carries a `goalCheck` comparing per-team goal totals against line-5 score-event
totals.

## Phase 3 — Insertion (`laserball/ingester.ts`)

A single transaction writes, in FK-safe order:

1. `upsertCenter` (shared)
2. `upsertPlayer` per `#…` player entity (shared; sorted for deadlock-safe locking)
3. `insertGame` (shared `game`, `type = "lb"`, `exclude = outcome === "aborted"`)
4. `insertLbGameTeams` (competing teams + Neutral)
5. `upsertBattlesuit` per battlesuit (shared)
6. `insertLbScorecards` (persisted players)
7. `insertLbGamePlayerInteractions` (ordered actor→target steals/blocks/passes)
8. `insertLbGameEvents` (returns UUIDs for snapshot linkage)
9. `insertLbGamePlayerStates` (chunked; the largest table)
10. `upsertPlayerCallsignHistory` (shared)

Shared identity upserts come from `packages/db/src/queries/chomper.ts`; lb-specific inserts from
`packages/db/src/queries/laserball.ts`.

## Validation

Laserball TDFs have **no line type 7**, so there is no SM5-style stat-by-stat consistency check.
Validation uses:

- **Goal invariant**: per-team goal totals must equal per-team line-5 score-event totals. Asserted
  in the Lambda/bulk paths and reported by the CLI and test-suite. Across the 207-game sample
  corpus this holds for every game.
- **Graceful non-TDF handling**: downloaded HTML 404 pages are detected and skipped, not crashed.
- **Parity spot-checks**: hand-comparison of core stats (goals, assists, steals, blocks, clears,
  possession time) against the raw events; the PHP remains the reference for the heuristic stats,
  which have no file-based ground truth.

To validate end-to-end DB writes: `pnpm db:migrate`, then ingest a few files and query
`lb_scorecard`, `lb_game_team`, `lb_game_event`, and `lb_game_player_state`, confirming
`game.type = 'lb'` and a correct outcome.
