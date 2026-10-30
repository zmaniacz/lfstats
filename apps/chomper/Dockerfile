# Chomper ingest worker (src/worker.ts): a single esbuild bundle on a bare Node
# image. Built from the repo root, like apps/web/Dockerfile.

FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/chomper/package.json ./apps/chomper/
COPY packages/db/package.json ./packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter chomper build:worker

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Matches the Lambda runtime.
ENV TZ=UTC
COPY --from=builder /app/apps/chomper/dist-worker/worker.mjs ./
USER node
CMD ["node", "worker.mjs"]
