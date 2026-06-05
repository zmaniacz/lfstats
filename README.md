# LFstats

A statistics tracking platform for Space Marines 5 (SM5) laser tag games. Parses raw game log files (TDF) into a Postgres database and serves player and game stats via a Next.js web app.

## What it does

- Ingests TDF game log files produced by SM5 laser tag systems
- Stores per-player and per-game stats in a structured Postgres database
- Serves a web interface for browsing games, players, leaderboards, and nightly summaries
- Supports competitions with rounds, matches, standings, and penalties
- Tracks favorite players/games and admin tools for data management

## Monorepo Structure

```
apps/
  web/        Next.js 16 frontend (App Router, shadcn/ui)
  chomper/    TDF file ingestion CLI/service
packages/
  db/         Shared Drizzle ORM schema and query helpers
```

## Tech Stack

- **Runtime:** Node.js 24+
- **Language:** TypeScript (strict mode)
- **Framework:** Next.js 16 (App Router)
- **Database:** Postgres 18, Drizzle ORM
- **UI:** shadcn/ui (Tailwind CSS)
- **Package manager:** pnpm
- **Monorepo:** Turborepo

## Getting Started

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

To ingest a game file:

```bash
pnpm ingest <file.tdf>
```

## License

AGPL-3.0-or-later. Copyright (C) 2015 Russell Lewis.
