FROM oven/bun:1.3.6-alpine AS base
WORKDIR /app

COPY . .
RUN bun install --filter sdk

FROM base AS builder
WORKDIR /app
RUN bun install --filter substream
RUN bun run --filter substream build

FROM oven/bun:1.3.6-alpine
WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/substream/dist /app/packages/substream/dist

COPY packages/substream/geo-substream.spkg /app/

CMD [ "bun", "/app/packages/substream/dist/index.js" ]
