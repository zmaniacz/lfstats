# Scheduled-job runner for @lfstats/db.
#
# The web image is a Next.js *standalone* build: it contains only what Next
# traced for serving, so it has neither the scripts under src/scripts nor tsx to
# run them. This image exists to run those maintenance jobs — currently the
# rating recompute — against the same database over the same Docker network.
#
# Deliberately mirrors the install steps in apps/web/Dockerfile so the two stay
# in sync; it just stops before the Next build instead of producing a server.
#
# Run one-shot, with the environment supplying DATABASE_URL:
#   docker compose run --rm jobs
#
# Override the command to run a different script:
#   docker compose run --rm jobs pnpm exec tsx src/scripts/backfill-solo-format.ts

FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile

COPY . .

WORKDIR /app/packages/db

# No --env-file here, unlike the package.json script: in a container the
# connection details come from the environment, not a checked-out .env.
CMD ["pnpm", "exec", "tsx", "src/scripts/recalc-rating.ts"]
