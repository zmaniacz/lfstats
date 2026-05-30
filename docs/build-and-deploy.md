# lfstats Web App — Build & Deploy Reference

This document describes the architecture, configuration, and deployment process for the web app in this monorepo. It exists so that the mental model can be recovered without re-deriving it. Project-specific facts (package names, image names, domain) are concrete; host-specific facts (user names, paths) are abstract.

---

## Overview

The web app is built in **GitHub Actions** on a GitHub-hosted runner, pushed as a Docker image to **GitHub Container Registry (GHCR)**, and deployed by a **self-hosted runner** on the production host. The container talks to **Postgres** on the same host as the web container.

Push to `main` → build runs in CI → deploy runs on the production host → live within a couple of minutes.

---

## Architecture

Three runtimes are involved:

- **GitHub-hosted runner** — Ubuntu container for CI. Builds the Docker image. No exposure to the production network. Triggered by push to `main` that affects the web app or its dependencies.
- **Self-hosted runner** — runs on the production host as a dedicated non-root user under systemd. Picks up the deploy job after the build job succeeds. Authenticates to GHCR with the workflow's short-lived `GITHUB_TOKEN`, pulls the new image, restarts the container, logs out.
- **Production host** — runs the web container, the Postgres container, and the runner. The web container publishes port 3000 to the host. Traefik on a separate host routes `modern.lfstats.com` → `<production-host>:3000` over the LAN.

---

## Repository Layout

