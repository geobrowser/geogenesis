FROM oven/bun:1.3.6-alpine AS base
WORKDIR /app

COPY . .
RUN bun install --filter sdk

FROM base AS builder
WORKDIR /app
RUN bun install --filter api
RUN bun run --filter api build

FROM oven/bun:1.3.6-alpine
WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/api/dist /app/packages/api/dist
COPY --from=builder /app/packages/api/node_modules /app/packages/api/node_modules

CMD ["bun", "/app/packages/api/dist/server.js"]
