FROM node:18-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY . .
RUN pnpm install --filter sdk

FROM base AS builder
WORKDIR /app
RUN pnpm install --filter substream
RUN pnpm run --filter substream build

FROM rust:1.79-alpine AS sqlx-builder
WORKDIR /app
RUN apk update && apk add --no-cache musl-dev
RUN cargo install sqlx-cli --no-default-features --features rustls,postgres

FROM node:18-alpine
WORKDIR /app

# sqlx
COPY --from=sqlx-builder /usr/local/cargo/bin/sqlx /app/sqlx

# migrations
COPY packages/substream/migrations /app/migrations

# copy deps and dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/substream/dist /app/packages/substream/dist

COPY packages/substream/geo-substream.spkg /app/

# if $START_BLOCK is set - we always start from $START_BLOCK
# otherwise we start from the last block in the database
ENTRYPOINT ["sh", "-c", " \
  /app/sqlx migrate run --source /app/migrations -D ${DATABASE_URL} && \
  if [ -n \"${START_BLOCK}\" ]; then \
  node /app/packages/substream/dist/index.js --start-block ${START_BLOCK}; \
  else \
  node /app/packages/substream/dist/index.js; \
  fi \
  "]
