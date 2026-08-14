# LFstats.com

## Project Overview

TypeScript monorepo tracking Space Marines 5 (SM5) laser tag games.
Parses TDF files into a Postgres database and serves stats via a Next.js web app.

## Monorepo Structure

- `apps/web` — Next.js 16 frontend with shadcn/ui
- `apps/chomper` — TDF file ingestion CLI/service
- `packages/db` — Shared Drizzle ORM schema and query helpers

## Tech Stack

- Runtime: Node.js 24+
- Language: TypeScript (strict mode)
- Framework: Next.js 16 (App Router)
- Database: Postgres 18, Drizzle ORM
- UI: shadcn/ui (Tailwind)
- Package manager: pnpm
- Monorepo: Turborepo

## Key Domain Documents

The specs live in /docs — see [docs/README.md](docs/README.md) for the full index.

**File formats**

- TDF_Spec.md — raw game log file format
- Laserball_TDF_Spec.md — Laserball-specific TDF deltas (events, no line 7)

**Schema**

- Core_Schema.md — SM5 core database schema
- Scorecard_Table_Spec.md — per-player stat definitions
- Laserball_Scorecard_Table_Spec.md — per-stat definitions for the lb_scorecard table
- Competition_Structure.md — competition/tournament tables, standings, mercenary rules
- Player_Rating.md — the global player ranking: model, why MVP is excluded, schema, recompute
- SM5-penalty-definitions.md — penalty types and their default score/MVP impact

**Ingestion**

- chomper-design.md — chomper architecture, parsing, simulation, and ingest design for both game
  modes, plus the CLI entry points and the test suite

**App and operations**

- API.md — public API routes reference
- Role_Spec.md — the four-level role hierarchy and permission matrix
- build-and-deploy.md — web app Docker/GHCR build and self-hosted deploy

## Skills

- shadcn/ui — `npx skills add https://github.com/shadcn/ui --skill shadcn`
- Load this skill before any UI work in apps/web.

## Database Conventions

- All timestamps stored as local time (no UTC conversion)
- Position-specific nullable columns: null = not applicable, 0 = applicable but zero
- See docs/Core_Schema.md for full table definitions

## File Headers

Every `.ts` and `.tsx` file must begin with these two lines:

```
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2015 Russell Lewis
```

Always insert this header when creating a new `.ts` or `.tsx` file.

## Commands

- `pnpm dev` — start web app in dev mode
- `pnpm db:migrate` — run migrations
- `pnpm ingest <file.tdf>` — ingest a TDF file
- `pnpm build` — build all apps
- `pnpm typecheck` — typecheck all packages
- `pnpm lint` — lint the whole monorepo in one oxlint pass (sub-second)
- `pnpm lint --fix` — apply oxlint's auto-fixes
- `pnpm format` — Prettier write across all packages

## Linting

Linting is [oxlint](https://oxc.rs), configured once at the repo root in `.oxlintrc.json`.
**There is no ESLint in this repo** — do not add it back, and do not add `@typescript-eslint`.
TypeScript 7 ships no JS compiler API (`import ts from "typescript"` yields only
`{ version, versionMajorMinor }`), so typescript-eslint hard-throws on import. oxlint has its
own parser and is unaffected by the TypeScript version.

- `correctness` is an **error**; CI fails on it (`.github/workflows/typecheck.yml`).
- Suppress with standard `// eslint-disable-next-line <rule>` comments — oxlint honours them.
  Always say _why_ in an adjacent comment; the existing suppressions are all cases where the
  rule's suggested fix would have introduced a bug.
- `apps/web/src/components/ui/**` is ignored (shadcn primitives, not ours to edit).
- Prettier still owns formatting; oxlint is not a formatter.
