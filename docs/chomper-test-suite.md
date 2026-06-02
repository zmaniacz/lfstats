# Chomper Test Suite

## Overview

The chomper test suite ingests every TDF file in `demo_files/` and verifies that the parser and simulator produce consistent output. It does not touch the database — it runs the parse and simulate phases only and validates the `.debug.json` output that `cli.ts` writes next to each TDF file.

## Running the tests

```
pnpm --filter chomper run test
```

Or from the repo root you can also run it directly:

```
cd apps/chomper && node_modules/.bin/tsx src/test-suite.ts
```

## What it does

1. Reads every `*.tdf` file in `demo_files/` (sorted alphabetically).
2. For each file, runs Phase 1 (parse) and Phase 2 (simulate) inline using the same `parseTdf`, `simulate`, and `runConsistencyCheck` functions as the CLI, then writes `<filename>.debug.json` alongside the TDF file.
3. Reads `consistencyCheck` — the first object in the `.debug.json`:
   - `consistencyCheck.passed` must be `true`
   - `consistencyCheck.discrepancies` must be an empty array
4. Prints `PASS`, `FAIL`, or `SKIP` for each file with a reason on failure.
5. Exits with code 1 if any file fails; code 0 if all pass.

## Pass criteria

A file passes when the simulator's computed stat values match the authoritative `sm5Stats` (line type 7) values from the TDF exactly. The full list of checked fields is in `docs/chomper-handoff.md` under **Consistency Checks**.

## Debug output

Each `*.debug.json` file in `demo_files/` contains:

```json
{
  "consistencyCheck": {
    "passed": true,
    "discrepancies": []
  },
  "playerStates": { ... }
}
```

`discrepancies` is an array of objects describing each mismatch when `passed` is `false`. These files are gitignored and regenerated on every test run.

## Adding new test files

Drop any SM5 `.tdf` file into `demo_files/` and it will automatically be included in the next test run.
