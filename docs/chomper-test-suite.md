# Chomper Test Suite

## Overview

The chomper test suite ingests every TDF file in `demo_files/` and verifies that the parser and simulator produce consistent output. It does not touch the database — it runs Phase 1 (parse) and Phase 2 (simulate) only, then validates the `.debug.json` output written next to each TDF file.

## Running the Tests

```bash
pnpm --filter chomper run test
```

Or from `apps/chomper` directly:

```bash
node_modules/.bin/tsx src/test-suite.ts
```

## What It Does

1. Deletes any stale `.debug.json` files from `demo_files/` before starting.
2. Reads every `*.tdf` file in `demo_files/` (sorted alphabetically).
3. For each file:
   - Runs Phase 1 (`parseTdf`) and Phase 2 (`simulate` + `runConsistencyCheck`)
   - Writes `<filename>.debug.json` alongside the TDF file
   - Reports `PASS`, `FAIL`, or `SKIP` for each file
4. Writes a timestamped log file to `apps/chomper/logs/` with the full run summary.
5. Exits with code 1 if any file fails; code 0 if all pass or skip.

## Pass / Fail / Skip Criteria

| Result | When |
|---|---|
| `PASS` | `consistencyCheck.discrepancies` is empty, **or** the file threw a `RejectionError` (structurally invalid game — correctly identified and rejected) |
| `SKIP` | Mission type is not 5 (non-SM5 game) |
| `FAIL` | `consistencyCheck.discrepancies` is non-empty, or an unexpected parse/simulation error |

A `RejectionError` (e.g. player registered on multiple teams) is treated as `PASS` because the parser correctly identified the file as invalid. Only unexpected errors or consistency discrepancies are failures.

## Debug Output

Each `*.tdf` file produces a `*.debug.json` alongside it:

```json
{
  "consistencyCheck": {
    "passed": true,
    "discrepancies": [],
    "ghostShots": [],
    "warnings": []
  },
  "events": [...],
  "playerStates": { ... }
}
```

- `discrepancies` — array of objects describing each mismatch between computed stats and TDF `sm5Stats` (line type 7). Non-empty means `FAIL`.
- `ghostShots` — shots-related anomalies that don't produce a discrepancy but indicate edge cases.
- `warnings` — informational notes about edge cases encountered during simulation.
- `events` — the full simulated event list with indices, for replay debugging.
- `playerStates` — per-player computed state including all stat accumulators and the full state snapshot history, side-by-side with the TDF `sm5Stats` for comparison.

These files are gitignored and regenerated on every test run.

## Single-File Testing

To quickly check parse + simulate on one file without running the full suite:

```bash
pnpm --filter chomper run ingest <path/to/file.tdf>
```

This runs Phase 1 (parse) and Phase 2 (simulate + consistency check) and writes a `.debug.json` next to the TDF file. **It does not touch the database** — it is identical in coverage to the test suite, just scoped to one file.

> **Note:** The `pnpm ingest` root script passes its argument directly to the chomper package, but path handling can be unreliable on Windows. Running `pnpm --filter chomper run ingest` from the repo root with a relative path (e.g. `../../demo_files/foo.tdf`) or from `apps/chomper` directly is more reliable.

There is no single-file tool that tests Phase 3 (database ingest). To verify DB ingestion end-to-end, the file must go through the Lambda handler (e.g. via a bulk-ingest run against S3).

## Adding New Test Files

Drop any SM5 `.tdf` file into `demo_files/` and it will automatically be included in the next test run. Non-SM5 files are silently skipped.

## Log Files

Each run writes a log to `apps/chomper/logs/test-suite-<timestamp>.log` with the full list of passes, skips, and failures. These are useful for comparing results across runs when diagnosing regressions.
