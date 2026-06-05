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
The specs live in /docs:
- TDF_Spec.md — raw game log file format
- Scorecard_Table_Spec.md — per-player stat definitions
- Core_Schema.md — full database schema spec
- chomper-design.md — chomper architecture, parsing, simulation, and ingest design
- chomper-test-suite.md — how to run the chomper test suite

## Skills
- shadcn/ui — `npx skills add https://github.com/shadcn/ui --skill shadcn`
- Load this skill before any UI work in apps/web.

## Database Conventions
- All timestamps stored as local time (no UTC conversion)
- Position-specific nullable columns: null = not applicable, 0 = applicable but zero
- See SM5_Core_Schema.md for full table definitions

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