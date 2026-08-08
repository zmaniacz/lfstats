# LFstats Documentation

Specifications and design docs for the LFstats monorepo. Start here.

## Which doc do I need?

| I want to…                                 | Read                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Understand a raw `.tdf` game log           | [TDF_Spec.md](TDF_Spec.md)                                                     |
| Understand a Laserball `.tdf`              | [Laserball_TDF_Spec.md](Laserball_TDF_Spec.md) (a delta — read TDF_Spec first) |
| Look up a database table or column         | [Core_Schema.md](Core_Schema.md)                                               |
| Look up an SM5 per-player stat             | [Scorecard_Table_Spec.md](Scorecard_Table_Spec.md)                             |
| Look up a Laserball per-player stat        | [Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md)         |
| Work on tournaments, standings, or rosters | [Competition_Structure.md](Competition_Structure.md)                           |
| Change how TDFs are parsed or simulated    | [chomper-design.md](chomper-design.md)                                         |
| Change Laserball ingestion specifically    | [chomper-design.md](chomper-design.md#laserball-pipeline-mission-type-28)      |
| Run or debug the ingestion tests           | [chomper-design.md](chomper-design.md#test-suite)                              |
| Add or change a public API route           | [API.md](API.md)                                                               |
| Understand who can do what in the app      | [Role_Spec.md](Role_Spec.md)                                                   |
| Deploy the web app, or debug a build       | [build-and-deploy.md](build-and-deploy.md)                                     |

---

## By area

### File formats

- **[TDF_Spec.md](TDF_Spec.md)** — the raw game log format. All line types, all event codes,
  version-gated features, and the SM5 game rules the format encodes.
- **[Laserball_TDF_Spec.md](Laserball_TDF_Spec.md)** — Laserball's deltas to the above: mission
  type 28, its own line type 4 event codes, and no line type 7.

### Database schema

- **[Core_Schema.md](Core_Schema.md)** — SM5 core tables: identity, game structure, non-player
  entities, penalties, performance, MVP, and replay data. `game` is shared with Laserball and is
  specified here.
- **[Scorecard_Table_Spec.md](Scorecard_Table_Spec.md)** — every `sm5_scorecard` column, its source
  (line type 7 vs derived), and its position-specific null rules.
- **[Laserball_Scorecard_Table_Spec.md](Laserball_Scorecard_Table_Spec.md)** — every `lb_scorecard`
  column, with references to the PHP reference implementation.
- **[Competition_Structure.md](Competition_Structure.md)** — competition, team, roster, round,
  pool, and match tables; points derivation; mercenary rules.
- **[SM5-penalty-definitions.md](SM5-penalty-definitions.md)** — standard penalty types and their
  default score and MVP impact.

### Ingestion (chomper)

- **[chomper-design.md](chomper-design.md)** — the whole ingestion package in one place: the
  three-phase architecture (parse → simulate → insert), the SM5 state machine, consistency checks,
  MVP calculation, every CLI entry point, and the test suite. Two sections worth knowing by name:
  - [Laserball pipeline](chomper-design.md#laserball-pipeline-mission-type-28) — the mission-type-28
    path that shares this package: what is reused, what diverges, and how validation works without
    a line type 7.
  - [Test suite](chomper-design.md#test-suite) — running the corpus tests and reading
    `.debug.json` output.

### Application

- **[API.md](API.md)** — public API routes, response shapes, auth, and conventions for new routes.
- **[Role_Spec.md](Role_Spec.md)** — the `superAdmin` / `admin` / `centerAdmin` / `uploader`
  hierarchy, center scoping, and the permission matrix.

### Operations

- **[build-and-deploy.md](build-and-deploy.md)** — the web app's Docker build, GHCR push, and
  self-hosted runner deploy, plus common build errors.
- **[../apps/chomper/README.md](../apps/chomper/README.md)** — chomper's AWS SAM deployment and
  its Secrets Manager secret shape.
- **[../scripts/google-drive-sync/README.md](../scripts/google-drive-sync/README.md)** — the Apps
  Script that syncs each site's Google Drive folder into the S3 incoming bucket. Explains the
  competition-slug-as-subfolder convention that populates `game.competition_id` at ingest.

---

## Conventions

- Table and column names in these docs use the **database** spelling (`sm5_scorecard`,
  `competition_match_game`), not the Drizzle camelCase export names.
- All timestamps are stored and documented as **center-local time**. There is no UTC conversion
  anywhere in the stack.
- Position-specific nullable columns follow one rule throughout: **null means the stat does not
  apply to that position**; `0` means it applies and the player recorded zero.
