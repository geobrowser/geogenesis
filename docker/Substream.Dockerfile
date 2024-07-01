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

FROM node:18-alpine
WORKDIR /app

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/substream/dist /app/packages/substream/dist

COPY packages/substream/geo-substream.spkg /app/

CMD [ "node", "/app/packages/substream/dist/index.js" ]