```
.
├── apps/
│   ├── chomper/                  # TDF ingestion Lambda (separate AWS deploy)
│   └── web/                      # the Next.js app
│       ├── Dockerfile
│       ├── next.config.ts
│       └── src/
│           ├── auth.ts
│           └── app/
│               └── layout.tsx    # root force-dynamic lives here
├── packages/
│   └── db/                       # shared Drizzle schema + queries
│       └── src/
│           ├── client.ts         # lazy DB handle (db proxy, getDb, initDb)
│           ├── schema.ts
│           └── index.ts          # barrel — re-exports public API
├── .dockerignore                 # at the monorepo root (build context root)
├── .github/workflows/
│   └── build-web.yml
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Deploy Flow

When you push to `main` with changes under `apps/web/**`, `packages/db/**`, `pnpm-lock.yaml`, or the workflow file itself:

1. **Build job** (GitHub-hosted Ubuntu):
   - Checks out the repo (full monorepo, since the Dockerfile builds with the repo root as its context).
   - Logs in to GHCR with `GITHUB_TOKEN` (read+write on packages).
   - Builds `apps/web/Dockerfile`, runs `pnpm turbo build --filter=web` inside the builder stage.
   - Pushes `ghcr.io/zmaniacz/lfstats-web:latest` and a SHA tag.

2. **Deploy job** (self-hosted runner, gated to push-to-main):
   - Logs in to GHCR with `GITHUB_TOKEN` (read-only on packages).
   - `docker compose pull web` in the deploy directory.
   - `docker compose up -d web --remove-orphans` recreates the container with the new image.
   - `docker logout ghcr.io` so no persistent credential lives on the host.

The deploy job has no checkout step and no build steps — it only does the three docker commands. This minimizes what the self-hosted runner ever executes.

---

## Configuration Files

### `apps/web/next.config.ts` — phase-gated standalone config

A function form that returns the full standalone config only during `PHASE_PRODUCTION_BUILD`, and an empty object otherwise. The full config includes `output: "standalone"`, `outputFileTracingRoot` set to the monorepo root, and a matching `turbopack.root`. All three are required for the standalone Docker image to correctly include workspace packages — but they break the dev server in Next 16 + pnpm monorepo + Turbopack (worker-spawn loop, never compiles). Phase-gating gives build what it needs and leaves dev untouched.

### `apps/web/Dockerfile` — multi-stage build

- **Base stage**: Node 24 Alpine with corepack-activated pnpm pinned to the version in the root `package.json`'s `packageManager` field.
- **Builder stage**: copies the whole monorepo (build context is the repo root, set by `context: .` in the workflow), runs `pnpm install --frozen-lockfile`, then `pnpm turbo build --filter=web`. Turbo handles workspace topological order, so `packages/db` is built first if needed.
- **Runner stage**: fresh `node:24-alpine`, copies only the standalone bundle, `.next/static`, and `public/` from the builder. Runs as a non-root `nextjs` user. `ENV HOSTNAME=0.0.0.0` and `ENV PORT=3000` so the standalone server binds where the published port can reach it.

The runner stage doesn't inherit anything from the builder except the explicit `COPY`s, so build-time concerns (placeholder env vars, etc.) never leak into the final image.

### `.dockerignore` — monorepo root

Lives at the repo root, not under `apps/web/`, because the build context is the repo root. Excludes `node_modules`, `.next`, `.turbo`, `.git`, and `.env*` files.

### `packages/db/src/client.ts` — lazy DB handle

The same `client.ts` serves both the web app (DATABASE_URL from env) and Chomper (DATABASE_URL resolved from AWS Secrets Manager, asynchronously). Three exports:

- **`db`** — a Proxy that builds the underlying drizzle instance on first property access from `process.env.DATABASE_URL`. Nothing runs at module import. The web app's query code uses this directly: `db.select(...)`, `db.transaction(...)`, etc.
- **`getDb()`** — synchronous function that returns the _concrete_ drizzle instance (not the Proxy). Required wherever a library type-inspects the database object — specifically the Auth.js Drizzle adapter, which fails with "Unsupported database type" if handed the Proxy because it isn't a real `PgDatabase`.
- **`initDb()`** — async; resolves the URL from env _or_ AWS Secrets Manager and populates the shared singleton. Chomper calls `await initDb()` once at the start of its Lambda handler, before any DB access. The `@aws-sdk/client-secrets-manager` import is a dynamic `import()` inside the secret-resolution path, so it never enters the web app's module graph.

The shared singleton is held on `globalThis` so it survives HMR in dev and is reused across warm Lambda invocations.

### `packages/db/src/index.ts` — barrel

Must re-export `db`, `getDb`, and `initDb` alongside the query functions and schema. When adding a new public export to `client.ts`, the barrel must be updated or the import fails at the consumer (TS error + build error).

### `apps/web/src/auth.ts` — lazy NextAuth init

Uses the function form: `NextAuth(() => ({ ... }))`. The function isn't called at module import (only at request time), which means `DrizzleAdapter(getDb())` doesn't run during `next build`'s page-data collection. Combined with `getDb()` returning a real instance, this eliminates the need for a placeholder `DATABASE_URL` at build time.

The adapter is constructed per-request, which is cheap because `getDb()` returns the cached singleton after first call.

### `apps/web/src/app/layout.tsx` — root force-dynamic

```ts
export const dynamic = "force-dynamic";
```

Cascades to every page in the app. Without this, Next attempts to statically prerender data-driven pages at build, which hits the lazy DB proxy with no DATABASE_URL and throws. Since this is a live-data dashboard where every page reflects DB state, per-request rendering is the correct behavior anyway. Genuinely static pages can override with `export const dynamic = "force-static"` if added later.

### `.github/workflows/build-web.yml`

Two jobs:

- **`build`** — `runs-on: ubuntu-latest`. Standard buildx + login + metadata + build-push using the official Docker actions. Path filter limits triggers to changes in `apps/web/**`, `packages/db/**`, `pnpm-lock.yaml`, and the workflow itself.

- **`deploy`** — `runs-on: [self-hosted, lfstats-deploy]`, `needs: build`, gated by `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`. Targets the self-hosted runner by its `lfstats-deploy` label, not just any self-hosted runner. The `if` guard ensures the deploy never runs for any event other than a maintainer push to main, regardless of how the workflow might be triggered.

### `docker-compose.yml` (on the deploy host, not in the repo)

Single `web` service. Pulls from `ghcr.io/zmaniacz/lfstats-web:latest`. Uses `env_file` to inject auth secrets verbatim and `environment` block to assemble `DATABASE_URL` via `${DB_PASSWORD}` interpolation from the local `.env`. `host.docker.internal:host-gateway` lets the web container reach Postgres on the same host's published port. Publishes 3000 to the host so Traefik on a separate host can reach it.

Auth-related env vars: `AUTH_TRUST_HOST=true` and explicit `AUTH_URL=https://modern.lfstats.com` because Traefik terminates TLS and forwards plain HTTP — Auth.js needs to trust the forwarded headers and know its real public URL.

### `.env` (on the deploy host, never committed)

Contains: `DB_PASSWORD`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. Mode 660, owned by the runner user with the admin user added to the runner's group.

---

## Deploy Host Setup (First-Time)

### Runner user

1. Create a dedicated, non-root system user (e.g., `gh-runner`). Add it to the `docker` group for socket access.
2. As that user, download and unpack the GitHub Actions runner under its home directory.
3. Register the runner with the repo via `./config.sh --url ... --token ... --name lfstats-deploy --labels self-hosted,linux,x64,lfstats-deploy --unattended --replace`. The token comes from the repo's Settings → Actions → Runners → New self-hosted runner page and expires within an hour.
4. Install as a systemd service via the runner package's `./svc.sh install <runner-user>` (run as root). Then `./svc.sh start`. The generated unit has `Restart=always` baked in.

### Deploy directory

Located at `/opt/<app-name>/` (convention) or any path of your choosing. Permissions:

- Owner: runner user
- Group: runner user's primary group
- Directory mode: **2770** (rwx for owner and group, setgid bit so new files inherit the group)
- File modes: **660** for `docker-compose.yml` and `.env`

The setgid bit is non-obvious but important: without it, files created by the admin user in this directory get the admin user's primary group, and the runner loses read access to anything you add.

### Admin access for manual operations

Add the admin user to the runner's group:

```
sudo usermod -aG <runner-group> <admin-user>
```

Effective in new shells (or after `newgrp <runner-group>`). The admin user can now read/edit files in the deploy directory and run `docker compose` commands directly.

### GHCR auth

The deploy job authenticates to GHCR per-job using `GITHUB_TOKEN` and logs out at the end. No persistent credential needs to live on the host for the automated deploy.

However, the **first** manual `docker compose pull` (if you do one before the first automated deploy) needs the daemon to be logged in. As the admin user (or runner user): `echo $TOKEN | docker login ghcr.io -u zmaniacz --password-stdin`. After the first automated deploy runs successfully, subsequent pulls go through the workflow's per-job auth and the persistent login isn't needed.

### Repo security settings

Settings → Actions → General:

- **Fork pull request workflows from outside collaborators** → "Require approval for all outside collaborators" + first-time contributors approval. Closes the entire class of fork-PR-runs-on-your-runner attack regardless of future workflow changes.
- **Workflow permissions** → "Read repository contents and packages permissions" (restrictive default). Workflows raise specific permissions explicitly where needed.

---

## Manual Operations

### Pull and restart manually

As the admin user:

```
cd <deploy-dir>
docker compose pull web
docker compose up -d web
```

### View container logs

```
docker compose logs -f web
```

### View runner logs

```
sudo journalctl -u actions.runner.<owner>-<repo>.<runner-name>.service -f
```

### Edit env vars

Edit `.env` in the deploy directory. Then `docker compose up -d web` to recreate the container with the new env. Compose detects env changes and recreates automatically.

### Re-register the runner

If the runner needs to be re-registered (token rotation, replacement, etc.):

```
cd <runner-install-dir>
sudo ./svc.sh stop
sudo ./svc.sh uninstall
sudo -u <runner-user> ./config.sh remove --token <REMOVAL_TOKEN>
sudo -u <runner-user> ./config.sh --url ... --token <NEW_REG_TOKEN> --name lfstats-deploy --labels self-hosted,linux,x64,lfstats-deploy --unattended --replace
sudo ./svc.sh install <runner-user>
sudo ./svc.sh start
```

Removal and registration tokens come from the repo's Settings → Actions → Runners page.

---

## Key Design Decisions

This section documents _why_ the configuration is the way it is, so future changes don't undo constraints we've already hit.

### Why `next.config.ts` is phase-gated

`output: "standalone"`, `outputFileTracingRoot`, and `turbopack.root` together cause the dev server to enter a worker-spawn loop in Next 16 + pnpm + Turbopack monorepos. They're essential for the standalone Docker image to include workspace packages correctly, but harmful for `next dev`. Phase-gating applies them only at `PHASE_PRODUCTION_BUILD`.

### Why the DB client is lazy

Top-level `await` at module load caused `next build`'s page-data collection to fail (collection imports the module). Making `db` a Proxy defers connection setup to first property access. The dual `db` (Proxy for queries) / `getDb()` (real instance for type-inspecting libraries) / `initDb()` (async for Chomper's Secrets Manager path) export shape covers both consumers without forcing either to refactor.

### Why `force-dynamic` at the root layout (not per-page)

Almost every page in this app renders DB data. Per-page directives would mean adding the same line to every file. The root layout cascades the directive everywhere; static pages can opt back in individually if added later. Trades up-front Partial Prerendering optimization for one-line simplicity, which is the right call for a live-data dashboard.

### Why NextAuth uses lazy/function init

`DrizzleAdapter(db)` type-inspects the instance at construction. With the function form `NextAuth(() => ({ ... }))`, the config (and therefore the adapter) is built per-request at runtime, not at module import — so it doesn't run during build's page-data collection and doesn't need a placeholder `DATABASE_URL` at build.

### Why the Auth adapter uses `getDb()` not `db`

The Drizzle adapter determines the database dialect (Postgres vs MySQL vs SQLite) by inspecting the instance's type and constructor chain. The Proxy isn't a real `PgDatabase`, so detection falls through and the adapter throws "Unsupported database type (object)". `getDb()` returns the concrete instance the adapter can introspect.

### Why the deploy directory uses setgid 2770

The runner user owns the deploy directory so the systemd service can manage it without sudo. The admin user joins the runner's group for manual access. The setgid bit on the directory ensures any file created inside inherits the runner's group automatically — without it, files created by the admin user get the admin's primary group and the runner loses read access.

### Why the deploy job has no checkout step

Minimal attack surface. The deploy job runs on the self-hosted runner — the only code it ever executes is the three lines in the workflow file (`docker compose pull`, `up -d`, `docker logout`). No repo code is checked out, no third-party actions beyond `docker/login-action`, no build steps that could be influenced by repo content. Even if the workflow file were ever modified maliciously and merged to main, what runs on the host is bounded.

### Why the deploy job has an explicit `if:` guard

`if: github.event_name == 'push' && github.ref == 'refs/heads/main'` is defense in depth. The workflow's `on:` triggers already restrict execution, but the explicit `if` on the deploy job means even if a future trigger were added (or the workflow were dispatched via `workflow_dispatch` on a branch), the deploy step specifically only runs against a push to main — which only people with write access to the repo can perform.

---

## Common Build Errors

### "DATABASE_URL is not set" during page render

A page is being statically prerendered at build and querying the DB during render. The lazy proxy throws because there's no `DATABASE_URL` at build. Fix: confirm the root layout's `dynamic = "force-dynamic"` is in place; if the failing page is a special case (overrode the layout's directive), add `force-dynamic` to that page specifically.

### "Unsupported database type (object)" during page data collection

The Auth.js Drizzle adapter is receiving the Proxy `db` instead of the real instance. In the auth config, ensure it's `DrizzleAdapter(getDb(), { ... })` and that the import is `getDb`, not `db`.

### "Cannot find export X from @lfstats/db"

A new export was added to `packages/db/src/client.ts` (or another internal file) but the barrel (`packages/db/src/index.ts`) wasn't updated. Add the missing re-export to the barrel.

### Dev server spawns excessive node processes / never compiles

The phase guard in `next.config.ts` was bypassed and the standalone settings are being applied to dev. Verify the config function only returns the full settings object when `phase === PHASE_PRODUCTION_BUILD`.

### "Failed to collect configuration for /<route>"

A route module's top-level imports are triggering DB resolution. The lazy proxy should prevent this; if it's happening, check that `client.ts` hasn't been reverted to a top-level-await form.

### Build succeeds but the container fails at startup with auth callback errors

Either `AUTH_URL` doesn't match the actual public URL, or `AUTH_TRUST_HOST=true` is missing. The container sees `http://` requests on `:3000` with forwarded headers; without `trustHost`, Auth.js doesn't honor those headers and generates callback URLs against the internal address.

---

## Adding New Features

### New data-driven page

Just write it under `apps/web/src/app/`. It inherits `force-dynamic` from the root layout, so DB queries at render time work against the real runtime environment. No additional configuration.

### New static page

Add `export const dynamic = "force-static"` to the page to opt back into static rendering, since the root layout otherwise forces dynamic.

### New workspace package

1. Add the package directory under `packages/`. It's picked up by the `apps/*` + `packages/*` workspace globs in `pnpm-workspace.yaml`.
2. Add its path to the `paths:` filter in `.github/workflows/build-web.yml` so changes to it trigger rebuilds.
3. If the package ships raw TypeScript (not pre-compiled), add it to `transpilePackages` in `next.config.ts`.
4. The Dockerfile's `pnpm turbo build --filter=web` automatically handles workspace dependencies — no Dockerfile change needed.

### New shared DB export

1. Add it to the appropriate file in `packages/db/src/`.
2. **Re-export it from `packages/db/src/index.ts`**. This is the step that's easy to forget and causes "cannot find export" errors at both build and in the IDE.

### New env var the app needs

1. Add it to `.env` on the deploy host. Mode 660.
2. Add it to the `environment` block in `docker-compose.yml` on the deploy host (with `${VAR}` interpolation if it should come from `.env`) or to the `env_file` list if it should be passed through verbatim.
3. `docker compose up -d web` to recreate the container with the new env.
4. No CI/build changes needed unless the build also requires the var (rare — most env vars are runtime-only since Next doesn't inline non-`NEXT_PUBLIC_` vars).

### New runner

Repeat the runner installation steps under a new labeled runner if you want job-level routing. The deploy job's `runs-on: [self-hosted, lfstats-deploy]` targets a specific label, so unrelated runners don't pick up the deploy.
