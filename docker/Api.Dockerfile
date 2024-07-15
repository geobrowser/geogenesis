FROM node:18-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --filter sdk

FROM base AS builder
WORKDIR /app
RUN pnpm install --filter api
RUN pnpm run --filter api build

FROM node:18-alpine
WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/api/dist /app/packages/api/dist
COPY --from=builder /app/packages/api/node_modules /app/packages/api/node_modules

ENTRYPOINT ["sh", "-c", "node /app/packages/api/dist/server.js"]